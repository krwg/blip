import {
  generateKeyPairSync,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  createCipheriv,
  createDecipheriv,
} from 'crypto';

export const MESH_TCP_ENVELOPE = 1;
export const MESH_TCP_HKDF_INFO = 'blip-mesh-tcp-v1';

export function generateEcdhKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('x25519');
  return {
    privateKey,
    publicKeyB64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}

function peerPublicKeyFromB64(b64) {
  return createPublicKey({
    key: Buffer.from(b64, 'base64'),
    format: 'der',
    type: 'spki',
  });
}

/**
 * @param {'initiator'|'responder'} role
 * @returns {{ sendKey: Buffer, recvKey: Buffer }}
 */
export function deriveDirectionalKeys(privateKey, peerPublicKeyB64, role) {
  const shared = diffieHellman({
    privateKey,
    publicKey: peerPublicKeyFromB64(peerPublicKeyB64),
  });
  const material = Buffer.from(
    hkdfSync('sha256', shared, Buffer.alloc(0), Buffer.from(MESH_TCP_HKDF_INFO), 64),
  );
  const a = material.subarray(0, 32);
  const b = material.subarray(32, 64);
  if (role === 'initiator') {
    return { sendKey: Buffer.from(a), recvKey: Buffer.from(b) };
  }
  return { sendKey: Buffer.from(b), recvKey: Buffer.from(a) };
}

export function createMeshCipher(sendKey, recvKey) {
  return {
    sendKey,
    recvKey,
    sendCounter: 0,
    recvCounter: 0,
  };
}

function nonceFromCounter(counter) {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32BE((counter / 2 ** 32) >>> 0, 0);
  nonce.writeUInt32BE(counter >>> 0, 4);
  // bytes 8-11 stay 0
  return nonce;
}

/** Seal a UTF-8 JSON line body (without trailing newline). */
export function sealMeshLine(cipher, plaintextUtf8) {
  if (!cipher) return plaintextUtf8;
  const nonce = nonceFromCounter(cipher.sendCounter);
  cipher.sendCounter += 1;
  const ciph = createCipheriv('aes-256-gcm', cipher.sendKey, nonce);
  const enc = Buffer.concat([ciph.update(plaintextUtf8, 'utf8'), ciph.final()]);
  const tag = ciph.getAuthTag();
  return JSON.stringify({
    _e: MESH_TCP_ENVELOPE,
    n: nonce.toString('base64'),
    c: Buffer.concat([enc, tag]).toString('base64'),
  });
}

/**
 * Open an encrypted envelope line, or return null if not an envelope.
 * Throws on auth failure for envelope lines.
 */
export function openMeshLine(cipher, line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || parsed._e !== MESH_TCP_ENVELOPE) return null;
  if (!cipher) {
    const err = new Error('Encrypted mesh line without session cipher');
    err.code = 'MESH_NO_CIPHER';
    throw err;
  }
  const nonce = Buffer.from(String(parsed.n || ''), 'base64');
  const packed = Buffer.from(String(parsed.c || ''), 'base64');
  if (nonce.length !== 12 || packed.length < 17) {
    const err = new Error('Invalid mesh cipher envelope');
    err.code = 'MESH_BAD_ENVELOPE';
    throw err;
  }
  const tag = packed.subarray(packed.length - 16);
  const data = packed.subarray(0, packed.length - 16);
  const dec = createDecipheriv('aes-256-gcm', cipher.recvKey, nonce);
  dec.setAuthTag(tag);
  const plain = Buffer.concat([dec.update(data), dec.final()]).toString('utf8');
  cipher.recvCounter += 1;
  return plain;
}

/** Parse a TCP line: decrypt envelope when session has cipher. */
export function parseMeshTcpLine(cipher, line) {
  if (cipher) {
    const opened = openMeshLine(cipher, line);
    if (opened != null) return JSON.parse(opened);
    // After cipher is armed, reject cleartext application payloads
    const peek = JSON.parse(line);
    if (peek?.type === 'mesh-handshake' || peek?.type === 'mesh-handshake-ack') {
      return peek;
    }
    if (peek?.type === 'ping' || peek?.type === 'pong') {
      return peek;
    }
    const err = new Error('Expected encrypted mesh line');
    err.code = 'MESH_PLAINTEXT_AFTER_CIPHER';
    throw err;
  }
  return JSON.parse(line);
}
