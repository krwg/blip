/**
 * Pure call signalling helpers (no DOM).
 * @see https://github.com/krwg/blip/issues/59
 */

import { rtcConfiguration } from '../shared/ice-servers.js';

export function toSdpWire(desc) {
  if (!desc) return null;
  if (typeof desc.type === 'string' && typeof desc.sdp === 'string' && desc.sdp.length > 0) {
    return { type: desc.type, sdp: desc.sdp };
  }
  return null;
}

export function normalizeSdp(sdp) {
  if (!sdp) return null;
  if (typeof sdp === 'string') return { type: 'offer', sdp };
  let type = sdp.type;
  let body = sdp.sdp;
  if (body && typeof body === 'object' && typeof body.sdp === 'string') {
    type = body.type ?? type;
    body = body.sdp;
  }
  if (typeof type === 'string' && typeof body === 'string' && body.length > 0) {
    return { type, sdp: body };
  }
  return null;
}

export function normalizeCandidate(candidate) {
  if (!candidate) return null;
  if (candidate.candidate !== undefined) return candidate;
  return null;
}

export function formatCallDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m % 60)}:${pad(s % 60)}`;
  return `${pad(m)}:${pad(s % 60)}`;
}

/**
 * @param {object} opts
 * @param {object} [opts.cfg] app config for ICE
 * @param {(stream: MediaStream) => void} [opts.onRemoteStream]
 * @param {(candidate: object) => void} [opts.onIceCandidate]
 * @param {() => void} [opts.onConnectionFailed]
 */
export function createCallPeerConnection({
  cfg,
  onRemoteStream,
  onIceCandidate,
  onConnectionFailed,
} = {}) {
  const pc = new RTCPeerConnection(rtcConfiguration(cfg));

  pc.ontrack = (e) => {
    if (e.streams[0]) onRemoteStream?.(e.streams[0]);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate && onIceCandidate) {
      const json = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
      onIceCandidate(json);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      console.error('[call] connection failed');
      onConnectionFailed?.();
    }
  };

  return pc;
}
