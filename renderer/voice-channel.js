/**
 * Voice channels — star topology: all media flows through group host (mixer + forward).
 */
import { t } from './i18n.js';
import { sounds } from './audio.js';
import { showAppToast } from './toasts.js';
import { getGroup, amHost } from './groups.js';
import {
  applyVoiceChRosterFromTcp,
  addChannelParticipant,
  removeChannelParticipant,
  channelParticipants,
  clearVoiceChannelRoster,
} from './voice-channel-roster.js';
import {
  applyScreenTrackConstraints,
  tuneVideoSender,
  trackLooksLikeScreen,
} from './call-media.js';
import { openScreenPickerDialog } from './screen-picker-dialog.js';
import { captureDisplayStream } from './display-capture.js';
import { getVoiceMediaStream } from './audio-capture.js';
import { dispatchReactiveAudio } from './reactive-wallpaper.js';

const ICE = [];

/** @type {Map<number, RTCPeerConnection>} */
const hostPeers = new Map();
/** @type {Map<number, RTCIceCandidateInit[]>} */
const hostPendingIce = new Map();

let clientPc = null;
let clientPendingIce = [];

/** @type {Map<number, RTCPeerConnection>} */
const meshPeers = new Map();
/** @type {Map<number, RTCIceCandidateInit[]>} */
const meshPendingIce = new Map();

let localStream = null;
let screenStream = null;
let sharingScreen = false;
let muted = false;
let deafened = false;

let activeGroupId = null;
let activeChannelId = null;
let apiRef = null;
let configRef = null;

/** @type {Map<number, { muted: boolean; deafened: boolean; screenSharing: boolean }>} */
const peerMediaState = new Map();

let audioCtx = null;
let mixerGain = null;
let mixDestination = null;
/** @type {Map<number, MediaStreamTrack>} */
const mixerTracks = new Map();
/** @type {Map<number, MediaStreamAudioSourceNode>} */
const mixerSources = new Map();
/** @type {Map<number, GainNode>} */
const mixerTaps = new Map();
let mixedTrack = null;

let playbackCtx = null;
/** @type {Map<number, MediaStreamAudioSourceNode>} */
const playbackSources = new Map();

let heartbeatTimer = null;
let stageRefresh = null;

/** @type {Map<number, { type: string, sdp: string }>} */
const pendingHostOffers = new Map();

/** @type {Map<number, MediaStream>} */
const peerVideoStreams = new Map();

let localScreenPreview = null;

function peerNum(id) {
  return Number(id);
}

function myId() {
  return peerNum(configRef?.blipId);
}

function isHost(group) {
  return amHost(group, myId());
}

function normalizeSdp(sdp) {
  if (!sdp) return null;
  if (typeof sdp === 'string') return { type: 'offer', sdp };
  if (typeof sdp.type === 'string' && typeof sdp.sdp === 'string') return sdp;
  return null;
}

function myMediaState() {
  return { muted, deafened, screenSharing: sharingScreen };
}

function buildStates(participants) {
  const states = {};
  const id = myId();
  for (const pid of participants) {
    states[String(pid)] =
      pid === id ? myMediaState() : peerMediaState.get(pid) || { muted: false, deafened: false, screenSharing: false };
  }
  if (Number.isFinite(id)) states[String(id)] = myMediaState();
  return states;
}

async function sendTcp(payload) {
  if (!apiRef) return;
  try {
    await apiRef.sendTcpMessage(payload);
  } catch (err) {
    console.warn('[voice-ch]', err?.message || err);
  }
}

async function sendSignal(groupId, to, payload) {
  const group = getGroup(groupId);
  if (!group) return;
  await sendTcp({
    type: 'voice-ch-signal',
    to: peerNum(to),
    groupId,
    channelId: activeChannelId,
    host: group.hostId,
    originFrom: myId(),
    target: peerNum(to),
    ...payload,
  });
}

