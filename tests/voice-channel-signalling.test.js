import { describe, expect, it } from 'vitest';
import {
  peerNum,
  buildVoiceMediaStates,
  clientPcNeedsRebuild,
  normalizeSdp,
} from '../renderer/voice-channel-signalling.js';

describe('voice-channel-signalling', () => {
  it('peerNum', () => {
    expect(peerNum('12')).toBe(12);
    expect(peerNum(7)).toBe(7);
  });

  it('buildVoiceMediaStates merges self + peer maps', () => {
    const peerMap = new Map([
      [2, { muted: true, deafened: false, screenSharing: true }],
    ]);
    expect(
      buildVoiceMediaStates([1, 2], {
        myId: 1,
        myState: () => ({ muted: false, deafened: true, screenSharing: false }),
        getPeerState: (id) => peerMap.get(id),
      }),
    ).toEqual({
      '1': { muted: false, deafened: true, screenSharing: false },
      '2': { muted: true, deafened: false, screenSharing: true },
    });
  });

  it('clientPcNeedsRebuild', () => {
    expect(clientPcNeedsRebuild(null)).toBe(true);
    expect(clientPcNeedsRebuild('connected')).toBe(false);
    expect(clientPcNeedsRebuild('failed')).toBe(true);
    expect(clientPcNeedsRebuild('disconnected')).toBe(true);
  });

  it('re-exports normalizeSdp', () => {
    expect(normalizeSdp('v=0')).toEqual({ type: 'offer', sdp: 'v=0' });
  });
});
