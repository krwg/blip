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
  peerPrefersPlaintextCompat,
  shouldSoftFailHandshake,
} from './mesh-compat.js';
import {
  BlipErrorCode,
  createBlipError,
  classifyBlipError,
  logBlipError,
  destroySocketTagged,
  formatPeerDialDebug,
  isSocketCloseFamily,
} from '../shared/blip-errors.js';

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
    const tagged = Number(socket?._blipCloseCode);
    const code = Number.isFinite(tagged)
      ? tagged
      : pending.handshakeSent
        ? BlipErrorCode.SOCKET_CLOSED_DURING_WAIT
        : BlipErrorCode.SOCKET_CLOSED_BEFORE_WRITE;
    const detail =
      socket?._blipCloseDetail ||
      (pending.handshakeSent
        ? 'Socket closed while waiting for handshake ack'
        : 'Socket closed before handshake write completed');
    pending.reject(createBlipError(code, detail));
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
      destroySocketTagged(
        socket,
        BlipErrorCode.SOCKET_CLOSED_HANDSHAKE_BAD,
        'Inbound mesh-handshake failed verify'
      );
      return true;
    }
    if (isPeerBlocked(config, v.from)) {
      destroySocketTagged(
        socket,
        BlipErrorCode.SOCKET_CLOSED_PEER_BLOCKED,
        `Blocked peer #${v.from} handshake`
      );
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
      const err = createBlipError(
        BlipErrorCode.HANDSHAKE_PUBKEY_MISMATCH,
        `TOFU pubkey mismatch for #${v.from}`
      );
      logBlipError(err, 'inbound handshake');
      destroySocketTagged(
        socket,
        BlipErrorCode.HANDSHAKE_PUBKEY_MISMATCH,
        err.message
      );
      return true;
    }
    if (accept.rebind) {
      console.warn(`[BLIP E${BlipErrorCode.HANDSHAKE_PUBKEY_MISMATCH}/rebind] TOFU rebind for #${v.from}`);
    }

    session.peerId = v.from;
    session.meshPubkey = v.meshPubkey;

    const legacyPeer = !v.encryptedCapable;
    const ackBuilt = buildHandshakeAckPacket(
      config,
      config.blipId,
      v.meshPubkey,
      null,
      null,
      { legacy: legacyPeer }
    );
    if (v.encryptedCapable) {
      armSessionCipher(session, ackBuilt.ecdhPrivateKey, v.ecdhPubkey, 'responder');
    } else {
      session.encrypted = false;
      session.cipher = null;
      session.compat = true;
    }

    session.authenticated = true;
    tcpServer?.registerConnection(v.from, socket);
    notePeerChannel(discovery, v.from, session.encrypted);
    if (legacyPeer) discovery?.notePeerCompat?.(v.from, true);

    const nextConfig = rememberPeerPubkey(config, v.from, v.meshPubkey);
    if (nextConfig !== config) onConfigPatch?.({ knownPeerKeys: nextConfig.knownPeerKeys });

    socket.write(JSON.stringify(ackBuilt.packet) + '\n');
    return true;
  }

  if (msg.type === 'mesh-handshake-ack') {
    const pending = outboundWait.get(socket);
    const v = verifyHandshakePacket(msg, pending?.expectedPeerId);
    if (!v.ok) {
      const err = createBlipError(
        BlipErrorCode.HANDSHAKE_INVALID_ACK,
        'Invalid handshake ack'
      );
      pending?.reject(err);
      destroySocketTagged(socket, BlipErrorCode.HANDSHAKE_INVALID_ACK, err.message);
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
  const legacy = !!opts.legacy;
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
      const err = createBlipError(
        BlipErrorCode.HANDSHAKE_TIMEOUT,
        `Handshake timeout for #${expectedPeerId}`
      );
      err.code = 'HANDSHAKE_TIMEOUT';
      if (!softFail) {
        destroySocketTagged(
          socket,
          BlipErrorCode.SOCKET_CLOSED_LOCAL_TIMEOUT,
          err.message
        );
      }
      reject(err);
    }, HANDSHAKE_TIMEOUT_MS);

    outboundWait.set(socket, {
      expectedPeerId,
      handshakeSent: false,
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
      reject(
        createBlipError(BlipErrorCode.PEER_NOT_FOUND, `Peer #${expectedPeerId} not online`)
      );
      return;
    }

    if (socket.destroyed) {
      clearTimeout(timer);
      outboundWait.delete(socket);
      reject(
        createBlipError(
          BlipErrorCode.SOCKET_CLOSED_BEFORE_WRITE,
          `Socket already destroyed before handshake write to #${expectedPeerId}`
        )
      );
      return;
    }

    let built;
    try {
      built = buildHandshakePacket(config, config.blipId, { legacy });
    } catch (err) {
      clearTimeout(timer);
      outboundWait.delete(socket);
      reject(
        createBlipError(
          BlipErrorCode.HANDSHAKE_SEND_FAILED,
          err?.message || 'buildHandshakePacket failed',
          err
        )
      );
      return;
    }
    session.ecdhPrivateKey = built.ecdhPrivateKey;
    if (legacy) {
      session.encrypted = false;
      session.cipher = null;
      session.compat = true;
    }
    const waiter = outboundWait.get(socket);
    if (waiter) waiter.handshakeSent = true;
    sendOnSocket(socket, built.packet).catch((err) => {
      clearTimeout(timer);
      outboundWait.delete(socket);
      reject(
        createBlipError(
          BlipErrorCode.HANDSHAKE_SEND_FAILED,
          err?.message || 'Handshake send failed',
          err
        )
      );
    });
  });
}

