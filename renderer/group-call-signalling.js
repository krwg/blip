/**
 * Pure group-call signalling helpers (no DOM).
 * @see https://github.com/krwg/blip/issues/59
 */

import { rtcConfiguration } from '../shared/ice-servers.js';

export {
  normalizeSdp,
  toSdpWire,
  normalizeCandidate,
  formatCallDuration,
} from './call-signalling.js';

export function peerNum(id) {
  return Number(id);
}

export function wireFrom(msg) {
  return Number(msg.from);
}

export function signalOrigin(msg) {
  const o = msg.originFrom ?? msg.from;
  return peerNum(o);
}

/**
 * Mesh offer tie-break: lower blipId initiates.
 */
export function shouldInitiate(myId, remoteId) {
  return peerNum(myId) < peerNum(remoteId);
}

/**
 * Resolve remote peer for inbound group-call-signal when we are target or origin.
 * @returns {number|null}
 */
export function resolveGroupCallRemoteId(msg, myId) {
  const self = peerNum(myId);
  const target = peerNum(msg.target);
  const origin = signalOrigin(msg);
  if (target !== self && origin !== self) return null;
  return origin === self ? target : origin;
}

/**
 * Build participant media-state map for group-call roster sync.
 * @param {Iterable<number|string>} participants
 * @param {object} opts
 * @param {number} opts.myId
 * @param {() => object} opts.myState
 * @param {(peerId: number) => object|undefined} opts.getPeerState
 */
export function buildGroupCallMediaStates(participants, { myId, myState, getPeerState }) {
  const states = {};
  const selfId = peerNum(myId);
  for (const raw of participants || []) {
    const pid = peerNum(raw);
    if (!Number.isFinite(pid)) continue;
    states[String(pid)] =
      pid === selfId
        ? myState()
        : getPeerState?.(pid) || { muted: false, deafened: false, screenSharing: false };
  }
  if (Number.isFinite(selfId)) states[String(selfId)] = myState();
  return states;
}

/**
 * @param {Iterable<RTCPeerConnection>} peerConnections
 */
export function countConnectedPeerConnections(peerConnections) {
  let n = 0;
  for (const pc of peerConnections) {
    if (pc.connectionState === 'connected') n += 1;
  }
  return n;
}

/**
 * @param {string|null|undefined} connectionState
 */
export function meshPeerConnectionUsable(connectionState) {
  return connectionState === 'connected' || connectionState === 'connecting';
}

/**
 * Peer connection keys that are no longer in the roster participant list.
 * @param {Iterable<number>} peerKeys
 * @param {Iterable<number|string>} participantIds
 * @param {number} myId
 */
export function peerIdsNotInParticipantSet(peerKeys, participantIds, myId) {
  const activeSet = new Set(
    [...(participantIds || [])].map(peerNum).filter(Number.isFinite),
  );
  const self = peerNum(myId);
  const stale = [];
  for (const rid of peerKeys) {
    if (rid === self) continue;
    if (!activeSet.has(rid)) stale.push(rid);
  }
  return stale;
}

export function getVideoSender(pc) {
  return pc?.getSenders().find((s) => s.track?.kind === 'video') ?? null;
}

export function hasLiveVideoStream(stream) {
  const track = stream?.getVideoTracks?.()?.[0];
  return !!(track && track.readyState === 'live' && track.enabled);
}

/**
 * @param {object[]} candidates
 * @param {RTCPeerConnection} pc
 */
export async function flushPendingIceCandidates(candidates, pc) {
  if (!candidates?.length || !pc?.remoteDescription) return;
  for (const c of candidates) {
    try {
      await pc.addIceCandidate(c);
    } catch {

    }
  }
}

/**
 * @param {object} opts
 * @param {object} [opts.cfg] app config for ICE
 * @param {MediaStream|null} [opts.localStream]
 * @param {(ev: RTCTrackEvent) => void} [opts.onTrack]
 * @param {(candidate: object) => void} [opts.onIceCandidate]
 * @param {(state: string, pc: RTCPeerConnection) => void} [opts.onConnectionStateChange]
 */
export function createGroupCallPeerConnection({
  cfg,
  localStream,
  onTrack,
  onIceCandidate,
  onConnectionStateChange,
} = {}) {
  const pc = new RTCPeerConnection(rtcConfiguration(cfg));

  if (localStream) {
    localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
  }

  pc.ontrack = (ev) => {
    onTrack?.(ev);
  };

  pc.onconnectionstatechange = () => {
    onConnectionStateChange?.(pc.connectionState, pc);
  };

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    const json = ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate;
    onIceCandidate?.(json);
  };

  return pc;
}
