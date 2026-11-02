import { describe, expect, it } from 'vitest';
import {
  encodeSteamLanFrame,
  takeSteamLanFrame,
  encodeSteamLanAddress,
  parseSteamLanAddress,
  STEAM_LAN_MAGIC,
  STEAM_LAN_FRAME_STREAM,
} from '../main/steam-lan-protocol.js';

describe('steam-lan-protocol', () => {
  it('round-trips length-prefixed frames', () => {
    const payload = Buffer.from('{"type":"message","text":"hi"}\n', 'utf8');
    const frame = encodeSteamLanFrame(payload, STEAM_LAN_FRAME_STREAM);
    expect(frame.subarray(0, 5).equals(STEAM_LAN_MAGIC)).toBe(true);
    const { frame: parsed, rest } = takeSteamLanFrame(frame);
    expect(parsed?.kind).toBe(STEAM_LAN_FRAME_STREAM);
    expect(Buffer.from(parsed.payload).equals(payload)).toBe(true);
    expect(rest.length).toBe(0);
  });

  it('waits for incomplete frames', () => {
    const payload = Buffer.from('abc', 'utf8');
    const frame = encodeSteamLanFrame(payload);
    const partial = frame.subarray(0, 8);
    const { frame: parsed, rest } = takeSteamLanFrame(partial);
    expect(parsed).toBeNull();
    expect(rest.equals(partial)).toBe(true);
  });

  it('encodes and parses lobby session addresses', () => {
    const id = 109775241091004917n;
    const addr = encodeSteamLanAddress(id);
    expect(addr.startsWith('b-')).toBe(true);
    expect(addr.endsWith('.steam')).toBe(true);
    expect(parseSteamLanAddress(addr)).toBe(id);
    expect(parseSteamLanAddress('not-an-address')).toBeNull();
  });
});