async function broadcastRoster(groupId, channelId, { end = false, leaver = null } = {}) {
  const group = getGroup(groupId);
  if (!group || !apiRef) return;
  const id = myId();
  let participants = [];
  if (end) {
    clearVoiceChannelRoster(groupId, channelId);
  } else {
    if (localStream && Number.isFinite(id)) addChannelParticipant(groupId, channelId, id);
    participants = channelParticipants(groupId, channelId);
  }
  const states = end ? {} : buildStates(participants);
  for (const m of group.members) {
    const mid = peerNum(m);
    if (mid === id) continue;
    await sendTcp({
      type: 'voice-ch-roster',
      to: mid,
      groupId,
      channelId,
      host: group.hostId,
      active: !end,
      participants,
      states,
      leaver: leaver != null ? peerNum(leaver) : undefined,
    });
  }
  if (!end) stageRefresh?.();
}

function micGainValue() {
  return (Number(configRef?.micInputGain) || 100) / 100;
}

async function resumeVoiceAudioContexts() {
  ensureMixer();
  if (audioCtx?.state === 'suspended') {
    try {
      await audioCtx.resume();
    } catch {
      /* ignore */
    }
  }
  ensurePlaybackMixer();
  if (playbackCtx?.state === 'suspended') {
    try {
      await playbackCtx.resume();
    } catch {
      /* ignore */
    }
  }
  const audio = document.getElementById('voice-ch-remote-audio');
  if (audio?.srcObject) void audio.play().catch(() => {});
}

function ensureMixer() {
  if (audioCtx && mixerGain) return;
  audioCtx = new AudioContext();
  mixerGain = audioCtx.createGain();
  mixDestination = audioCtx.createMediaStreamDestination();
  mixerGain.connect(mixDestination);
  mixedTrack = mixDestination.stream.getAudioTracks()[0] || null;
}

function attachToMixer(peerId, track) {
  ensureMixer();
  const n = peerNum(peerId);
  removeFromMixer(n);
  mixerTracks.set(n, track);
  const stream = new MediaStream([track]);
  const src = audioCtx.createMediaStreamSource(stream);
  const tap = audioCtx.createGain();
  src.connect(tap);
  tap.connect(mixerGain);
  mixerSources.set(n, src);
  mixerTaps.set(n, tap);
  mixedTrack = mixDestination.stream.getAudioTracks()[0] || null;
}

function removeFromMixer(peerId) {
  const n = peerNum(peerId);
  mixerTracks.delete(n);
  const src = mixerSources.get(n);
  const tap = mixerTaps.get(n);
  if (tap) {
    try {
      tap.disconnect();
    } catch {
      /* ignore */
    }
    mixerTaps.delete(n);
  }
  if (src) {
    try {
      src.disconnect();
    } catch {
      /* ignore */
    }
    mixerSources.delete(n);
  }
}

/** Mix of all participants except excludePeerId (SFU mix-minus-self). */
function buildMixMinusTrack(excludePeerId) {
  ensureMixer();
  const ex = peerNum(excludePeerId);
  const dest = audioCtx.createMediaStreamDestination();
  const bus = audioCtx.createGain();
  bus.connect(dest);
  let any = false;
  for (const [pid, track] of mixerTracks) {
    if (peerNum(pid) === ex || track.readyState === 'ended') continue;
    const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
    src.connect(bus);
    any = true;
  }
  return any ? dest.stream.getAudioTracks()[0] : null;
}

async function setPcAudioTrack(pc, track) {
  if (!pc || !track) return;
  let sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
  if (sender) {
    await sender.replaceTrack(track);
    return;
  }
  try {
    pc.addTrack(track, new MediaStream([track]));
  } catch {
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    await tr.sender.replaceTrack(track);
  }
}

async function pushMixedAudioToPeer(peerId) {
  const pc = hostPeers.get(peerNum(peerId));
  if (!pc) return;
  const track = buildMixMinusTrack(peerId);
  await setPcAudioTrack(pc, track);
}

async function pushMixedAudioToAll() {
  for (const pid of hostPeers.keys()) {
    await pushMixedAudioToPeer(pid);
  }
}

