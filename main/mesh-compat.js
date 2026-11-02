/**
 * Cross-version mesh compatibility (plaintext TCP when peer cannot encrypt).
 * Encryption is still used automatically whenever both sides support meshProto ≥ 2.
 */

import { normalizePeerIp } from './config.js';

export function isUnencryptedMeshAllowed(config) {
  return config?.allowUnencryptedMesh !== false;
}

/**
 * True when discovery says this peer will not complete Morse mesh-handshake.
 * Older builds often **destroy** the TCP socket on unknown `mesh-handshake` frames.
 */
export function peerPrefersPlaintextCompat(peer) {
  if (!peer) return true;
  if (peer.meshLegacy || peer.meshCompat) return true;
  if (!peer.meshPubkey) return true;
  // Unverified announce: do not assume encrypted handshake will work.
  if (peer.meshVerified === false) return true;
  return Number(peer.meshProto || 0) < 2;
}

export function shouldSoftFailHandshake(config, peer) {
  return isUnencryptedMeshAllowed(config) && peerPrefersPlaintextCompat(peer);
}

/**
 * Refuse starting a session to a known-legacy / unencrypted peer when user opted out.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertMayUseUnencryptedPeer(config, peer) {
  if (isUnencryptedMeshAllowed(config)) return { ok: true };
  if (peer?.meshTcpEncrypted) return { ok: true };
  if (peer?.meshLegacy || peer?.meshCompat || peerPrefersPlaintextCompat(peer)) {
    return { ok: false, error: 'unencrypted_mesh_disabled' };
  }
  return { ok: true };
}

/**
 * Authenticate an inbound plaintext frame from a discovery peer without handshake.
 * Used when older BLIP builds send call/chat before (or without) mesh-handshake.
 *
 * @param {object} opts
 * @param {object} opts.session socket session
 * @param {object} opts.msg
 * @param {object} opts.config
 * @param {object} opts.discovery
 * @param {string} opts.remoteIp
 */
export function tryLegacyCompatAuth({ session, msg, config, discovery, remoteIp }) {
  if (!isUnencryptedMeshAllowed(config)) {
    return { ok: false, reason: 'disabled' };
  }
  if (session?.authenticated) {
    return { ok: true, already: true, from: session.peerId, session };
  }
  const from = Number(msg?.from);
  if (!Number.isFinite(from)) return { ok: false, reason: 'from' };

  const peer = discovery?.getPeers?.()?.find((p) => Number(p.blipId) === from && p.online);
  if (!peer) return { ok: false, reason: 'unknown' };

  const observed = normalizePeerIp(remoteIp);
  const announced = normalizePeerIp(peer.ip);
  if (observed && announced && observed !== announced) {
    discovery?.noteObservedPeerIp?.(from, observed);
  }

  session.peerId = from;
  session.meshPubkey = peer.meshPubkey || null;
  session.authenticated = true;
  session.encrypted = false;
  session.cipher = null;
  session.compat = true;

  return { ok: true, from, session, compat: true };
}

/**
 * Mark outbound socket as plaintext-compat after handshake timeout / legacy peer.
 */
export function markOutboundCompatSession(session, peerId) {
  if (!session) return;
  session.peerId = Number(peerId);
  session.authenticated = true;
  session.encrypted = false;
  session.cipher = null;
  session.ecdhPrivateKey = null;
  session.compat = true;
}
