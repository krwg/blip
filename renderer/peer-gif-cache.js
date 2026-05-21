/** @type {Map<number, string>} */
const peerGifById = new Map();

/** @param {number} blipId @param {string | null} dataUrl */
export function setPeerProfileGifDataUrl(blipId, dataUrl) {
  const id = Number(blipId);
  if (!Number.isFinite(id)) return;
  if (dataUrl) peerGifById.set(id, dataUrl);
  else peerGifById.delete(id);
}

/** @param {number} blipId */
export function getPeerProfileGifDataUrl(blipId) {
  return peerGifById.get(Number(blipId)) || null;
}
