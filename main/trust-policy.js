import { BLIP_ID_MIN, BLIP_ID_MAX } from '../shared/blip-id.js';

/** Peer IDs are the soft 1–64 product range (see shared/blip-id.js / ARCHITECTURE). */
export function normalizePeerIdList(arr) {
  if (!Array.isArray(arr)) return [];
  return [
    ...new Set(
      arr
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n >= BLIP_ID_MIN && n <= BLIP_ID_MAX),
    ),
  ];
}

export function isPeerBlocked(config, blipId) {
  const id = Number(blipId);
  return normalizePeerIdList(config?.blockedPeerIds).includes(id);
}

export function isPeerTrusted(config, blipId) {
  const id = Number(blipId);
  return normalizePeerIdList(config?.trustedPeerIds).includes(id);
}
