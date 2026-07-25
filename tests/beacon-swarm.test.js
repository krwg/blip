import { describe, expect, it } from 'vitest';
import {
  decodeHaveBitmap,
  countHavePerChunk,
  pickRarestFirstChunks,
  peersWithChunk,
} from '../shared/beacon-swarm.js';

describe('beacon-swarm bitmap', () => {
  it('decodes LSB-first bits matching beacon-store encoding', () => {
    // chunks 0 and 2 set → byte 0b00000101
    const b64 = Buffer.from([0b00000101]).toString('base64');
    expect(decodeHaveBitmap(b64, 8)).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('picks rarest missing chunks', () => {
    const localHave = [true, false, false, false];
    const peerHaves = [
      [true, true, true, false],
      [true, true, false, true],
      [true, false, false, true],
    ];
    // chunk1: 2 peers, chunk2: 1 peer (rarest), chunk3: 2 peers
    expect(pickRarestFirstChunks({ localHave, peerHaves, limit: 2 })).toEqual([2, 1]);
  });

  it('counts have and lists peers', () => {
    const peerHaves = [
      [true, false],
      [true, true],
    ];
    expect(countHavePerChunk(peerHaves, 2)).toEqual([2, 1]);
    expect(peersWithChunk(peerHaves, 1)).toEqual([1]);
  });
});
