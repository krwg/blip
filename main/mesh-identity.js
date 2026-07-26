import {
  generateKeyPairSync,
  sign,
  verify,
  createPrivateKey,
  createPublicKey,
} from 'crypto';
import { generateEcdhKeyPair } from './mesh-session-crypto.js';
import { isValidBlipId } from '../shared/blip-id.js';

/** Mesh protocol: 2 = TCP payload encryption after handshake (AES-GCM). */
export const MESH_PROTO = 2;
export const MESH_PROTO_MIN = 1;

const HANDSHAKE_CANON_V1 = 'blip-handshake-v1';
const HANDSHAKE_CANON_V2 = 'blip-handshake-v2';
const ANNOUNCE_CANON = 'blip-announce-v1';

export function ensureMeshIdentity(config) {
  if (config?.meshPrivateKey && config?.meshPublicKey) return config;
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    ...config,
    meshPublicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    meshPrivateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

function privateKeyFromConfig(config) {
  if (!config?.meshPrivateKey) return null;
  try {
    return createPrivateKey({
      key: Buffer.from(config.meshPrivateKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
  } catch {
    return null;
  }
}

export function publicKeyFromBase64(b64) {
  if (!b64) return null;
  try {
    return createPublicKey({
      key: Buffer.from(b64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  } catch {
    return null;
  }
}

export function signCanonical(config, canonical) {
  const pk = privateKeyFromConfig(config);
  if (!pk) return null;
  const sig = sign(null, Buffer.from(canonical, 'utf8'), pk);
  return sig.toString('base64');
}

export function verifyCanonical(pubkeyB64, canonical, sigB64) {
  const pub = publicKeyFromBase64(pubkeyB64);
  if (!pub || !sigB64) return false;
  try {
    return verify(
      null,
      Buffer.from(canonical, 'utf8'),
      pub,
      Buffer.from(sigB64, 'base64'),
    );
  } catch {
    return false;
  }
}

export function handshakeCanonical(from, ts, nonce, pubkey, ecdhPubkey = '') {
  if (ecdhPubkey) {
    return `${HANDSHAKE_CANON_V2}|${from}|${ts}|${nonce}|${pubkey}|${ecdhPubkey}`;
  }
  return `${HANDSHAKE_CANON_V1}|${from}|${ts}|${nonce}|${pubkey}`;
}

export function announceCanonical(fields) {
  return `${ANNOUNCE_CANON}|${fields.blipId}|${fields.displayName}|${fields.presence}|${fields.presenceText}|${fields.ip}|${fields.udpPort}|${fields.tcpPort}|${fields.meshAnnounceTs}|${fields.meshPubkey}`;
}

export function buildHandshakePacket(config, fromId) {
  const from = Number(fromId);
  const ts = Date.now();
  const nonce = `${ts}-${Math.random().toString(36).slice(2, 10)}`;
  const meshPubkey = config.meshPublicKey;
  const ecdh = generateEcdhKeyPair();
  const canonical = handshakeCanonical(from, ts, nonce, meshPubkey, ecdh.publicKeyB64);
  const sig = signCanonical(config, canonical);
  return {
    packet: {
      type: 'mesh-handshake',
      meshProto: MESH_PROTO,
      from,
      ts,
      nonce,
      meshPubkey,
      ecdhPubkey: ecdh.publicKeyB64,
      sig,
    },
    ecdhPrivateKey: ecdh.privateKey,
  };
}

export function buildHandshakeAckPacket(config, fromId, peerPubkey, ecdhPrivateKey, ecdhPublicKeyB64) {
  const from = Number(fromId);
  const ts = Date.now();
  const nonce = `${ts}-${Math.random().toString(36).slice(2, 10)}`;
  const meshPubkey = config.meshPublicKey;
  let ecdhPriv = ecdhPrivateKey;
  let ecdhPub = ecdhPublicKeyB64;
  if (!ecdhPriv || !ecdhPub) {
    const ecdh = generateEcdhKeyPair();
    ecdhPriv = ecdh.privateKey;
    ecdhPub = ecdh.publicKeyB64;
  }
  const canonical = handshakeCanonical(from, ts, nonce, meshPubkey, ecdhPub);
  const sig = signCanonical(config, canonical);
  return {
    packet: {
      type: 'mesh-handshake-ack',
      meshProto: MESH_PROTO,
      from,
      ts,
      nonce,
      meshPubkey,
      ecdhPubkey: ecdhPub,
      sig,
      peerPubkey: peerPubkey || undefined,
    },
    ecdhPrivateKey: ecdhPriv,
  };
}

export function verifyHandshakePacket(msg, expectedFrom) {
  const from = Number(msg?.from);
  if (!isValidBlipId(from)) return { ok: false };
  if (expectedFrom != null && from !== Number(expectedFrom)) return { ok: false };
  const meshPubkey = String(msg?.meshPubkey || '');
  const ts = Number(msg?.ts);
  const nonce = String(msg?.nonce || '');
  const sig = String(msg?.sig || '');
  const ecdhPubkey = String(msg?.ecdhPubkey || '');
  const meshProto = Number(msg?.meshProto) || 1;
  if (!meshPubkey || !nonce || !sig) return { ok: false };
  const canonical = handshakeCanonical(
    from,
    ts,
    nonce,
    meshPubkey,
    meshProto >= 2 && ecdhPubkey ? ecdhPubkey : '',
  );
  if (!verifyCanonical(meshPubkey, canonical, sig)) return { ok: false };
  return {
    ok: true,
    from,
    meshPubkey,
    ecdhPubkey: ecdhPubkey || null,
    meshProto,
    encryptedCapable: meshProto >= 2 && !!ecdhPubkey,
  };
}

export function signAnnouncePayload(payload) {
  const canonical = announceCanonical(payload);
  return { canonical, sig: null };
}

export function verifyAnnouncePayload(data) {
  const proto = Number(data?.meshProto);
  if (!Number.isFinite(proto) || proto < MESH_PROTO_MIN || proto > MESH_PROTO) {
    return { ok: false, reason: 'proto' };
  }
  const meshPubkey = String(data?.meshPubkey || '');
  const sig = String(data?.meshAnnounceSig || '');
  const ts = Number(data?.meshAnnounceTs);
  if (!meshPubkey || !sig || !Number.isFinite(ts)) return { ok: false, reason: 'fields' };
  const canonical = announceCanonical({
    blipId: data.blipId,
    displayName: data.displayName || '',
    presence: data.presence || 'online',
    presenceText: data.presenceText || '',
    ip: data.ip || '',
    udpPort: data.udpPort,
    tcpPort: data.tcpPort,
    meshAnnounceTs: ts,
    meshPubkey,
  });
  if (!verifyCanonical(meshPubkey, canonical, sig)) return { ok: false, reason: 'sig' };
  return { ok: true, meshPubkey, meshProto: proto, meshLegacy: proto < MESH_PROTO };
}

export function shouldAcceptAnnounce(data) {
  return verifyAnnouncePayload(data).ok;
}

export function rememberPeerPubkey(config, blipId, meshPubkey) {
  if (!meshPubkey) return config;
  const known = { ...(config.knownPeerKeys || {}) };
  known[String(blipId)] = meshPubkey;
  return { ...config, knownPeerKeys: known };
}

export function getKnownPeerPubkey(config, blipId) {
  return config?.knownPeerKeys?.[String(blipId)] || null;
}

export function pubkeyMatchesKnown(config, blipId, meshPubkey) {
  const known = getKnownPeerPubkey(config, blipId);
  if (!known) return true;
  return known === meshPubkey;
}

/**
 * TOFU check with optional rebind when LAN announce already verified this key.
 * Dev rebuilds / factory reset rotate mesh keys while blipId stays the same;
 * without rebind the callee destroys the socket → caller sees "Socket closed".
 */
export function acceptPeerPubkey(config, blipId, meshPubkey, discoveryPeer) {
  if (pubkeyMatchesKnown(config, blipId, meshPubkey)) {
    return { ok: true, rebind: false };
  }
  const peerId = Number(discoveryPeer?.blipId);
  if (
    Number.isFinite(peerId) &&
    peerId === Number(blipId) &&
    discoveryPeer.meshVerified &&
    discoveryPeer.meshPubkey &&
    discoveryPeer.meshPubkey === meshPubkey
  ) {
    return { ok: true, rebind: true };
  }
  return { ok: false, rebind: false };
}