function disconnectHostPeer(peerId) {
  const n = peerNum(peerId);
  const pc = hostPeers.get(n);
  if (pc) {
    pc.close();
    hostPeers.delete(n);
  }
  hostPendingIce.delete(n);
  removeFromMixer(n);
  peerMediaState.delete(n);
}

function stopHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startHeartbeat(groupId, channelId) {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (activeGroupId === groupId && activeChannelId === channelId && localStream) {
      void broadcastRoster(groupId, channelId);
    }
  }, 4000);
}

function ensureRemoteAudioElement() {
  let audio = document.getElementById('voice-ch-remote-audio');
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = 'voice-ch-remote-audio';
    audio.autoplay = true;
    audio.playsInline = true;
    document.body.appendChild(audio);
  }
  return audio;
}

let playbackDest = null;

function ensurePlaybackMixer() {
  if (!playbackCtx) {
    playbackCtx = new AudioContext();
    playbackDest = playbackCtx.createMediaStreamDestination();
  }
}

function removePlaybackPeer(peerId) {
  const src = playbackSources.get(peerNum(peerId));
  if (src) {
    try {
      src.disconnect();
    } catch {
      /* ignore */
    }
    playbackSources.delete(peerNum(peerId));
  }
}

function attachPlaybackTrack(peerId, track) {
  ensurePlaybackMixer();
  const n = peerNum(peerId);
  removePlaybackPeer(n);
  const src = playbackCtx.createMediaStreamSource(new MediaStream([track]));
  src.connect(playbackDest);
  playbackSources.set(n, src);
  const audio = ensureRemoteAudioElement();
  audio.srcObject = playbackDest.stream;
  audio.muted = deafened;
  void resumeVoiceAudioContexts().then(() => audio.play().catch(() => {}));
}

function clearPlayback() {
  for (const pid of [...playbackSources.keys()]) removePlaybackPeer(pid);
  if (playbackCtx) {
    void playbackCtx.close().catch(() => {});
    playbackCtx = null;
    playbackDest = null;
  }
}

function playRemoteMixedStream(stream) {
  const audio = ensureRemoteAudioElement();
  audio.srcObject = stream;
  audio.muted = deafened;
  void resumeVoiceAudioContexts().then(() => audio.play().catch(() => {}));
}

async function getMic() {
  return getVoiceMediaStream(configRef || {});
}

async function flushHostIce(peerId, pc) {
  const pending = hostPendingIce.get(peerId);
  if (!pending?.length || !pc?.remoteDescription) return;
  for (const c of pending) {
    try {
      await pc.addIceCandidate(c);
    } catch {
      /* ignore */
    }
  }
  hostPendingIce.delete(peerId);
}

async function flushClientIce(pc) {
  if (!clientPendingIce.length || !pc?.remoteDescription) return;
  for (const c of clientPendingIce) {
    try {
      await pc.addIceCandidate(c);
    } catch {
      /* ignore */
    }
  }
  clientPendingIce = [];
}

async function createHostPeer(remoteId, groupId) {
  const rid = peerNum(remoteId);
  const existing = hostPeers.get(rid);
  if (existing) {
    const st = existing.connectionState;
    if (st === 'connected' || st === 'connecting' || st === 'new') return existing;
    disconnectHostPeer(rid);
  }
  const group = getGroup(groupId);
  const pc = new RTCPeerConnection({ iceServers: ICE });
  hostPeers.set(rid, pc);
  hostPendingIce.set(rid, []);

  pc.ontrack = (ev) => {
    const track = ev.track;
    if (track.kind === 'audio') {
      void resumeVoiceAudioContexts();
      attachToMixer(rid, track);
      void pushMixedAudioToAll();
      ensureHostPlayback();
      track.onended = () => {
        removeFromMixer(rid);
        void pushMixedAudioToAll();
        stageRefresh?.();
      };
      stageRefresh?.();
      return;
    }
    if (track.kind === 'video') {
      const vs = ev.streams[0] || new MediaStream([track]);
      peerVideoStreams.set(rid, vs);
      peerMediaState.set(rid, {
        ...(peerMediaState.get(rid) || {}),
        screenSharing: true,
      });
      stageRefresh?.();
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      sounds.stopOutgoingRing();
      sounds.callConnected();
      void broadcastRoster(groupId, activeChannelId);
    }
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      disconnectHostPeer(rid);
      stageRefresh?.();
    }
  };

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    void sendSignal(groupId, rid, {
      signalKind: 'candidate',
      candidate: ev.candidate.toJSON(),
    });
  };

  return pc;
}

