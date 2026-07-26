/** Soft product + protocol bound for LAN BLIP IDs (8×8 grid). Not a bitmask. */
export const BLIP_ID_MIN: number = 1;
export const BLIP_ID_MAX: number = 64;

export function isValidBlipId(n: unknown): boolean {
  const id = Number(n);
  return Number.isFinite(id) && id >= BLIP_ID_MIN && id <= BLIP_ID_MAX;
}
