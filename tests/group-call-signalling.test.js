import { describe, expect, it } from 'vitest';
import {
  peerNum,
  wireFrom,
  signalOrigin,
  shouldInitiate,
  resolveGroupCallRemoteId,
  buildGroupCallMediaStates,
  countConnectedPeerConnections,
  meshPeerConnectionUsable,
  peerIdsNotInParticipantSet,
  getVideoSender,
  hasLiveVideoStream,
  flushPendingIceCandidates,
  normalizeSdp,
  formatCallDuration,
} from '../renderer/group-call-signalling.js';

describe('group-call-signalling', () => {
  it('peerNum', () => {
    expect(peerNum('3')).toBe(3);
    expect(peerNum(9)).toBe(9);
  });

  it('wireFrom and signalOrigin', () => {
    expect(wireFrom({ from: '5' })).toBe(5);
    expect(signalOrigin({ from: '1', originFrom: '2' })).toBe(2);
    expect(signalOrigin({ from: '4' })).toBe(4);
  });

  it('shouldInitiate uses lower blipId', () => {
    expect(shouldInitiate(1, 2)).toBe(true);
    expect(shouldInitiate(2, 1)).toBe(false);
    expect(shouldInitiate('3', '10')).toBe(true);
  });

  it('resolveGroupCallRemoteId', () => {
    expect(
      resolveGroupCallRemoteId({ target: 2, originFrom: 3, from: 3 }, 1),
    ).toBeNull();
    expect(
      resolveGroupCallRemoteId({ target: 5, originFrom: 1, from: 1 }, 1),
    ).toBe(5);
    expect(
      resolveGroupCallRemoteId({ target: 1, originFrom: 4, from: 4 }, 1),
    ).toBe(4);
  });

  it('buildGroupCallMediaStates merges self + peer maps', () => {
    const peerMap = new Map([
      [8, { muted: false, deafened: true, screenSharing: false }],
    ]);
    expect(
      buildGroupCallMediaStates([7, 8], {
        myId: 7,
        myState: () => ({ muted: true, deafened: false, screenSharing: true }),
        getPeerState: (id) => peerMap.get(id),
      }),
    ).toEqual({
      '7': { muted: true, deafened: false, screenSharing: true },
      '8': { muted: false, deafened: true, screenSharing: false },
    });
  });

  it('countConnectedPeerConnections', () => {
    const pcs = [
      { connectionState: 'connected' },
      { connectionState: 'connecting' },
      { connectionState: 'connected' },
    ];
    expect(countConnectedPeerConnections(pcs)).toBe(2);
  });

  it('meshPeerConnectionUsable', () => {
    expect(meshPeerConnectionUsable('connected')).toBe(true);
    expect(meshPeerConnectionUsable('connecting')).toBe(true);
    expect(meshPeerConnectionUsable('failed')).toBe(false);
  });

  it('peerIdsNotInParticipantSet', () => {
    expect(
      peerIdsNotInParticipantSet([1, 2, 3], [2, 3, 4], 1),
    ).toEqual([]);
    expect(peerIdsNotInParticipantSet([1, 2, 5], [2, 3], 1)).toEqual([5]);
    expect(peerIdsNotInParticipantSet([1, 9], [1, 2], 1)).toEqual([9]);
  });

  it('getVideoSender', () => {
    const sender = { track: { kind: 'video' } };
    const pc = { getSenders: () => [{ track: { kind: 'audio' } }, sender] };
    expect(getVideoSender(pc)).toBe(sender);
    expect(getVideoSender({ getSenders: () => [] })).toBeNull();
  });

  it('hasLiveVideoStream', () => {
    expect(
      hasLiveVideoStream({
        getVideoTracks: () => [{ readyState: 'live', enabled: true }],
      }),
    ).toBe(true);
    expect(
      hasLiveVideoStream({
        getVideoTracks: () => [{ readyState: 'ended', enabled: true }],
      }),
    ).toBe(false);
    expect(hasLiveVideoStream(null)).toBe(false);
  });

  it('flushPendingIceCandidates skips without remoteDescription', async () => {
    const pc = { remoteDescription: null, addIceCandidate: () => {} };
    await flushPendingIceCandidates([{ candidate: 'x' }], pc);
    expect(pc.addIceCandidate).toBeDefined();
  });

  it('re-exports normalizeSdp and formatCallDuration', () => {
    expect(normalizeSdp('v=0')).toEqual({ type: 'offer', sdp: 'v=0' });
    expect(formatCallDuration(65_000)).toBe('01:05');
  });
});