function ensureHostPlayback() {
  const track = buildMixMinusTrack(myId());
  if (track) playRemoteMixedStream(new MediaStream([track]));
  else {
    const audio = ensureRemoteAudioElement();
    audio.srcObject = null;
  }
}

function attachHostLocalMic() {
  const track = localStream?.getAudioTracks()[0];
  if (!track) return;
  ensureMixer();
  const n = myId();
  removeFromMixer(n);
  mixerTracks.set(n, track);
  const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
  const tap = audioCtx.createGain();
  tap.gain.value = micGainValue();
  src.connect(tap);
  tap.connect(mixerGain);
  mixerSources.set(n, src);
  mixerTaps.set(n, tap);
  mixedTrack = mixDestination.stream.getAudioTracks()[0] || null;
}

async function sendRenegotiateOffer(pc, groupId, remoteId) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendSignal(groupId, remoteId, {
    signalKind: 'ren-offer',
    sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
  });
}

async function setVideoOnPc(pc, track, stream) {
  if (!pc) return;
  const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
  if (track) {
    if (sender) await sender.replaceTrack(track);
    else pc.addTrack(track, stream || new MediaStream([track]));
  } else if (sender) {
    await sender.replaceTrack(null);
  }
}

async function syncScreenVideoOut() {
  if (!sharingScreen || !screenStream) return;
  const track = screenStream.getVideoTracks()[0];
  if (!track) return;
  const group = getGroup(activeGroupId);
  if (!group) return;
  if (isHost(group)) {
    for (const [rid, pc] of hostPeers) {
      await setVideoOnPc(pc, track, screenStream);
      if (pc.signalingState === 'stable') await sendRenegotiateOffer(pc, activeGroupId, rid);
    }
  } else if (clientPc) {
    await setVideoOnPc(clientPc, track, screenStream);
    if (clientPc.signalingState === 'stable') {
      await sendRenegotiateOffer(clientPc, activeGroupId, peerNum(group.hostId));
    }
  }
}

async function handleHostOffer(remoteId, groupId, offer) {
  if (!localStream) {
    pendingHostOffers.set(peerNum(remoteId), offer);
    return;
  }
  await resumeVoiceAudioContexts();
  const pc = await createHostPeer(remoteId, groupId);
  attachHostLocalMic();
  await pc.setRemoteDescription(offer);
  await flushHostIce(remoteId, pc);
  const outTrack = buildMixMinusTrack(remoteId);
  const fallback = localStream?.getAudioTracks()[0];
  await setPcAudioTrack(pc, outTrack || fallback);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await sendSignal(groupId, remoteId, {
    signalKind: 'answer',
    sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
  });
  ensureHostPlayback();
  await pushMixedAudioToPeer(remoteId);
}

function disconnectMeshPeer(peerId) {
  const n = peerNum(peerId);
  const pc = meshPeers.get(n);
  if (pc) {
    pc.close();
    meshPeers.delete(n);
  }
  meshPendingIce.delete(n);
  removePlaybackPeer(n);
}

async function flushMeshIce(peerId, pc) {
  const pending = meshPendingIce.get(peerId);
  if (!pending?.length || !pc?.remoteDescription) return;
  for (const c of pending) {
    try {
      await pc.addIceCandidate(c);
    } catch {
      /* ignore */
    }
  }
  meshPendingIce.delete(peerId);
}

