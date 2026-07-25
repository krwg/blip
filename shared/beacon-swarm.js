/**
 * Pure helpers for multi-peer BEACON swarm scheduling (#68).
 * @see docs/BEACON-SWARM.md
 */

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
    if (/^[0-9a-fA-F]+$/.test(bitmap) && bitmap.length % 2 === 0) {
      bytes = Buffer.from(bitmap, 'hex');
    } else {
      bytes = Buffer.from(bitmap, 'base64');
    }
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
