import { t } from './i18n.js';
import { sounds } from './audio.js';
import { createAvatarElement } from './avatar.js';

const ICE_SERVERS = [];

let activeCall = null;

function createPeerConnection(onRemoteStream) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.ontrack = (e) => {
    if (e.streams[0]) onRemoteStream(e.streams[0]);
  };

  pc.onicecandidate = (e) => {
    if (e.candidate && activeCall?.onCandidate) {
      activeCall.onCandidate(e.candidate);
    }
  };

  return pc;
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m % 60)}:${pad(s % 60)}`;
  return `${pad(m)}:${pad(s % 60)}`;
}

export function createCallUI(config, api) {
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
  const gridOverlay = document.createElement('div');
  gridOverlay.className = 'video-pixel-grid';
  videoWrap.appendChild(remoteVideo);
  videoWrap.appendChild(localVideo);
  videoWrap.appendChild(gridOverlay);

  const voiceWrap = document.createElement('div');
  voiceWrap.className = 'call-voice-wrap hidden';
  const avatarSlot = document.createElement('div');
  avatarSlot.className = 'call-avatar-slot';
  const waveform = document.createElement('div');
  waveform.className = 'call-waveform';
  for (let i = 0; i < 8; i++) {
    const bar = document.createElement('div');
    bar.className = 'wave-bar';
    waveform.appendChild(bar);
  }
  voiceWrap.appendChild(avatarSlot);
  voiceWrap.appendChild(waveform);

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
  controls.appendChild(acceptBtn);
  controls.appendChild(rejectBtn);
  controls.appendChild(endBtn);

  inner.appendChild(statusEl);
  inner.appendChild(videoWrap);
  inner.appendChild(voiceWrap);
  inner.appendChild(timerEl);
  inner.appendChild(controls);
  overlay.appendChild(inner);

  let localStream = null;
  let pc = null;
  let peerId = null;
  let muted = false;
  let deafened = false;
  let timerInterval = null;
  let callStart = null;
  let pulseFrame = 0;
  let pulseTimer = null;

  function show() {
    overlay.classList.remove('hidden');
  }

  function hide() {
    overlay.classList.add('hidden');
    cleanup();
  }

  function cleanup() {
    clearInterval(timerInterval);
    clearInterval(pulseTimer);
    pulseTimer = null;
    if (localStream) {
      localStream.getTracks().forEach((tr) => tr.stop());
      localStream = null;
    }
    if (pc) {
      pc.close();
      pc = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    activeCall = null;
    inner.classList.remove('pulse-incoming');
    acceptBtn.classList.add('hidden');
    rejectBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
    muteBtn.classList.remove('hidden');
    deafenBtn.classList.remove('hidden');
  }

  async function getMedia(video) {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { width: 320, height: 320 } : false,
    });
  }

  function startTimer() {
    callStart = Date.now();
    timerInterval = setInterval(() => {
      timerEl.textContent = formatDuration(Date.now() - callStart);
    }, 1000);
  }

  function startIncomingPulse() {
    pulseFrame = 0;
    pulseTimer = setInterval(() => {
      pulseFrame = (pulseFrame + 1) % 3;
      inner.style.borderColor = pulseFrame % 2 === 0 ? '#00ffc8' : '#ff3366';
    }, 200);
  }

  async function startOutgoing(targetId, withVideo) {
    peerId = targetId;
    show();
    statusEl.dataset.i18n = 'call.outgoing';
    statusEl.textContent = t('call.outgoing');
    videoWrap.classList.toggle('hidden', !withVideo);
    voiceWrap.classList.toggle('hidden', withVideo);
    avatarSlot.innerHTML = '';
    avatarSlot.appendChild(createAvatarElement(targetId, 6));

    try {
      localStream = await getMedia(withVideo);
      if (withVideo) localVideo.srcObject = localStream;

      pc = createPeerConnection((stream) => {
        remoteVideo.srcObject = stream;
        startTimer();
      });

      localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      activeCall = {
        peerId,
        pc,
        onCandidate: (candidate) => {
          api.callCandidate({ to: peerId, candidate });
        },
      };

      await api.initiateCall({
        to: peerId,
        sdp: pc.localDescription,
        video: withVideo,
      });
    } catch (err) {
      console.error(err);
      hide();
    }
  }

  async function handleIncoming(data) {
    peerId = data.from;
    const withVideo = data.video ?? false;
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
    videoWrap.classList.toggle('hidden', !withVideo);
    voiceWrap.classList.toggle('hidden', withVideo);
    avatarSlot.innerHTML = '';
    avatarSlot.appendChild(createAvatarElement(peerId, 6));

    activeCall = { peerId, pendingOffer: data.sdp };

    acceptBtn.onclick = async () => {
      clearInterval(pulseTimer);
      inner.style.borderColor = '';
      acceptBtn.classList.add('hidden');
      rejectBtn.classList.add('hidden');
      endBtn.classList.remove('hidden');
      muteBtn.classList.remove('hidden');
      deafenBtn.classList.remove('hidden');

      try {
        localStream = await getMedia(withVideo);
        if (withVideo) localVideo.srcObject = localStream;

        pc = createPeerConnection((stream) => {
          remoteVideo.srcObject = stream;
          startTimer();
        });

        localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));

        await pc.setRemoteDescription(data.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        activeCall = {
          peerId,
          pc,
          onCandidate: (candidate) => api.callCandidate({ to: peerId, candidate }),
        };

        await api.callAccept({ to: peerId, sdp: pc.localDescription });
      } catch (err) {
        console.error(err);
        hide();
      }
    };

    rejectBtn.onclick = async () => {
      await api.callReject({ to: peerId });
      sounds.callEnd();
      hide();
    };
  }

  async function handleAnswer(data) {
    if (!pc) return;
    await pc.setRemoteDescription(data.sdp);
    startTimer();
  }

  async function handleCandidate(data) {
    if (!pc || !data.candidate) return;
    try {
      await pc.addIceCandidate(data.candidate);
    } catch {
      /* may arrive before remote description */
    }
  }

  muteBtn.addEventListener('click', () => {
    muted = !muted;
    localStream?.getAudioTracks().forEach((tr) => {
      tr.enabled = !muted;
    });
    muteBtn.classList.toggle('active', muted);
  });

  deafenBtn.addEventListener('click', () => {
    deafened = !deafened;
    remoteVideo.muted = deafened;
    deafenBtn.classList.toggle('active', deafened);
  });

  endBtn.addEventListener('click', async () => {
    if (peerId) await api.callHangup({ to: peerId });
    sounds.callEnd();
    hide();
  });

  return {
    el: overlay,
    startOutgoing,
    handleIncoming,
    handleAnswer,
    handleCandidate,
    hide,
    end: hide,
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