function wireMeshPc(pc, remoteId, groupId) {
  const rid = peerNum(remoteId);
  pc.ontrack = (ev) => {
    if (ev.track.kind === 'audio') {
      attachPlaybackTrack(rid, ev.track);
      sounds.stopOutgoingRing();
      sounds.callConnected();
      stageRefresh?.();
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      disconnectMeshPeer(rid);
      stageRefresh?.();
    }
  };
  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    void sendSignal(groupId, rid, {
      signalKind: 'candidate',
      candidate: ev.candidate.toJSON(),
    });
  };
}

async function createMeshOffer(remoteId, groupId) {
  const rid = peerNum(remoteId);
  if (meshPeers.has(rid) || !localStream) return;
  const pc = new RTCPeerConnection({ iceServers: ICE });
  meshPeers.set(rid, pc);
  meshPendingIce.set(rid, []);
  wireMeshPc(pc, rid, groupId);
  localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendSignal(groupId, rid, {
    signalKind: 'offer',
    sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
  });
}

async function handleMeshOffer(remoteId, groupId, offer) {
  const rid = peerNum(remoteId);
  let pc = meshPeers.get(rid);
  if (!pc) {
    pc = new RTCPeerConnection({ iceServers: ICE });
    meshPeers.set(rid, pc);
    meshPendingIce.set(rid, []);
    wireMeshPc(pc, rid, groupId);
    localStream?.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
  }
  await pc.setRemoteDescription(offer);
  await flushMeshIce(rid, pc);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await sendSignal(groupId, rid, {
    signalKind: 'answer',
    sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
  });
}

async function ensureMeshVoice(group, activeSet) {
  const id = myId();
  const hostId = peerNum(group.hostId);
  if (activeSet.has(hostId)) return;
  for (const pid of activeSet) {
    if (pid === id || pid === hostId) continue;
    if (meshPeers.has(pid)) continue;
    if (id > pid) continue;
    sounds.outgoingCall();
    await createMeshOffer(pid, group.id);
  }
}

async function ensureClientToHost(group, { force = false } = {}) {
  const hostId = peerNum(group.hostId);
  if (!Number.isFinite(hostId) || hostId === myId()) return;
  if (clientPc && !force) {
    const st = clientPc.connectionState;
    if (st === 'connected') return;
    if (st === 'connecting' || st === 'new') return;
  }
  if (clientPc) {
    clientPc.close();
    clientPc = null;
    clientPendingIce = [];
  }

  clientPc = new RTCPeerConnection({ iceServers: ICE });
  clientPendingIce = [];

  localStream?.getTracks().forEach((tr) => clientPc.addTrack(tr, localStream));

  clientPc.ontrack = (ev) => {
    if (ev.track.kind === 'audio') {
      playRemoteMixedStream(ev.streams[0] || new MediaStream([ev.track]));
      sounds.stopOutgoingRing();
      sounds.callConnected();
      stageRefresh?.();
    }
    if (ev.track.kind === 'video') {
      peerVideoStreams.set(hostId, ev.streams[0] || new MediaStream([ev.track]));
      stageRefresh?.();
    }
  };

  clientPc.onconnectionstatechange = () => {
    if (clientPc?.connectionState === 'connected') {
      sounds.stopOutgoingRing();
      sounds.callConnected();
    }
    if (clientPc?.connectionState === 'failed') {
      clientPc?.close();
      clientPc = null;
    }
  };

  clientPc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    void sendSignal(activeGroupId, hostId, {
      signalKind: 'candidate',
      candidate: ev.candidate.toJSON(),
    });
  };

  const offer = await clientPc.createOffer();
  await clientPc.setLocalDescription(offer);
  await sendSignal(activeGroupId, hostId, {
    signalKind: 'offer',
    sdp: { type: clientPc.localDescription.type, sdp: clientPc.localDescription.sdp },
  });
}

export function registerVoiceStageRefresh(fn) {
  stageRefresh = typeof fn === 'function' ? fn : null;
}