export function applyOutboundCompatSession(
  socket,
  expectedPeerId,
  discovery,
  registerConnection
) {
  const session =
    getSocketSession(socket) || initInboundSession(socket, socket.remoteAddress);
  markOutboundCompatSession(session, expectedPeerId);
  registerConnection?.(expectedPeerId, socket);
  notePeerChannel(discovery, expectedPeerId, false);
  discovery?.notePeerCompat?.(expectedPeerId, true);
  const info = createBlipError(
    BlipErrorCode.COMPAT_PLAINTEXT,
    `Plaintext compat session with #${expectedPeerId}`
  );
  logBlipError(info, 'compat');
  return expectedPeerId;
}

/**
 * Handshake when possible; if peer cannot speak Morse handshake and unencrypted mesh
 * is allowed, use plaintext compat (skip handshake for known-legacy — they often RST).
 */
export async function performOutboundHandshakeOrCompat(
  socket,
  config,
  expectedPeerId,
  discovery,
  { registerConnection, forcePlaintext = false } = {}
) {
  const peer = discovery?.getPeers()?.find((p) => p.blipId === expectedPeerId);
  const gate = assertMayUseUnencryptedPeer(config, peer);
  if (!gate.ok && peerPrefersPlaintextCompat(peer)) {
    throw createBlipError(BlipErrorCode.UNENCRYPTED_DISABLED, gate.error);
  }

  const softFail = shouldSoftFailHandshake(config, peer);
  const legacy = peerPrefersPlaintextCompat(peer);
  console.error(
    `[BLIP E${legacy ? BlipErrorCode.PEER_CLASSIFIED_LEGACY : BlipErrorCode.PEER_CLASSIFIED_MODERN}/${legacy ? 'LEGACY' : 'MODERN'}] dial ${formatPeerDialDebug(peer)} softFail=${softFail} forcePlaintext=${!!forcePlaintext}`
  );

  // BLIP ≤1.1.x requires mesh-handshake v1 (no ECDH). Skipping auth makes them
  // drop all frames; sending Morse v2 makes them destroy the socket ("Socket closed").
  if (forcePlaintext || (softFail && legacy)) {
    if (socket.destroyed) {
      throw createBlipError(
        BlipErrorCode.HANDSHAKE_PEER_CLOSED,
        `Cannot open legacy handshake on destroyed socket for #${expectedPeerId}`
      );
    }
    try {
      await performOutboundHandshake(socket, config, expectedPeerId, discovery, {
        softFail: false,
        legacy: true,
      });
      const session = getSocketSession(socket);
      if (session) {
        session.encrypted = false;
        session.cipher = null;
        session.compat = true;
        session.ecdhPrivateKey = null;
      }
      registerConnection?.(expectedPeerId, socket);
      notePeerChannel(discovery, expectedPeerId, false);
      discovery?.notePeerCompat?.(expectedPeerId, true);
      logBlipError(
        createBlipError(
          BlipErrorCode.COMPAT_PLAINTEXT,
          `Legacy v1 handshake OK with #${expectedPeerId}`
        ),
        'legacy-handshake'
      );
      return expectedPeerId;
    } catch (err) {
      const classified = classifyBlipError(err);
      logBlipError(classified, `legacy handshake #${expectedPeerId}`);
      throw createBlipError(
        BlipErrorCode.ENSURE_HANDSHAKE_FAILED,
        `Legacy v1 handshake failed for #${expectedPeerId}`,
        classified
      );
    }
  }

  try {
    return await performOutboundHandshake(socket, config, expectedPeerId, discovery, {
      softFail,
    });
  } catch (err) {
    const classified = classifyBlipError(err);
    // Misclassified modern peer that is actually ≤1.1.x: retry with v1 handshake.
    if (isUnencryptedMeshAllowed(config) && (socket.destroyed || isSocketCloseFamily(classified.blipCode))) {
      const closed = createBlipError(
        BlipErrorCode.HANDSHAKE_PEER_CLOSED,
        `Peer #${expectedPeerId} closed during v2 handshake (will retry legacy v1)`,
        classified
      );
      closed.needCompatReconnect = true;
      logBlipError(closed, 'need legacy v1 reconnect');
      throw closed;
    }
    if (!softFail) {
      logBlipError(classified, `handshake #${expectedPeerId}`);
      throw createBlipError(
        BlipErrorCode.ENSURE_HANDSHAKE_FAILED,
        `Handshake failed for #${expectedPeerId}`,
        classified
      );
    }
    if (socket.destroyed) {
      const closed = createBlipError(
        BlipErrorCode.HANDSHAKE_PEER_CLOSED,
        `Peer #${expectedPeerId} closed TCP during handshake`,
        classified
      );
      closed.needCompatReconnect = true;
      logBlipError(closed, 'need compat reconnect');
      throw closed;
    }
    const session = getSocketSession(socket);
    if (!session) {
      throw createBlipError(
        BlipErrorCode.SESSION_MISSING,
        `No session after handshake failure for #${expectedPeerId}`,
        classified
      );
    }
    return applyOutboundCompatSession(socket, expectedPeerId, discovery, registerConnection);
  }
}

export {
  tryLegacyCompatAuth,
  assertMayUseUnencryptedPeer,
  isUnencryptedMeshAllowed,
  peerPrefersPlaintextCompat,
  shouldSoftFailHandshake,
};
