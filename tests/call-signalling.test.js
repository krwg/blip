import { describe, expect, it } from 'vitest';
import {
  toSdpWire,
  normalizeSdp,
  normalizeCandidate,
  formatCallDuration,
} from '../renderer/call-signalling.js';

describe('call-signalling', () => {
  it('toSdpWire keeps valid RTCSessionDescriptionInit', () => {
    expect(toSdpWire({ type: 'offer', sdp: 'v=0' })).toEqual({ type: 'offer', sdp: 'v=0' });
    expect(toSdpWire({ type: 'answer', sdp: '' })).toBeNull();
    expect(toSdpWire(null)).toBeNull();
  });

  it('normalizeSdp accepts string and nested shapes', () => {
    expect(normalizeSdp('v=0')).toEqual({ type: 'offer', sdp: 'v=0' });
    expect(normalizeSdp({ type: 'answer', sdp: 'v=0' })).toEqual({ type: 'answer', sdp: 'v=0' });
    expect(
      normalizeSdp({ type: 'offer', sdp: { type: 'offer', sdp: 'v=0' } }),
    ).toEqual({ type: 'offer', sdp: 'v=0' });
    expect(normalizeSdp({})).toBeNull();
  });

  it('normalizeCandidate requires candidate field', () => {
    expect(normalizeCandidate({ candidate: 'a', sdpMid: '0' })).toEqual({
      candidate: 'a',
      sdpMid: '0',
    });
    expect(normalizeCandidate({})).toBeNull();
  });

  it('formatCallDuration', () => {
    expect(formatCallDuration(0)).toBe('00:00');
    expect(formatCallDuration(65_000)).toBe('01:05');
    expect(formatCallDuration(3_661_000)).toBe('01:01:01');
  });
});
