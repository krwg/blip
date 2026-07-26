/** Soft product + protocol bound for LAN BLIP IDs (8×8 grid). Not a bitmask. */
export const BLIP_ID_MIN = 1;
export const BLIP_ID_MAX = 64;
export function isValidBlipId(n) {
    const id = Number(n);
    return Number.isFinite(id) && id >= BLIP_ID_MIN && id <= BLIP_ID_MAX;
}