export function isInVoiceChannel() {
  return !!(activeGroupId && activeChannelId && localStream);
}

export function getActiveVoiceChannel() {
  if (!activeGroupId || !activeChannelId) return null;
  return { groupId: activeGroupId, channelId: activeChannelId };
}

export function getParticipantMediaState(peerId) {
  const n = peerNum(peerId);
  if (n === myId()) return myMediaState();
  return peerMediaState.get(n) || { muted: false, deafened: false, screenSharing: false };
}

export async function joinVoiceChannel(groupId, channelId, api, config) {
  const group = getGroup(groupId);
  if (!group) return;
  apiRef = api;
  configRef = config;

  if (activeGroupId === groupId && activeChannelId === channelId && localStream) return;

  if (localStream) await leaveVoiceChannel();

  try {
    localStream = await getMic();
  } catch (err) {
    console.error('[voice-ch] mic:', err);
    showAppToast({ title: t('group.call_mic_failed'), variant: 'danger', durationMs: 5000 });
    return;
  }

  activeGroupId = groupId;
  activeChannelId = channelId;
  muted = false;
  deafened = false;

  await resumeVoiceAudioContexts();

  addChannelParticipant(groupId, channelId, myId());
  await broadcastRoster(groupId, channelId);

  if (isHost(group)) {
    ensureMixer();
    attachHostLocalMic();
    ensureHostPlayback();
    void pushMixedAudioToAll();
    sounds.callConnected();
    const participants = channelParticipants(groupId, channelId);
    for (const pid of participants) {
      if (pid === myId()) continue;
      void sendSignal(groupId, pid, { signalKind: 'reconnect' });
    }
    for (const [rid, off] of pendingHostOffers) {
      await handleHostOffer(rid, groupId, off);
    }
    pendingHostOffers.clear();
  } else {
    sounds.outgoingCall();
    await ensureClientToHost(group, { force: true });
  }

  startHeartbeat(groupId, channelId);
  dispatchReactiveAudio({ active: true, stream: localStream });
  stageRefresh?.();
}

export async function leaveVoiceChannel() {
  const gid = activeGroupId;
  const cid = activeChannelId;
  const id = myId();
  stopHeartbeat();

  if (gid && cid && Number.isFinite(id)) {
    removeChannelParticipant(gid, cid, id);
    await broadcastRoster(gid, cid, { leaver: id });
    const left = channelParticipants(gid, cid);
    if (!left.length) await broadcastRoster(gid, cid, { end: true });
  }

  screenStream?.getTracks().forEach((tr) => tr.stop());
  screenStream = null;
  sharingScreen = false;
  localStream?.getTracks().forEach((tr) => tr.stop());
  localStream = null;

  for (const pid of [...hostPeers.keys()]) disconnectHostPeer(pid);
  hostPeers.clear();
  hostPendingIce.clear();

  if (clientPc) {
    clientPc.close();
    clientPc = null;
  }
  clientPendingIce = [];

  for (const pid of [...meshPeers.keys()]) disconnectMeshPeer(pid);
  meshPeers.clear();
  meshPendingIce.clear();

  clearPlayback();
  const audio = document.getElementById('voice-ch-remote-audio');
  if (audio) audio.remove();

  if (audioCtx) {
    try {
      await audioCtx.close();
    } catch {
      /* ignore */
    }
    audioCtx = null;
    mixerGain = null;
    mixDestination = null;
    mixerSources.clear();
    mixerTracks.clear();
    mixerTaps.clear();
    mixedTrack = null;
  }

  peerMediaState.clear();
  peerVideoStreams.clear();
  pendingHostOffers.clear();
  localScreenPreview = null;
  activeGroupId = null;
  activeChannelId = null;
  sounds.stopOutgoingRing();
  dispatchReactiveAudio({ active: false });
  stageRefresh?.();
}

export function getPeerVideoStream(peerId) {
  return peerVideoStreams.get(peerNum(peerId)) || null;
}

