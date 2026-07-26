import { sendOnSocket } from './tcp-client.js';
import { normalizePeerIp } from './config.js';
import {
  buildHandshakeAckPacket,
  buildHandshakePacket,
  rememberPeerPubkey,
  acceptPeerPubkey,
  verifyHandshakePacket,
} from './mesh-identity.js';
import {
  createMeshCipher,
  deriveDirectionalKeys,
} from './mesh-session-crypto.js';
import { isPeerBlocked } from './trust-policy.js';
import {
  tryLegacyCompatAuth,
  markOutboundCompatSession,
  assertMayUseUnencryptedPeer,
  isUnencryptedMeshAllowed,
} from './mesh-compat.js';

const sessions = new Map();

const outboundWait = new Map();

const HANDSHAKE_TIMEOUT_MS = 8000;

export function getSocketSession(socket) {
  return sessions.get(socket);
}

export function initInboundSession(socket, remoteIp) {
  const existing = sessions.get(socket);
  if (existing) {
    if (remoteIp) existing.remoteIp = normalizePeerIp(remoteIp);
    return existing;
  }
  const session = {
    remoteIp: normalizePeerIp(remoteIp),
    peerId: null,
    authenticated: false,
    meshPubkey: null,
    encrypted: false,
    cipher: null,
    ecdhPrivateKey: null,
    compat: false,
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
    const discoveryPeer = discovery?.getPeers()?.find((p) => p.blipId === v.from);
    const accept = acceptPeerPubkey(config, v.from, v.meshPubkey, discoveryPeer);
    if (!accept.ok) {
      console.warn(`[Handshake] pubkey mismatch for #${v.from}`);
      socket.destroy();
      return true;
    }
    if (accept.rebind) {
      console.warn(`[Handshake] TOFU rebind for #${v.from} from verified announce`);
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

export function performOutboundHandshake(socket, config, expectedPeerId, discovery, opts = {}) {
  const softFail = !!opts.softFail;
  const remoteIp = normalizePeerIp(socket.remoteAddress);
  const session = initInboundSession(socket, remoteIp);

  if (session.authenticated && (!expectedPeerId || session.peerId === expectedPeerId)) {
    return Promise.resolve(session.peerId ?? expectedPeerId);
  }

  const existingWait = outboundWait.get(socket);
  if (existingWait) {
    return new Promise((resolve, reject) => {
      const prevResolve = existingWait.resolve;
      const prevReject = existingWait.reject;
      existingWait.expectedPeerId = expectedPeerId ?? existingWait.expectedPeerId;
      existingWait.resolve = (id) => {
        prevResolve(id);
        resolve(id);
      };
      existingWait.reject = (err) => {
        prevReject(err);
        reject(err);
      };
    });
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      outboundWait.delete(socket);
      const err = new Error('Handshake timeout');
      err.code = 'HANDSHAKE_TIMEOUT';
      if (!softFail) {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
      reject(err);
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

/**
 * Handshake when possible; if peer never answers and unencrypted mesh is allowed,
 * fall back to plaintext compat session (older BLIP builds).
 */
export async function performOutboundHandshakeOrCompat(
  socket,
  config,
  expectedPeerId,
  discovery,
  { registerConnection } = {}
) {
  const peer = discovery?.getPeers()?.find((p) => p.blipId === expectedPeerId);
  const gate = assertMayUseUnencryptedPeer(config, peer);
  if (!gate.ok && (peer?.meshLegacy || peer?.meshCompat)) {
    throw new Error(gate.error);
  }

  const softFail =
    isUnencryptedMeshAllowed(config) &&
    (!!peer?.meshLegacy ||
      !!peer?.meshCompat ||
      Number(peer?.meshProto || 0) < 2 ||
      !peer?.meshPubkey);
  try {
    return await performOutboundHandshake(socket, config, expectedPeerId, discovery, {
      softFail,
    });
  } catch (err) {
    const closed =
      err?.message === 'Socket closed' || err?.code === 'HANDSHAKE_SOCKET_CLOSED';
    const failure = closed
      ? Object.assign(new Error('Peer closed handshake (key changed or rejected)'), {
          code: 'HANDSHAKE_SOCKET_CLOSED',
          cause: err,
        })
      : err;
    if (!softFail || socket.destroyed) throw failure;
    const session = getSocketSession(socket);
    if (!session) throw failure;
    markOutboundCompatSession(session, expectedPeerId);
    registerConnection?.(expectedPeerId, socket);
    notePeerChannel(discovery, expectedPeerId, false);
    discovery?.notePeerCompat?.(expectedPeerId, true);
    console.warn(
      `[Handshake] compat plaintext session with #${expectedPeerId}: ${failure?.message || failure}`
    );
    return expectedPeerId;
  }
}

export { tryLegacyCompatAuth, assertMayUseUnencryptedPeer, isUnencryptedMeshAllowed };
