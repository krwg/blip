/**
 * Pure voice-channel signalling helpers (no DOM).
 * @see https://github.com/krwg/blip/issues/59
 */

export { normalizeSdp, toSdpWire, normalizeCandidate } from './call-signalling.js';

export function peerNum(id) {
  return Number(id);
}

/**
 * Build participant media-state map for voice-channel roster sync.
 * @param {Iterable<number|string>} participants
 * @param {object} opts
 * @param {number} opts.myId
 * @param {() => object} opts.myState
 * @param {(peerId: number) => object|undefined} opts.getPeerState
 */
export function buildVoiceMediaStates(participants, { myId, myState, getPeerState }) {
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
 * @param {string|null|undefined} connectionState RTCPeerConnection.connectionState
 */
export function clientPcNeedsRebuild(connectionState) {
  if (!connectionState) return true;
  return (
    connectionState === 'failed' ||
    connectionState === 'closed' ||
    connectionState === 'disconnected'
  );
}