export function getLocalScreenPreview() {
  return localScreenPreview;
}

export async function toggleVoiceMute() {
  muted = !muted;
  localStream?.getAudioTracks().forEach((tr) => {
    tr.enabled = !muted;
  });
  if (activeGroupId && activeChannelId) void broadcastRoster(activeGroupId, activeChannelId);
  stageRefresh?.();
}

export async function toggleVoiceDeafen() {
  deafened = !deafened;
  const audio = document.getElementById('voice-ch-remote-audio');
  if (audio) audio.muted = deafened;
  if (activeGroupId && activeChannelId) void broadcastRoster(activeGroupId, activeChannelId);
  stageRefresh?.();
}

export function isVoiceMuted() {
  return muted;
}

export function isVoiceDeafened() {
  return deafened;
}

export async function handleVoiceChRoster(msg, api, config) {
  const group = getGroup(msg.groupId);
  const id = peerNum(config?.blipId);
  if (!group || !group.members.some((m) => peerNum(m) === id)) return;

  applyVoiceChRosterFromTcp(msg);

  if (msg.states && typeof msg.states === 'object') {
    for (const [pid, st] of Object.entries(msg.states)) {
      const n = peerNum(pid);
      if (!Number.isFinite(n)) continue;
      peerMediaState.set(n, {
        muted: !!st.muted,
        deafened: !!st.deafened,
        screenSharing: !!st.screenSharing,
      });
    }
  }

  stageRefresh?.();

  if (!localStream || activeGroupId !== msg.groupId || activeChannelId !== msg.channelId) return;

  const participants = (msg.participants || []).map(peerNum).filter(Number.isFinite);
  const activeSet = new Set(participants);

  const hostId = peerNum(group.hostId);
  const hostIn = activeSet.has(hostId);

  if (isHost(group)) {
    for (const rid of [...hostPeers.keys()]) {
      if (!activeSet.has(rid)) disconnectHostPeer(rid);
    }
    attachHostLocalMic();
    ensureHostPlayback();
    await pushMixedAudioToAll();
  } else if (hostIn) {
    for (const pid of [...meshPeers.keys()]) disconnectMeshPeer(pid);
    await ensureClientToHost(group, {
      force: !clientPc || clientPc.connectionState !== 'connected',
    });
  } else {
    if (clientPc) {
      clientPc.close();
      clientPc = null;
      clientPendingIce = [];
    }
    await ensureMeshVoice(group, activeSet);
  }
}

