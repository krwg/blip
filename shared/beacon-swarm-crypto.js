/**
 * Node-only BEACON chunk integrity helpers (#68).
 * @see docs/BEACON-SWARM.md
 */

import { createHash } from 'node:crypto';

/**
 * SHA-256 hex digest of raw chunk bytes.
 * @param {Buffer|Uint8Array} buf
 * @returns {string}
 */
export function hashChunkBytes(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Integrity root: SHA-256 of concatenated per-chunk digests (32-byte each, in order).
 * @param {string[]} chunkHashes hex digests
 * @returns {string}
 */
export function computeInfoHashFromChunkHashes(chunkHashes) {
  const h = createHash('sha256');
  for (const hex of chunkHashes || []) {
    if (hex) h.update(Buffer.from(hex, 'hex'));
  }
  return h.digest('hex');
}
