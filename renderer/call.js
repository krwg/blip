import { t, applyI18n } from './i18n.js';
import { sounds } from './audio.js';
import { createAvatarElement } from './avatar.js';
import { createTrustedAvatarElement } from './trust-ui.js';
import {
  getCameraVideoConstraints,
  applyScreenTrackConstraints,
  tuneVideoSender,
  trackLooksLikeScreen,
  applyCallFullscreenLayout,
} from './call-media.js';
import { openScreenPickerDialog } from './screen-picker-dialog.js';
import { captureDisplayStream } from './display-capture.js';
import { formatBlipErrorCode } from '../shared/blip-errors.js';
import { formatBlipErrorToast } from './blip-error-hints.js';
import { getVoiceMediaStream, getVoiceAudioConstraints } from './audio-capture.js';
import { dispatchReactiveAudio } from './reactive-wallpaper.js';
import { bindCallWaveform } from './call-waveform.js';
import { createStreamLevelMeter } from './call-audio-level.js';
import {
  getPeerCallVolumePct,
  setPeerCallVolumePct,
} from './peer-call-volume.js';
import {
  toSdpWire,
  normalizeSdp,
  normalizeCandidate,
  formatCallDuration,
  createCallPeerConnection,
} from './call-signalling.js';

let activeCall = null;
let pendingCandidates = [];
let pendingOffer = null;

export { toSdpWire };

function createPeerConnection(onRemoteStream, cfg) {
  return createCallPeerConnection({
    cfg,
    onRemoteStream,
    onIceCandidate: (json) => {
      if (activeCall?.onCandidate) activeCall.onCandidate(json);
    },
  });
}

function formatDuration(ms) {
  return formatCallDuration(ms);
}

