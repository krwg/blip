/**
 * Pure helpers for multi-peer BEACON swarm scheduling (#68).
 * Browser-safe (no Node crypto). Integrity hashing: `beacon-swarm-crypto.js`.
 * @see docs/BEACON-SWARM.md
 */

function bitmapToBytes(bitmap) {
  if (/^[0-9a-fA-F]+$/.test(bitmap) && bitmap.length % 2 === 0) {
    const len = bitmap.length / 2;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = parseInt(bitmap.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  return Uint8Array.from(atob(bitmap), (c) => c.charCodeAt(0));
}

/**
 * Swarm coverage: union of local + peer have-maps.
 * @param {object} opts
 * @param {boolean[]} [opts.localHave]
 * @param {boolean[][]} [opts.peerHaves]
 * @param {number} totalChunks
 * @returns {{ peerCount: number, havePct: number }}
 */
export function computeSwarmCoverage({ localHave, peerHaves, totalChunks }) {
  const n = Math.max(0, Number(totalChunks) || 0);
  if (!n) return { peerCount: 0, havePct: 0 };
  let peerCount = 0;
  for (const h of peerHaves || []) {
    if (h?.some(Boolean)) peerCount += 1;
  }
  let haveBits = 0;
  for (let i = 0; i < n; i++) {
    if (localHave?.[i]) {
      haveBits += 1;
      continue;
    }
    for (const h of peerHaves || []) {
      if (h?.[i]) {
        haveBits += 1;
        break;
      }
    }
  }
  return { peerCount, havePct: Math.round((haveBits / n) * 100) };
}

/**
 * Parse a have-bitmap into a boolean array (true = peer has chunk).
 * Accepts base64 (preferred) or hex. Length padded/truncated to totalChunks.
 * @param {string} bitmap
 * @param {number} totalChunks
 * @returns {boolean[]}
 */
export function decodeHaveBitmap(bitmap, totalChunks) {
  const n = Math.max(0, Number(totalChunks) || 0);
  const out = Array(n).fill(false);
  if (!bitmap || !n) return out;
  let bytes;
  try {
    bytes = bitmapToBytes(bitmap);
  } catch {
    return out;
  }
  for (let i = 0; i < n; i++) {
    const byte = bytes[i >> 3];
    if (byte == null) break;
    out[i] = ((byte >> (i & 7)) & 1) === 1;
  }
  return out;
}

/**
 * Merge several peer have-maps: count how many peers have each chunk.
 * @param {boolean[][]} peerHaves
 * @param {number} totalChunks
 * @returns {number[]}
 */
export function countHavePerChunk(peerHaves, totalChunks) {
  const n = Math.max(0, Number(totalChunks) || 0);
  const counts = Array(n).fill(0);
  for (const have of peerHaves || []) {
    for (let i = 0; i < n; i++) {
      if (have?.[i]) counts[i] += 1;
    }
  }
  return counts;
}

/**
 * Rarest-first among missing local chunks that at least one peer has.
 * @param {object} opts
 * @param {boolean[]} opts.localHave
 * @param {boolean[][]} opts.peerHaves
 * @param {number} [opts.limit=16]
 * @returns {number[]} chunk indices
 */
export function pickRarestFirstChunks({ localHave, peerHaves, limit = 16 }) {
  const n = localHave?.length || 0;
  if (!n || limit <= 0) return [];
  const counts = countHavePerChunk(peerHaves, n);
  const candidates = [];
  for (let i = 0; i < n; i++) {
    if (localHave[i]) continue;
    if (counts[i] <= 0) continue;
    candidates.push({ i, c: counts[i] });
  }
  candidates.sort((a, b) => a.c - b.c || a.i - b.i);
  return candidates.slice(0, limit).map((x) => x.i);
}

/**
 * For a chunk index, list peer indices that have it (round-robin friendly).
 * @param {boolean[][]} peerHaves
 * @param {number} chunkIndex
 * @returns {number[]}
 */
export function peersWithChunk(peerHaves, chunkIndex) {
  const out = [];
  (peerHaves || []).forEach((have, peerIdx) => {
    if (have?.[chunkIndex]) out.push(peerIdx);
  });
  return out;
}
