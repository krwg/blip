import { sendOnSocket } from './tcp-client.js';
import { normalizePeerIp } from './config.js';
import {
  buildHandshakeAckPacket,
  buildHandshakePacket,
  rememberPeerPubkey,
  pubkeyMatchesKnown,
  verifyHandshakePacket,
} from './mesh-identity.js';
import {
  createMeshCipher,
  deriveDirectionalKeys,
} from './mesh-session-crypto.js';
import { isPeerBlocked } from './trust-policy.js';

const sessions = new Map();

const outboundWait = new Map();

const HANDSHAKE_TIMEOUT_MS = 8000;

export function getSocketSession(socket) {
  return sessions.get(socket);
}

export function initInboundSession(socket, remoteIp) {
  const session = {
    remoteIp: normalizePeerIp(remoteIp),
    peerId: null,
    authenticated: false,
    meshPubkey: null,
    encrypted: false,
    cipher: null,
    ecdhPrivateKey: null,
  };
  sessions.set(socket, session);
  return session;
}

export function clearSocketSession(socket) {
  sessions.delete(socket);
  const pending = outboundWait.get(socket);
  if (pending) {
    outboundWait.delete(socket);
    pending.reject(new Error('Socket closed'));
  }
}

export function isSocketAuthenticated(socket) {
  return !!sessions.get(socket)?.authenticated;
}

export function isSocketEncrypted(socket) {
  return !!sessions.get(socket)?.encrypted;
}

export function peerIpMatchesDiscovery(discovery, blipId, remoteIp) {
  const peer = discovery?.getPeers()?.find((p) => p.blipId === blipId);
  if (!peer?.online) return false;
  return normalizePeerIp(peer.ip) === normalizePeerIp(remoteIp);
}

function armSessionCipher(session, privateKey, peerEcdhPubkey, role) {
  if (!privateKey || !peerEcdhPubkey) {
    session.encrypted = false;
    session.cipher = null;
    return;
  }
  try {
    const keys = deriveDirectionalKeys(privateKey, peerEcdhPubkey, role);
    session.cipher = createMeshCipher(keys.sendKey, keys.recvKey);
    session.encrypted = true;
  } catch (err) {
    console.warn('[Handshake] ECDH derive failed:', err?.message || err);
    session.encrypted = false;
    session.cipher = null;
  }
  session.ecdhPrivateKey = null;
}

function notePeerChannel(discovery, peerId, encrypted) {
  discovery?.notePeerChannelCrypto?.(peerId, encrypted);
}

export function handleMeshHandshakeMessage(msg, socket, ctx) {
  const { config, discovery, tcpServer, onConfigPatch } = ctx;
  const session = sessions.get(socket) || initInboundSession(socket, socket.remoteAddress);

  if (msg.type === 'mesh-handshake') {
    const v = verifyHandshakePacket(msg);
    if (!v.ok) {
      socket.destroy();
      return true;
    }
    if (isPeerBlocked(config, v.from)) {
      socket.destroy();
      return true;
    }
    if (!peerIpMatchesDiscovery(discovery, v.from, session.remoteIp)) {
      console.warn(
        `[Handshake] IP mismatch for #${v.from} from ${session.remoteIp} — using observed route`,
      );
      discovery?.noteObservedPeerIp?.(v.from, session.remoteIp);
    }
    if (!pubkeyMatchesKnown(config, v.from, v.meshPubkey)) {
      console.warn(`[Handshake] pubkey mismatch for #${v.from}`);
      socket.destroy();
      return true;
    }

    session.peerId = v.from;
    session.meshPubkey = v.meshPubkey;

    const ackBuilt = buildHandshakeAckPacket(config, config.blipId, v.meshPubkey);
    if (v.encryptedCapable) {
      armSessionCipher(session, ackBuilt.ecdhPrivateKey, v.ecdhPubkey, 'responder');
    } else {
      session.encrypted = false;
      session.cipher = null;
    }

    session.authenticated = true;
    tcpServer?.registerConnection(v.from, socket);
    notePeerChannel(discovery, v.from, session.encrypted);

    const nextConfig = rememberPeerPubkey(config, v.from, v.meshPubkey);
    if (nextConfig !== config) onConfigPatch?.({ knownPeerKeys: nextConfig.knownPeerKeys });

    socket.write(JSON.stringify(ackBuilt.packet) + '\n');
    return true;
  }

  if (msg.type === 'mesh-handshake-ack') {
    const pending = outboundWait.get(socket);
    const v = verifyHandshakePacket(msg, pending?.expectedPeerId);
    if (!v.ok) {
      pending?.reject(new Error('Invalid handshake ack'));
      socket.destroy();
      return true;
    }
    if (!peerIpMatchesDiscovery(discovery, v.from, session.remoteIp)) {
      console.warn(
        `[Handshake] IP mismatch for #${v.from} from ${session.remoteIp} — using observed route`,
      );
      discovery?.noteObservedPeerIp?.(v.from, session.remoteIp);
    }
    session.peerId = v.from;
    session.meshPubkey = v.meshPubkey;

    if (v.encryptedCapable && session.ecdhPrivateKey) {
      armSessionCipher(session, session.ecdhPrivateKey, v.ecdhPubkey, 'initiator');
    } else {
      session.encrypted = false;
      session.cipher = null;
      session.ecdhPrivateKey = null;
    }

    session.authenticated = true;
    tcpServer?.registerConnection(v.from, socket);
    notePeerChannel(discovery, v.from, session.encrypted);

    const nextConfig = rememberPeerPubkey(config, v.from, v.meshPubkey);
    if (nextConfig !== config) onConfigPatch?.({ knownPeerKeys: nextConfig.knownPeerKeys });

    outboundWait.delete(socket);
    pending?.resolve(v.from);
    return true;
  }

  return false;
}

export function assertAuthenticated(socket, msg) {
  const session = sessions.get(socket);
  if (!session?.authenticated) return { ok: false, reason: 'auth' };
  const from = Number(msg?.from);
  if (!Number.isFinite(from) || from !== session.peerId) return { ok: false, reason: 'from' };
  return { ok: true, session, from };
}

export function performOutboundHandshake(socket, config, expectedPeerId, discovery) {
  const remoteIp = normalizePeerIp(socket.remoteAddress);
  const session = initInboundSession(socket, remoteIp);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      outboundWait.delete(socket);
      reject(new Error('Handshake timeout'));
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    }, HANDSHAKE_TIMEOUT_MS);

    outboundWait.set(socket, {
      expectedPeerId,
      resolve: (id) => {
        clearTimeout(timer);
        resolve(id);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });

    const peer = discovery?.getPeers()?.find((p) => p.blipId === expectedPeerId);
    if (!peer?.online) {
      clearTimeout(timer);
      outboundWait.delete(socket);
      reject(new Error('Peer not found'));
      return;
    }

    const built = buildHandshakePacket(config, config.blipId);
    session.ecdhPrivateKey = built.ecdhPrivateKey;
    sendOnSocket(socket, built.packet).catch((err) => {
      clearTimeout(timer);
      outboundWait.delete(socket);
      reject(err);
    });
  });
}
