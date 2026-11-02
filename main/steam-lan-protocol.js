/**
 * SteamLAN wire helpers — magic frames + session addresses.
 * @see docs/STEAM-LAN.md
 */

export const STEAM_LAN_MAGIC = Buffer.from('BLIP1');
export const STEAM_LAN_CHANNEL = 0;

/** Length-prefixed stream chunk (reliable P2P body). */
export const STEAM_LAN_FRAME_STREAM = 0x01;

const MAX_FRAME_PAYLOAD = 900_000;

/**
 * @param {Buffer} payload
 * @param {number} [kind]
 */
export function encodeSteamLanFrame(payload, kind = STEAM_LAN_FRAME_STREAM) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  if (body.length > MAX_FRAME_PAYLOAD) {
    throw new Error('steam_lan_frame_too_large');
  }
  const out = Buffer.allocUnsafe(STEAM_LAN_MAGIC.length + 1 + 4 + body.length);
  STEAM_LAN_MAGIC.copy(out, 0);
  out.writeUInt8(kind, STEAM_LAN_MAGIC.length);
  out.writeUInt32BE(body.length, STEAM_LAN_MAGIC.length + 1);
  body.copy(out, STEAM_LAN_MAGIC.length + 5);
  return out;
}

/**
 * Parse one frame from the front of a buffer.
 * @param {Buffer} buf
 * @returns {{ frame: { kind: number, payload: Buffer } | null, rest: Buffer }}
 */
export function takeSteamLanFrame(buf) {
  const min = STEAM_LAN_MAGIC.length + 5;
  if (!buf || buf.length < min) return { frame: null, rest: buf || Buffer.alloc(0) };
  if (!buf.subarray(0, STEAM_LAN_MAGIC.length).equals(STEAM_LAN_MAGIC)) {
    return { frame: null, rest: Buffer.alloc(0) };
  }
  const kind = buf.readUInt8(STEAM_LAN_MAGIC.length);
  const len = buf.readUInt32BE(STEAM_LAN_MAGIC.length + 1);
  if (len > MAX_FRAME_PAYLOAD) return { frame: null, rest: Buffer.alloc(0) };
  const total = min + len;
  if (buf.length < total) return { frame: null, rest: buf };
  const payload = Buffer.from(buf.subarray(min, total));
  const rest = Buffer.from(buf.subarray(total));
  return { frame: { kind, payload }, rest };
}

/**
 * @param {bigint|string|number} lobbyId
 */
export function encodeSteamLanAddress(lobbyId) {
  const id = typeof lobbyId === 'bigint' ? lobbyId : BigInt(String(lobbyId));
  return `b-${id.toString(36)}.steam`;
}

/**
 * @param {string} digits
 * @returns {bigint}
 */
function parseBase36BigInt(digits) {
  let n = 0n;
  for (const ch of digits) {
    const c = ch.charCodeAt(0);
    let v = -1;
    if (c >= 48 && c <= 57) v = c - 48;
    else if (c >= 97 && c <= 122) v = c - 87;
    if (v < 0 || v > 35) throw new Error('bad_base36');
    n = n * 36n + BigInt(v);
  }
  return n;
}

/**
 * @param {string} raw
 * @returns {bigint | null}
 */
export function parseSteamLanAddress(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  const m = /^b-([0-9a-z]+)\.steam$/.exec(s);
  if (!m) return null;
  try {
    return parseBase36BigInt(m[1]);
  } catch {
    return null;
  }
}

export function isSteamLanAddress(raw) {
  return parseSteamLanAddress(raw) != null;
}