export function createCallUI(config, api, options = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'call-overlay hidden';

  const inner = document.createElement('div');
  inner.className = 'call-inner glass';

  const statusEl = document.createElement('div');
  statusEl.className = 'call-status';

  const videoWrap = document.createElement('div');
  videoWrap.className = 'call-video-wrap hidden';
  const localVideo = document.createElement('video');
  localVideo.className = 'call-video local';
  localVideo.autoplay = true;
  localVideo.muted = true;
  localVideo.playsInline = true;
  const remoteVideo = document.createElement('video');
  remoteVideo.className = 'call-video remote';
  remoteVideo.autoplay = true;
  remoteVideo.playsInline = true;
  remoteVideo.muted = true;
  const remoteAudio = document.createElement('audio');
  remoteAudio.className = 'call-remote-audio';
  remoteAudio.autoplay = true;
  remoteAudio.playsInline = true;
  const gridOverlay = document.createElement('div');
  gridOverlay.className = 'video-pixel-grid';
  videoWrap.appendChild(remoteVideo);
  videoWrap.appendChild(localVideo);
  videoWrap.appendChild(gridOverlay);

  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.className = 'call-video-fs-btn btn btn-accent hidden';
  fsBtn.dataset.i18n = 'call.fullscreen';
  fsBtn.textContent = t('call.fullscreen');
  fsBtn.title = t('call.fullscreen');
  videoWrap.appendChild(fsBtn);

  const streamExitBtn = document.createElement('button');
  streamExitBtn.type = 'button';
  streamExitBtn.className = 'call-video-stream-exit-btn btn btn-accent hidden';
  streamExitBtn.dataset.i18n = 'call.exit_stream';
  streamExitBtn.textContent = t('call.exit_stream');
  streamExitBtn.title = t('call.exit_stream');
  videoWrap.appendChild(streamExitBtn);

  const voiceWrap = document.createElement('div');
  voiceWrap.className = 'call-voice-wrap hidden';
  const avatarSlot = document.createElement('div');
  avatarSlot.className = 'call-avatar-slot';

  function mountCallAvatar(id) {
    avatarSlot.innerHTML = '';
    const remotePeer =
      typeof options.getRemotePeer === 'function' ? options.getRemotePeer() : null;
    avatarSlot.appendChild(
      createTrustedAvatarElement(id, 6, { selfBlipId: config?.blipId ?? null })
    );
  }
  const waveform = document.createElement('div');
  waveform.className = 'call-waveform';
  for (let i = 0; i < 8; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    waveform.appendChild(bar);
  }
  voiceWrap.appendChild(avatarSlot);
  voiceWrap.appendChild(waveform);
  const micWaveform = bindCallWaveform(waveform);

  const streamPip = document.createElement('button');
  streamPip.type = 'button';
  streamPip.className = 'call-stream-pip hidden';
  streamPip.title = t('call.watch_stream');
  const streamPipVideo = document.createElement('video');
  streamPipVideo.className = 'call-stream-pip-video';
  streamPipVideo.autoplay = true;
  streamPipVideo.playsInline = true;
  streamPipVideo.muted = true;
  const streamPipLabel = document.createElement('span');
  streamPipLabel.className = 'call-stream-pip-label';
  streamPipLabel.dataset.i18n = 'call.watch_stream';
  streamPipLabel.textContent = t('call.watch_stream');
  streamPip.appendChild(streamPipVideo);
  streamPip.appendChild(streamPipLabel);
  voiceWrap.appendChild(streamPip);

  const peerStatus = document.createElement('div');
  peerStatus.className = 'call-peer-status hidden';
  const remoteMicBadge = document.createElement('span');
  remoteMicBadge.className = 'call-peer-badge call-peer-badge--mic hidden';
  remoteMicBadge.dataset.i18n = 'call.remote_muted';
  remoteMicBadge.textContent = t('call.remote_muted');
  const remoteDeafBadge = document.createElement('span');
  remoteDeafBadge.className = 'call-peer-badge call-peer-badge--deaf hidden';
  remoteDeafBadge.dataset.i18n = 'call.remote_deaf';
  remoteDeafBadge.textContent = t('call.remote_deaf');
  peerStatus.appendChild(remoteMicBadge);
  peerStatus.appendChild(remoteDeafBadge);

  const timerEl = document.createElement('div');
  timerEl.className = 'call-timer';
  timerEl.textContent = '00:00';

  const controls = document.createElement('div');
  controls.className = 'call-controls';

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'btn btn-accent';
  muteBtn.dataset.i18n = 'call.mute';
  muteBtn.textContent = t('call.mute');

  const deafenBtn = document.createElement('button');
  deafenBtn.type = 'button';
  deafenBtn.className = 'btn btn-accent';
  deafenBtn.dataset.i18n = 'call.deafen';
  deafenBtn.textContent = t('call.deafen');

  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.className = 'btn btn-accent hidden';
  shareBtn.dataset.i18n = 'call.share';
  shareBtn.textContent = t('call.share');

  const endBtn = document.createElement('button');
  endBtn.type = 'button';
  endBtn.className = 'btn btn-danger';
  endBtn.dataset.i18n = 'call.end';
  endBtn.textContent = t('call.end');

  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'btn btn-accent hidden';
  acceptBtn.dataset.i18n = 'call.accept';
  acceptBtn.textContent = t('call.accept');

  const rejectBtn = document.createElement('button');
  rejectBtn.type = 'button';
  rejectBtn.className = 'btn btn-danger hidden';
  rejectBtn.dataset.i18n = 'call.reject';
  rejectBtn.textContent = t('call.reject');

  controls.appendChild(muteBtn);
  controls.appendChild(deafenBtn);

  const volWrap = document.createElement('label');
  volWrap.className = 'call-volume-wrap hidden';
  volWrap.title = t('call.volume');
  const volLabel = document.createElement('span');
  volLabel.className = 'call-volume-label';
  volLabel.dataset.i18n = 'call.volume';
  volLabel.textContent = t('call.volume');
  const volRange = document.createElement('input');
  volRange.type = 'range';
  volRange.className = 'call-volume-range';
  volRange.min = '0';
  volRange.max = '200';
  volRange.step = '5';
  volRange.value = '100';
  const volValue = document.createElement('span');
  volValue.className = 'call-volume-value';
  volValue.textContent = t('call.volume_pct').replace('{pct}', '100');
  volWrap.append(volLabel, volRange, volValue);

  controls.appendChild(volWrap);
  controls.appendChild(shareBtn);
  controls.appendChild(acceptBtn);
  controls.appendChild(rejectBtn);
  controls.appendChild(endBtn);

  inner.appendChild(statusEl);
  inner.appendChild(videoWrap);
  inner.appendChild(voiceWrap);
  inner.appendChild(peerStatus);
  inner.appendChild(timerEl);
  inner.appendChild(controls);
  overlay.appendChild(inner);
  overlay.appendChild(remoteAudio);

  let localStream = null;
  let pc = null;
  let peerId = null;
  let withVideo = false;
  let muted = false;
  let deafened = false;
  let peerOutputVolumePct = 100;
  let remoteOutCtx = null;
  let remoteGainNode = null;
  let remoteMediaSource = null;
  let sharingScreen = false;
  let screenStream = null;
  let savedCameraTrack = null;
  let remotePlayback = null;
  let outgoingAudioCtx = null;
  let remoteMuted = false;
  let remoteDeafened = false;
  let renegotiateAnswerResolve = null;
  let timerInterval = null;
  let callStart = null;
  let pulseTimer = null;
  let incomingOffer = null;
  let stageActive = false;
  let remotePeerScreenSharing = false;
  let remoteScreenHeld = false;
  let heldRemoteScreenStream = null;
  let pseudoFullscreen = false;
  let stateHeartbeat = null;
  let overlayReportTimer = null;
  let pushToTalkActive = false;
  let pttHeld = false;
  const localMicMeter = createStreamLevelMeter();
  const remoteMicMeter = createStreamLevelMeter();

  function readPushToTalkFromConfig(cfg) {
    return {
      enabled: cfg?.pushToTalkEnabled === true,
      key: String(cfg?.pushToTalkKey || 'v').trim().toLowerCase() || 'v',
    };
  }

  function applyMicTransmission() {
    const transmit = !muted && (!pushToTalkActive || pttHeld);
    localStream?.getAudioTracks().forEach((tr) => {
      tr.enabled = transmit;
    });
    micWaveform.setMuted(!transmit);
    muteBtn.classList.toggle('active', muted || (pushToTalkActive && !pttHeld));
  }

  function refreshPushToTalkMode(cfg) {
    const next = readPushToTalkFromConfig(cfg);
    const was = pushToTalkActive;
    pushToTalkActive = next.enabled;
    if (pushToTalkActive && !was) {
      pttHeld = false;
    }
    applyMicTransmission();
  }

  function setPttHeld(next) {
    if (!pushToTalkActive) return;
    pttHeld = !!next;
    applyMicTransmission();
    pushOverlayMediaState();
  }

  function pushOverlayMediaState() {
    const localLevel = localMicMeter.getLevel();
    const peerSpeaking =
      !remoteMuted &&
      !remoteDeafened &&
      remoteMicMeter.isSpeaking({ threshold: 0.07, muted: remoteMuted });
    api.reportCallLocalState?.({
      muted,
      deafened,
      localMicLevel: localLevel,
      peerSpeaking,
      pttHeld,
      pushToTalkActive,
    }).catch?.(() => {});
  }

  function startOverlayMediaReports() {
    stopOverlayMediaReports();
    pushOverlayMediaState();
    overlayReportTimer = setInterval(() => pushOverlayMediaState(), 200);
  }

  function stopOverlayMediaReports() {
    if (overlayReportTimer) clearInterval(overlayReportTimer);
    overlayReportTimer = null;
  }

  let stageMode = 'off';

  function hasLiveVideo(stream) {
    const track = stream?.getVideoTracks?.()?.[0];
    return !!(track && track.readyState === 'live' && track.enabled);
  }

  function clearHeldRemoteScreen() {
    remoteScreenHeld = false;
    heldRemoteScreenStream = null;
    streamPipVideo.srcObject = null;
    streamPip.classList.add('hidden');
  }

  function showStreamPip(stream) {
    if (!stream || !hasLiveVideo(stream)) {
      clearHeldRemoteScreen();
      return;
    }
    remoteScreenHeld = true;
    heldRemoteScreenStream = stream;
    streamPipVideo.srcObject = stream;
    streamPip.classList.remove('hidden');
    void streamPipVideo.play?.().catch(() => {});
  }

  function enterRemoteStreamView() {
    if (!heldRemoteScreenStream || !hasLiveVideo(heldRemoteScreenStream)) {
      clearHeldRemoteScreen();
      refreshStageLayout();
      return;
    }
    remotePeerScreenSharing = true;
    remoteVideo.srcObject = heldRemoteScreenStream;
    videoWrap.classList.remove('hidden');
    voiceWrap.classList.add('hidden');
    streamPip.classList.add('hidden');
    setStageView('remote');
    void remoteVideo.play?.().catch(() => {});
  }

  function startStateHeartbeat() {
    stopStateHeartbeat();
    stateHeartbeat = setInterval(() => broadcastCallState(), 4000);
  }

  function stopStateHeartbeat() {
    if (stateHeartbeat) clearInterval(stateHeartbeat);
    stateHeartbeat = null;
  }

  function syncStreamExitButton() {
    const remoteScreen =
      remotePeerScreenSharing ||
      (hasLiveVideo(remoteVideo.srcObject) &&
        trackLooksLikeScreen(remoteVideo.srcObject.getVideoTracks()[0]));
    const show = !sharingScreen && stageActive && remoteScreen;
    streamExitBtn.classList.toggle('hidden', !show);
  }

  function exitRemoteStreamView() {
    const screenStream =
      remoteVideo.srcObject && hasLiveVideo(remoteVideo.srcObject)
        ? remoteVideo.srcObject
        : heldRemoteScreenStream;
    remotePeerScreenSharing = false;
    // Keep remote screen media for PiP + continued audio; leave theater mode.
    if (screenStream && hasLiveVideo(screenStream)) {
      showStreamPip(screenStream);
    } else {
      clearHeldRemoteScreen();
    }
    remoteVideo.srcObject = null;
    setStageView('off');
    videoWrap.classList.add('hidden');
    voiceWrap.classList.remove('hidden');
    streamExitBtn.classList.add('hidden');
    void exitPseudoFullscreen();
  }

  function reconcileRemoteVideo() {
    if (sharingScreen) return;
    if (remotePeerScreenSharing) return;
    if (remoteScreenHeld) {
      if (!heldRemoteScreenStream || !hasLiveVideo(heldRemoteScreenStream)) {
        clearHeldRemoteScreen();
      }
      return;
    }
    const vTrack = remoteVideo.srcObject?.getVideoTracks?.()?.[0];
    if (vTrack && trackLooksLikeScreen(vTrack)) {
      exitRemoteStreamView();
      return;
    }
    if (hasLiveVideo(remoteVideo.srcObject)) return;
    remoteVideo.srcObject = null;
    if (!withVideo) {
      setStageView('off');
      videoWrap.classList.add('hidden');
      voiceWrap.classList.remove('hidden');
      void exitPseudoFullscreen();
    } else {
      refreshStageLayout();
    }
    syncStreamExitButton();
  }

  function setStageView(mode) {
    stageMode = mode;
    const active = mode !== 'off';
    stageActive = active;
    overlay.classList.toggle('call-overlay--theater', active);
    inner.classList.toggle('call-inner--stage', active);
    videoWrap.classList.toggle('call-video-wrap--stage', active);
    videoWrap.classList.toggle('call-video-wrap--camera', !active);
    videoWrap.classList.toggle('call-video-wrap--local-primary', mode === 'local');
    videoWrap.classList.toggle('call-video-wrap--remote-primary', mode === 'remote' || mode === 'both');
    gridOverlay.classList.add('hidden');
    fsBtn.classList.toggle('hidden', !active);

    remoteVideo.classList.toggle('hidden', mode === 'local');
    localVideo.classList.toggle('hidden', mode === 'remote');

    remoteVideo.classList.toggle('call-video--stage', mode === 'remote' || mode === 'both');
    remoteVideo.classList.toggle('call-video--camera', mode === 'off');
    localVideo.classList.toggle('call-video--stage', mode === 'local' || mode === 'both');
    localVideo.classList.toggle('call-video--camera', mode === 'off');

    if (mode === 'both') {
      localVideo.classList.remove('hidden');
    }
    syncStreamExitButton();
  }

  function refreshStageLayout() {
    const remoteTrack = hasLiveVideo(remoteVideo.srcObject)
      ? remoteVideo.srcObject.getVideoTracks()[0]
      : null;
    const remoteScreen =
      remotePeerScreenSharing || (remoteTrack && trackLooksLikeScreen(remoteTrack));
    const anyScreen = sharingScreen || remoteScreen;

    if (!anyScreen) {
      const hadVideo = withVideo || remoteTrack;
      setStageView('off');
      if (hadVideo) {
        remoteVideo.classList.add('call-video--camera');
        localVideo.classList.add('call-video--camera');
      }
      return;
    }

    if (sharingScreen && remoteScreen) {
      setStageView('both');
    } else if (sharingScreen) {
      const remoteCamera = hasLiveVideo(remoteVideo.srcObject);
      setStageView(remoteCamera ? 'both' : 'local');
    } else {
      setStageView('remote');
    }
    syncStreamExitButton();
  }

  function getFullscreenTarget() {
    if (sharingScreen) return localVideo;
    if (stageActive && remoteVideo.srcObject) return remoteVideo;
    return remoteVideo.srcObject ? remoteVideo : localVideo;
  }

  function activeStageVideo() {
    if (sharingScreen) return localVideo;
    if (stageMode === 'remote' || stageMode === 'both') return remoteVideo;
    return remoteVideo.srcObject ? remoteVideo : localVideo;
  }

  async function exitPseudoFullscreen() {
    if (window.blip?.callWindowIsFullScreen) {
      try {
        if (await window.blip.callWindowIsFullScreen()) {
          await window.blip.callWindowToggleFullScreen();
        }
      } catch {

      }
    }
    if (!pseudoFullscreen && !document.fullscreenElement) return;
    pseudoFullscreen = false;
    document.getElementById('call-shell')?.classList.remove('call-shell--video-fs');
    videoWrap.classList.remove('call-video-wrap--fullscreen');
    overlay.classList.remove('call-overlay--theater-fs');
    applyCallFullscreenLayout(videoWrap, null, config, false);
    syncFullscreenButton();
  }

  async function toggleVideoFullscreen() {
    if (fsBtn.classList.contains('hidden')) return;
    if (window.blip?.callWindowToggleFullScreen) {
      try {
        pseudoFullscreen = !!(await window.blip.callWindowToggleFullScreen());
        const shell = document.getElementById('call-shell');
        shell?.classList.toggle('call-shell--video-fs', pseudoFullscreen);
        videoWrap.classList.toggle('call-video-wrap--fullscreen', pseudoFullscreen);
        overlay.classList.toggle('call-overlay--theater-fs', pseudoFullscreen);
        if (pseudoFullscreen) {
          applyCallFullscreenLayout(videoWrap, activeStageVideo(), config, true);
        } else {
          applyCallFullscreenLayout(videoWrap, null, config, false);
        }
        syncFullscreenButton();
        void ensureRemoteAudioPlaying();
        return;
      } catch (err) {
        console.warn('[call] window fullscreen:', err.message);
      }
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (pseudoFullscreen) {
        exitPseudoFullscreen();
        return;
      }
      const host = videoWrap;
      if (host.requestFullscreen) {
        await host.requestFullscreen();
        applyCallFullscreenLayout(videoWrap, activeStageVideo(), config, true);
        return;
      }
      if (host.webkitRequestFullscreen) {
        host.webkitRequestFullscreen();
        return;
      }
    } catch (err) {
      console.warn('[call] native fullscreen:', err.message);
    }
    pseudoFullscreen = !pseudoFullscreen;
    const shell = document.getElementById('call-shell');
    shell?.classList.toggle('call-shell--video-fs', pseudoFullscreen);
    videoWrap.classList.toggle('call-video-wrap--fullscreen', pseudoFullscreen);
    overlay.classList.toggle('call-overlay--theater-fs', pseudoFullscreen);
    applyCallFullscreenLayout(videoWrap, pseudoFullscreen ? activeStageVideo() : null, config, pseudoFullscreen);
    syncFullscreenButton();
    void ensureRemoteAudioPlaying();
  }

  function syncFullscreenButton() {
    const on = !!document.fullscreenElement || pseudoFullscreen;
    fsBtn.dataset.i18n = on ? 'call.exit_fullscreen' : 'call.fullscreen';
    fsBtn.textContent = t(on ? 'call.exit_fullscreen' : 'call.fullscreen');
    fsBtn.title = fsBtn.textContent;
  }

  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    applyCallFullscreenLayout(videoWrap, on ? activeStageVideo() : null, config, on);
    if (!on) exitPseudoFullscreen();
    syncFullscreenButton();
    void ensureRemoteAudioPlaying();
  });

  function show() {
    overlay.classList.remove('hidden');
  }

  function setConnectedStatus() {
    statusEl.dataset.i18n = 'call.connected';
    statusEl.textContent = t('call.connected');
  }

  function hide() {
    overlay.classList.add('hidden');
    cleanup();
    options.onClosed?.();
  }

  function cleanup() {
    stopStateHeartbeat();
    sounds.stopIncomingRing();
    sounds.stopOutgoingRing();
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    exitPseudoFullscreen();
    setStageView('off');
    remotePeerScreenSharing = false;
    clearHeldRemoteScreen();
    clearInterval(timerInterval);
    clearInterval(pulseTimer);
    pulseTimer = null;
    timerInterval = null;
    pendingCandidates = [];
    pendingOffer = null;
    incomingOffer = null;
    if (screenStream) {
      screenStream.getTracks().forEach((tr) => tr.stop());
      screenStream = null;
    }
    sharingScreen = false;
    savedCameraTrack = null;
    renegotiateAnswerResolve = null;
    if (localStream) {
      localStream.getTracks().forEach((tr) => tr.stop());
      localStream = null;
    }
    micWaveform.stop();
    remoteMicMeter.stop();
    localMicMeter.stop();
    stopOverlayMediaReports();
    if (pc) {
      pc.close();
      pc = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    remoteAudio.srcObject = null;
    teardownRemoteGain();
    remotePlayback = null;
    if (outgoingAudioCtx) {
      void outgoingAudioCtx.close();
      outgoingAudioCtx = null;
    }
    activeCall = null;
    dispatchReactiveAudio({ active: false });
    inner.style.borderColor = '';
    acceptBtn.classList.add('hidden');
    rejectBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');
    shareBtn.classList.add('hidden');
    sharingScreen = false;
    screenStream = null;
    savedCameraTrack = null;
    remoteMuted = false;
    remoteDeafened = false;
    renegotiateAnswerResolve = null;
    setShareButton(false);
    peerStatus.classList.add('hidden');
    remoteMicBadge.classList.add('hidden');
    remoteDeafBadge.classList.add('hidden');
  }

  function updateRemoteBadges() {
    const active = !!pc && !incomingOffer;
    peerStatus.classList.toggle('hidden', !active);
    remoteMicBadge.classList.toggle('hidden', !remoteMuted);
    remoteDeafBadge.classList.toggle('hidden', !remoteDeafened);
  }

  function applyRemoteState(state) {
    remoteMuted = !!state?.muted;
    remoteDeafened = !!state?.deafened;
    if (typeof state?.screenSharing === 'boolean') {
      if (!state.screenSharing) {
        remotePeerScreenSharing = false;
        clearHeldRemoteScreen();
        remoteVideo.srcObject = null;
        setStageView('off');
        videoWrap.classList.add('hidden');
        voiceWrap.classList.remove('hidden');
        streamExitBtn.classList.add('hidden');
        void exitPseudoFullscreen();
      } else {
        remotePeerScreenSharing = true;
        remoteScreenHeld = false;
        streamPip.classList.add('hidden');
        refreshStageLayout();
      }
    }
    updateRemoteBadges();
  }

  function broadcastCallState() {
    if (!peerId || !pc || !api.callState) return;
    api
      .callState({
        to: peerId,
        muted,
        deafened,
        screenSharing: sharingScreen,
      })
      .catch(() => {});
    api.reportCallLocalState?.({ muted, deafened }).catch?.(() => {});
  }

  function mergeRemotePlayback(stream) {
    if (!remotePlayback) remotePlayback = new MediaStream();
    for (const track of stream.getTracks()) {
      remotePlayback
        .getTracks()
        .filter((t) => t.kind === track.kind && t.id !== track.id)
        .forEach((t) => remotePlayback.removeTrack(t));
      if (!remotePlayback.getTracks().some((t) => t.id === track.id)) {
        remotePlayback.addTrack(track);
      }
    }
    return remotePlayback;
  }

  async function restoreMicAudioSender() {
    if (outgoingAudioCtx) {
      try {
        await outgoingAudioCtx.close();
      } catch {

      }
      outgoingAudioCtx = null;
    }
    const mic = localStream?.getAudioTracks()[0];
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'audio');
    if (mic && sender) await sender.replaceTrack(mic);
  }

  async function applyScreenShareAudioMix() {
    const screenAudio = screenStream?.getAudioTracks()[0];
    const mic = localStream?.getAudioTracks()[0];
    if (!screenAudio || !mic) return;
    await restoreMicAudioSender();
    outgoingAudioCtx = new AudioContext();
    const dest = outgoingAudioCtx.createMediaStreamDestination();
    outgoingAudioCtx.createMediaStreamSource(new MediaStream([mic])).connect(dest);
    outgoingAudioCtx.createMediaStreamSource(new MediaStream([screenAudio])).connect(dest);
    const mixed = dest.stream.getAudioTracks()[0];
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender && mixed) await sender.replaceTrack(mixed);
  }

  function setShareButton(active) {
    shareBtn.classList.toggle('active', active);
    shareBtn.dataset.i18n = active ? 'call.share_stop' : 'call.share';
    shareBtn.textContent = t(active ? 'call.share_stop' : 'call.share');
  }

  function showInCallControls() {
    shareBtn.classList.remove('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');
    volWrap.classList.remove('hidden');
    peerOutputVolumePct = getPeerCallVolumePct(peerId);
    applyPeerOutputGain();
    updateRemoteBadges();
    broadcastCallState();
    startStateHeartbeat();
    startOverlayMediaReports();
  }

  async function waitRenegotiateAnswer() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        renegotiateAnswerResolve = null;
        reject(new Error('Renegotiation timeout'));
      }, 15000);
      renegotiateAnswerResolve = () => {
        clearTimeout(timer);
        renegotiateAnswerResolve = null;
        resolve();
      };
    });
  }

  async function renegotiateAsOffer() {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const offerWire = toSdpWire(pc.localDescription);
    if (!offerWire) throw new Error('Invalid local SDP');
    const wait = waitRenegotiateAnswer();
    const result = await api.callRenegotiate({ to: peerId, sdp: offerWire });
    if (!result?.ok) throw new Error(result?.error || 'Renegotiation failed');
    await wait;
  }

  function getVideoSender() {
    return pc?.getSenders().find((s) => s.track?.kind === 'video') ?? null;
  }

  async function applyOutgoingVideoTrack(track, { screenShare = false } = {}) {
    const sender = getVideoSender();
    if (sender) {
      await sender.replaceTrack(track);
      await tuneVideoSender(sender, { screenShare, config });
      return;
    }
    if (!track) return;
    const stream = new MediaStream([track]);
    pc.addTrack(track, stream);
    await renegotiateAsOffer();
    await tuneVideoSender(getVideoSender(), { screenShare, config });
  }

  async function removeOutgoingVideo() {
    const sender = getVideoSender();
    if (!sender) return;
    if (typeof pc.removeTrack === 'function') {
      pc.removeTrack(sender);
    } else {
      await sender.replaceTrack(null);
    }
    await renegotiateAsOffer();
  }

  async function stopScreenShare() {
    if (!sharingScreen) return;
    sharingScreen = false;
    setShareButton(false);

    if (screenStream) {
      screenStream.getTracks().forEach((tr) => tr.stop());
      screenStream = null;
    }

    const restore = savedCameraTrack;
    savedCameraTrack = null;

    try {
      if (withVideo && restore) {
        await applyOutgoingVideoTrack(restore, { screenShare: false });
        localVideo.srcObject = new MediaStream([restore]);
        refreshStageLayout();
        localVideo.classList.remove('hidden');
      } else if (!withVideo) {
        await removeOutgoingVideo();
        videoWrap.classList.add('hidden');
        voiceWrap.classList.remove('hidden');
        localVideo.srcObject = null;
        setStageView('off');
        void exitPseudoFullscreen();
      } else {
        localVideo.srcObject = null;
        refreshStageLayout();
      }
      await restoreMicAudioSender();
    } catch (err) {
      console.warn('[call] stop share:', err.message);
    }

    broadcastCallState();
  }

  async function toggleScreenShare() {
    if (shareBtn.classList.contains('hidden') || !pc) return;
    if (sharingScreen) {
      await stopScreenShare();
      return;
    }

    try {
      const pick = await openScreenPickerDialog();
      if (!pick?.sourceId) return;

      const stream = await captureDisplayStream(pick.sourceId, config, { withAudio: !!pick.withAudio });
      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) throw new Error('No screen track');

      await applyScreenTrackConstraints(screenTrack, config);

      screenStream = stream;
      sharingScreen = true;
      setShareButton(true);

      videoWrap.classList.remove('hidden');
      voiceWrap.classList.add('hidden');
      localVideo.srcObject = stream;

      const sender = getVideoSender();
      if (sender?.track?.kind === 'video' && !savedCameraTrack) {
        savedCameraTrack = sender.track;
      }

      if (!withVideo) {
        videoWrap.classList.remove('hidden');
        voiceWrap.classList.add('hidden');
      }

      await applyOutgoingVideoTrack(screenTrack, { screenShare: true });
      if (pick.withAudio && stream.getAudioTracks()[0]) {
        await applyScreenShareAudioMix();
      }
      refreshStageLayout();
      void ensureRemoteAudioPlaying();

      screenTrack.onended = () => {
        void stopScreenShare();
      };
      screenTrack.onresize = () => refreshStageLayout();

      broadcastCallState();
    } catch (err) {
      if (err?.name !== 'NotAllowedError') {
        console.error('[call] screen share:', err);
      }
      sharingScreen = false;
      setShareButton(false);
      if (window.__blipShowToast) {
        const toast = formatBlipErrorToast(err, { titleKey: 'call.share_failed' });
        window.__blipShowToast({
          title: `${toast.title} (${toast.code})`,
          body: toast.hint,
          variant: 'danger',
          durationMs: 5000,
        });
      }
    }
  }

  function isForCurrentPeer(data) {
    if (!peerId || !data?.from) return true;
    return Number(data.from) === Number(peerId);
  }

  async function resolveAudioDeviceId(kind) {
    const key = kind === 'output' ? 'audioOutputDeviceId' : 'audioInputDeviceId';
    try {
      const fresh = await api.getConfig?.();
      if (fresh?.[key]) return fresh[key];
    } catch {

    }
    return config?.[key] || '';
  }

  async function applyRemoteAudioSink() {
    const deviceId = await resolveAudioDeviceId('output');
    if (remoteOutCtx?.setSinkId && deviceId) {
      try {
        await remoteOutCtx.setSinkId(deviceId);
        return;
      } catch (err) {
        console.warn('[call] AudioContext setSinkId:', err.message);
      }
    }
    if (!deviceId || !remoteAudio.setSinkId) return;
    try {
      await remoteAudio.setSinkId(deviceId);
    } catch (err) {
      console.warn('[call] setSinkId:', err.message);
    }
  }

  function teardownRemoteGain() {
    try {
      remoteMediaSource?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      remoteGainNode?.disconnect();
    } catch {
      /* ignore */
    }
    remoteMediaSource = null;
    remoteGainNode = null;
  }

  function applyPeerOutputGain() {
    const linear = deafened ? 0 : peerOutputVolumePct / 100;
    if (remoteGainNode) {
      remoteGainNode.gain.value = linear;
      remoteAudio.muted = true;
    } else {
      remoteAudio.volume = Math.min(1, Math.max(0, linear));
      remoteAudio.muted = deafened;
    }
    volValue.textContent = t('call.volume_pct').replace('{pct}', String(peerOutputVolumePct));
    volRange.value = String(peerOutputVolumePct);
  }

  function wireRemoteGain(stream) {
    teardownRemoteGain();
    if (!stream?.getAudioTracks?.()?.length) {
      applyPeerOutputGain();
      return;
    }
    try {
      remoteOutCtx = remoteOutCtx || new AudioContext();
      if (remoteOutCtx.state === 'suspended') void remoteOutCtx.resume();
      remoteMediaSource = remoteOutCtx.createMediaStreamSource(stream);
      remoteGainNode = remoteOutCtx.createGain();
      remoteMediaSource.connect(remoteGainNode);
      remoteGainNode.connect(remoteOutCtx.destination);
      applyPeerOutputGain();
    } catch (err) {
      console.warn('[call] remote gain:', err.message);
      teardownRemoteGain();
      applyPeerOutputGain();
    }
  }

  async function ensureRemoteAudioPlaying() {
    if (deafened) return;
    if (remoteGainNode) {
      if (remoteOutCtx?.state === 'suspended') {
        try {
          await remoteOutCtx.resume();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (!remoteAudio.srcObject) return;
    try {
      await remoteAudio.play();
    } catch (err) {
      console.warn('[call] remote audio play:', err.message);
    }
  }

  function syncRemotePlayback(stream) {
    if (!stream) {
      remoteVideo.srcObject = null;
      remoteAudio.srcObject = null;
      teardownRemoteGain();
      remoteMicMeter.stop();
      return;
    }
    const videoTracks = stream.getVideoTracks().filter((t) => t.readyState !== 'ended');
    const audioTracks = stream.getAudioTracks().filter((t) => t.readyState !== 'ended');
    remoteVideo.srcObject = videoTracks.length ? new MediaStream(videoTracks) : null;
    const audioStream = audioTracks.length ? new MediaStream(audioTracks) : null;
    remoteAudio.srcObject = audioStream;
    if (audioStream) {
      void remoteMicMeter.attach(audioStream);
      wireRemoteGain(audioStream);
    } else {
      remoteMicMeter.stop();
      teardownRemoteGain();
      applyPeerOutputGain();
    }
    void applyRemoteAudioSink();
    void ensureRemoteAudioPlaying();
  }

  function attachRemoteStream(stream) {
    syncRemotePlayback(mergeRemotePlayback(stream));
    setConnectedStatus();
    startTimer();
    showInCallControls();
    const vTrack = stream.getVideoTracks()[0];
    if (vTrack && vTrack.readyState !== 'ended') {
      videoWrap.classList.remove('hidden');
      voiceWrap.classList.add('hidden');
      if (!trackLooksLikeScreen(vTrack)) {
        remotePeerScreenSharing = false;
      }
      refreshStageLayout();
      if (stageMode === 'off') {
        remoteVideo.classList.add('call-video--camera');
        localVideo.classList.add('call-video--camera');
      }
      vTrack.onended = () => {
        if (trackLooksLikeScreen(vTrack)) exitRemoteStreamView();
        else reconcileRemoteVideo();
      };
    }
  }

  async function getMedia(video) {
    if (!video) {
      return getVoiceMediaStream(config);
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: getVoiceAudioConstraints(config),
        video: getCameraVideoConstraints(config),
      });
    } catch (err) {
      console.warn('[call] getUserMedia:', err.message);
      throw err;
    }
  }

  function startTimer() {
    if (timerInterval) return;
    callStart = Date.now();
    timerInterval = setInterval(() => {
      timerEl.textContent = formatDuration(Date.now() - callStart);
    }, 1000);
  }

  function startIncomingPulse() {
    clearInterval(pulseTimer);
    pulseTimer = setInterval(() => {
      inner.style.borderColor = inner.style.borderColor === '#00ffc8' ? '#ff3366' : '#00ffc8';
    }, 200);
  }

  async function flushPendingCandidates() {
    if (!pc?.remoteDescription) return;
    for (const c of pendingCandidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (err) {
        console.warn('[call] ICE candidate:', err.message);
      }
    }
    pendingCandidates = [];
  }

  async function setRemoteDescription(sdp) {
    const desc = normalizeSdp(sdp);
    if (!desc?.type || !desc?.sdp) throw new Error('Invalid SDP');
    await pc.setRemoteDescription(desc);
    await flushPendingCandidates();
  }

  async function addIceCandidate(candidate) {
    const init = normalizeCandidate(candidate);
    if (!init?.candidate) return;
    if (!pc) {
      pendingCandidates.push(init);
      return;
    }
    if (!pc.remoteDescription) {
      pendingCandidates.push(init);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(init));
    } catch (err) {
      console.warn('[call] addIceCandidate:', err.message);
    }
  }

  function bindActiveCall(id) {
    activeCall = {
      peerId: id,
      pc,
      onCandidate: (candidate) => {
        api.callCandidate({ to: id, candidate });
      },
    };
  }

  async function startOutgoing(targetId, video) {
    peerId = targetId;
    withVideo = video;
    show();
    statusEl.dataset.i18n = 'call.outgoing';
    statusEl.textContent = t('call.outgoing');
    videoWrap.classList.toggle('hidden', !video);
    voiceWrap.classList.toggle('hidden', !video);
    mountCallAvatar(targetId);
    sounds.outgoingCall();

    try {
      localStream = await getMedia(video);
      if (video) {
        localVideo.srcObject = localStream;
        videoWrap.classList.add('call-video-wrap--camera');
        remoteVideo.classList.add('call-video--camera');
        localVideo.classList.add('call-video--camera');
      }

      const iceCfg = (await api.getConfig?.()) || config;
      pc = createPeerConnection((stream) => {
        attachRemoteStream(stream);
      }, iceCfg);

      localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
      const camSender = getVideoSender();
      if (camSender) void tuneVideoSender(camSender, { screenShare: false, config: iceCfg });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      bindActiveCall(targetId);

      const offerWire = toSdpWire(pc.localDescription);
      if (!offerWire) throw new Error('Invalid local SDP');

      let result = await api.initiateCall({
        to: targetId,
        sdp: offerWire,
        video,
      });
      if (!result?.ok) {
        const errMsg = result?.error || '';
        if (/peer not found/i.test(errMsg)) {
          await new Promise((r) => setTimeout(r, 400));
          result = await api.initiateCall({
            to: targetId,
            sdp: offerWire,
            video,
          });
        }
      }
      if (!result?.ok) throw new Error(result?.error || 'Call failed');
      refreshPushToTalkMode(iceCfg);
      void localMicMeter.attach(localStream);
      applyMicTransmission();
      dispatchReactiveAudio({ active: true, stream: localStream });
      void micWaveform.start(localStream);
    } catch (err) {
      console.error('[call] outgoing:', err);
      hide();
    }

    incomingOffer = null;
  }

  function rollbackAcceptAttempt() {
    if (localStream) {
      localStream.getTracks().forEach((tr) => tr.stop());
      localStream = null;
    }
    micWaveform.stop();
    if (pc) {
      pc.close();
      pc = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    remoteAudio.srcObject = null;
    activeCall = null;
  }

  async function acceptIncoming() {
    clearInterval(pulseTimer);
    inner.style.borderColor = '';

    const offer = normalizeSdp(incomingOffer);
    if (!offer) {
      console.error('[BLIP call] accept: missing or invalid offer SDP', incomingOffer);
      statusEl.textContent = t('call.signal_lost');
      statusEl.dataset.i18n = 'call.signal_lost';
      return;
    }

    acceptBtn.classList.add('hidden');
    rejectBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');

    try {
      localStream = await getMedia(withVideo);
      if (withVideo) {
        localVideo.srcObject = localStream;
        videoWrap.classList.add('call-video-wrap--camera');
        remoteVideo.classList.add('call-video--camera');
        localVideo.classList.add('call-video--camera');
      }

      const iceCfg = (await api.getConfig?.()) || config;
      pc = createPeerConnection((stream) => {
        attachRemoteStream(stream);
      }, iceCfg);

      localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
      const camSender = getVideoSender();
      if (camSender) void tuneVideoSender(camSender, { screenShare: false, config: iceCfg });

      await setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const answerWire = toSdpWire(pc.localDescription);
      if (!answerWire) throw new Error('Invalid local SDP');

      bindActiveCall(peerId);

      const result = await api.callAccept({ to: peerId, sdp: answerWire });
      if (!result?.ok) throw new Error(result?.error || 'Accept failed');

      incomingOffer = null;
      sounds.callConnected();
      statusEl.dataset.i18n = 'call.connected';
      showInCallControls();
      refreshPushToTalkMode(iceCfg);
      void localMicMeter.attach(localStream);
      applyMicTransmission();
      dispatchReactiveAudio({ active: true, stream: localStream });
      void micWaveform.start(localStream);
    } catch (err) {
      console.error('[BLIP call] accept:', err);
      rollbackAcceptAttempt();
      incomingOffer = offer;
      statusEl.textContent = err?.message || t('call.signal_lost');
      statusEl.dataset.i18n = '';
      acceptBtn.classList.remove('hidden');
      rejectBtn.classList.remove('hidden');
      endBtn.classList.add('hidden');
      muteBtn.classList.add('hidden');
      deafenBtn.classList.add('hidden');
      volWrap.classList.add('hidden');
    }
  }

  async function handleIncoming(data) {
    const from = Number(data.from);
    if (!from) return;

    if (pc || (incomingOffer && activeCall?.pending)) {
      try {
        await api.callReject?.({ to: from });
      } catch {
        /* ignore */
      }
      options.onMissedCall?.(from, { reason: 'busy', video: !!data.video });
      return;
    }

    peerId = from;
    withVideo = data.video ?? false;
    const offer = normalizeSdp(data.sdp);
    if (!offer) {
      console.error('[BLIP call] incoming: invalid offer SDP', data.sdp);
      return;
    }
    incomingOffer = offer;
    pendingCandidates = [];

    show();
    sounds.incomingCall();
    statusEl.dataset.i18n = 'call.incoming';
    statusEl.textContent = t('call.incoming');
    startIncomingPulse();
    acceptBtn.classList.remove('hidden');
    rejectBtn.classList.remove('hidden');
    endBtn.classList.add('hidden');
    muteBtn.classList.add('hidden');
    deafenBtn.classList.add('hidden');
    volWrap.classList.add('hidden');
    shareBtn.classList.add('hidden');
    videoWrap.classList.toggle('hidden', !withVideo);
    voiceWrap.classList.toggle('hidden', withVideo);
    mountCallAvatar(peerId);

    activeCall = { peerId, pending: true };
  }

  acceptBtn.addEventListener('click', () => acceptIncoming());

  rejectBtn.addEventListener('click', async () => {
    if (peerId) await api.callReject({ to: peerId });
    sounds.callEnd();
    hide();
  });

  async function handleAnswer(data) {
    if (!pc) {
      console.warn('[BLIP call] handleAnswer: no peer connection', data);
      return;
    }
    const aid = Number(data?.from);
    if (aid && peerId && aid !== Number(peerId)) {
      console.warn('[BLIP call] answer ignored (wrong peer)', { aid, peerId, data });
      return;
    }
    const answer = normalizeSdp(data.sdp);
    if (!answer) {
      console.error('[BLIP call] answer: invalid SDP', data.sdp);
      return;
    }
    try {
      await setRemoteDescription(answer);
      sounds.callConnected();
      setConnectedStatus();
      startTimer();
      showInCallControls();
    } catch (err) {
      console.error('[BLIP call] answer', err);
    }
  }

  async function handleCallState(data) {
    if (!isForCurrentPeer(data)) return;
    applyRemoteState(data);
  }

  async function handleRenegotiateOffer(data) {
    if (!pc || !isForCurrentPeer(data)) return;
    const offer = normalizeSdp(data.sdp);
    if (!offer) return;
    try {
      await setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const answerWire = toSdpWire(pc.localDescription);
      if (!answerWire) throw new Error('Invalid local SDP');
      await api.callRenegotiateAnswer({ to: peerId, sdp: answerWire });
      reconcileRemoteVideo();
      refreshStageLayout();
      showInCallControls();
    } catch (err) {
      console.error('[BLIP call] renegotiate offer:', err);
    }
  }

  async function handleRenegotiateAnswer(data) {
    if (!pc || !isForCurrentPeer(data)) return;
    const answer = normalizeSdp(data.sdp);
    if (!answer) return;
    try {
      await setRemoteDescription(answer);
      renegotiateAnswerResolve?.();
    } catch (err) {
      console.error('[BLIP call] renegotiate answer:', err);
      renegotiateAnswerResolve = null;
    }
  }

  async function handleCandidate(data) {
    if (!isForCurrentPeer(data)) return;
    await addIceCandidate(data.candidate);
  }

  function handleRejected(data) {
    if (!isForCurrentPeer(data)) return;
    sounds.callEnd();
    hide();
  }

  function handleEnded(data) {
    if (!isForCurrentPeer(data)) return;
    if (incomingOffer && !pc && peerId) {
      options.onMissedCall?.(peerId, { reason: 'missed', video: withVideo });
    }
    sounds.callEnd();
    hide();
  }

  function toggleMute() {
    if (muteBtn.classList.contains('hidden')) return;
    muted = !muted;
    applyMicTransmission();
    broadcastCallState();
  }

  function toggleDeafen() {
    if (deafenBtn.classList.contains('hidden')) return;
    deafened = !deafened;
    applyPeerOutputGain();
    deafenBtn.classList.toggle('active', deafened);
    if (!deafened) void ensureRemoteAudioPlaying();
    broadcastCallState();
  }

  function isIncomingRinging() {
    return !!incomingOffer && !pc;
  }

  muteBtn.addEventListener('click', () => toggleMute());
  deafenBtn.addEventListener('click', () => toggleDeafen());
  volRange.addEventListener('input', () => {
    peerOutputVolumePct = setPeerCallVolumePct(peerId, volRange.value);
    applyPeerOutputGain();
  });
  shareBtn.addEventListener('click', () => {
    void toggleScreenShare();
  });
  fsBtn.addEventListener('click', () => {
    void toggleVideoFullscreen();
  });
  streamExitBtn.addEventListener('click', () => {
    exitRemoteStreamView();
  });
  streamPip.addEventListener('click', () => {
    enterRemoteStreamView();
  });

  async function hangupCall() {
    if (peerId) await api.callHangup({ to: peerId });
    sounds.callEnd();
    hide();
  }

  endBtn.addEventListener('click', () => hangupCall());

  return {
    el: overlay,
    startOutgoing,
    handleIncoming,
    handleAnswer,
    handleCandidate,
    handleRejected,
    handleEnded,
    handleCallState,
    handleRenegotiateOffer,
    handleRenegotiateAnswer,
    hangupCall,
    acceptIncoming,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    toggleVideoFullscreen,
    setPttHeld,
    isVideoFullscreen: () => !!document.fullscreenElement || pseudoFullscreen,
    isIncomingRinging,
    hide,
    end: hide,
    refreshCallAvatar() {
      if (peerId != null) mountCallAvatar(peerId);
    },
    refreshI18n() {
      applyI18n(overlay);
      updateRemoteBadges();
    },
    isActive: () => !!pc || !!(incomingOffer && activeCall?.pending),
    getPeerId: () => peerId,
  };
}

export function showSignalLost(container) {
  const el = document.createElement('div');
  el.className = 'signal-lost glass';
  el.innerHTML = `
    <div class="skull-icon" aria-hidden="true"></div>
    <h2 data-i18n="call.signal_lost">${t('call.signal_lost')}</h2>
    <p data-i18n="call.signal_lost_hint">${t('call.signal_lost_hint')}</p>
  `;
  container.innerHTML = '';
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