export async function handleVoiceChSignal(msg, api, config) {
  const group = getGroup(msg.groupId);
  const id = peerNum(config?.blipId);
  if (!group) return;

  apiRef = api;
  configRef = config;

  const hostId = peerNum(group.hostId);
  const origin = peerNum(msg.originFrom ?? msg.from);
  const target = peerNum(msg.target ?? msg.to);
  const remoteId = origin === id ? target : origin;

  if (target !== id && origin !== id) return;

  const offer = normalizeSdp(msg.sdp);

  const hostIn = channelParticipants(msg.groupId, msg.channelId).includes(hostId);
  const inChannel =
    activeGroupId === msg.groupId && activeChannelId === msg.channelId && localStream;

  if (msg.signalKind === 'reconnect' && !isHost(group) && inChannel && hostIn) {
    if (clientPc) {
      clientPc.close();
      clientPc = null;
      clientPendingIce = [];
    }
    sounds.outgoingCall();
    await ensureClientToHost(group, { force: true });
    return;
  }

  if (msg.signalKind === 'offer' && isHost(group) && offer) {
    await handleHostOffer(remoteId, msg.groupId, offer);
    return;
  }

  if (msg.signalKind === 'offer' && !isHost(group) && offer && inChannel && !hostIn) {
    await handleMeshOffer(remoteId, msg.groupId, offer);
    return;
  }

  if (msg.signalKind === 'answer' && !isHost(group) && clientPc && offer) {
    await clientPc.setRemoteDescription(offer);
    await flushClientIce(clientPc);
    await resumeVoiceAudioContexts();
    return;
  }

  if (msg.signalKind === 'answer' && isHost(group) && hostPeers.get(remoteId) && offer) {
    const pc = hostPeers.get(remoteId);
    await pc.setRemoteDescription(offer);
    await flushHostIce(remoteId, pc);
    return;
  }

  if (msg.signalKind === 'answer' && meshPeers.get(remoteId) && offer) {
    const pc = meshPeers.get(remoteId);
    await pc.setRemoteDescription(offer);
    await flushMeshIce(remoteId, pc);
    sounds.stopOutgoingRing();
    sounds.callConnected();
    return;
  }

  if (msg.signalKind === 'ren-offer' && offer) {
    let pc = isHost(group)
      ? hostPeers.get(remoteId)
      : meshPeers.get(remoteId) || (origin === hostId ? clientPc : null);
    if (!pc) return;
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal(msg.groupId, remoteId, {
      signalKind: 'ren-answer',
      sdp: { type: answer.type, sdp: answer.sdp },
    });
    return;
  }

  if (msg.signalKind === 'ren-answer' && offer) {
    const pc = hostPeers.get(remoteId) || meshPeers.get(remoteId) || clientPc;
    if (!pc) return;
    await pc.setRemoteDescription(offer);
    return;
  }

  if (msg.signalKind === 'candidate') {
    const cand = msg.candidate;
    if (isHost(group)) {
      const pc = hostPeers.get(remoteId);
      if (!pc) return;
      if (!pc.remoteDescription) {
        const q = hostPendingIce.get(remoteId) || [];
        q.push(cand);
        hostPendingIce.set(remoteId, q);
        return;
      }
      try {
        await pc.addIceCandidate(cand);
      } catch {
        /* ignore */
      }
    } else if (clientPc) {
      if (!clientPc.remoteDescription) {
        clientPendingIce.push(cand);
        return;
      }
      try {
        await clientPc.addIceCandidate(cand);
      } catch {
        /* ignore */
      }
    } else if (meshPeers.get(remoteId)) {
      const pc = meshPeers.get(remoteId);
      if (!pc.remoteDescription) {
        const q = meshPendingIce.get(remoteId) || [];
        q.push(cand);
        meshPendingIce.set(remoteId, q);
        return;
      }
      try {
        await pc.addIceCandidate(cand);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function toggleVoiceScreenShare() {
  if (!localStream || !activeGroupId || !activeChannelId) return;
  if (sharingScreen) {
    screenStream?.getTracks().forEach((tr) => tr.stop());
    screenStream = null;
    sharingScreen = false;
    localScreenPreview = null;
    peerVideoStreams.delete(myId());
    await syncScreenVideoOut();
    stageRefresh?.();
    void broadcastRoster(activeGroupId, activeChannelId);
    return;
  }
  try {
    const pick = await openScreenPickerDialog();
    if (!pick?.sourceId) return;
    const stream = await captureDisplayStream(pick.sourceId, configRef, {
      withAudio: !!pick.withAudio,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('No screen track');
    await applyScreenTrackConstraints(track, configRef);
    screenStream = stream;
    sharingScreen = true;
    localScreenPreview = stream;
    peerVideoStreams.set(myId(), stream);
    track.onended = () => {
      void toggleVoiceScreenShare();
    };
    await syncScreenVideoOut();
    void broadcastRoster(activeGroupId, activeChannelId);
    stageRefresh?.();
  } catch (err) {
    console.warn('[voice-ch] screen:', err?.message || err);
    showAppToast({ title: t('call.share_failed'), variant: 'danger', durationMs: 5000 });
  }
}

export function isVoiceScreenSharing() {
  return sharingScreen;
}

export async function onGroupHostChanged(groupId) {
  if (activeGroupId === groupId && localStream) {
    await leaveVoiceChannel();
    showAppToast({
      title: t('voice.host_changed'),
      body: t('voice.rejoin_channel'),
      durationMs: 6000,
    });
  }
}
