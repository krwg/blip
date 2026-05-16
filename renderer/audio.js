let audioCtx = null;
let soundsEnabled = true;
let soundsVolume = 1;

export function setSoundPrefs({ enabled, volume } = {}) {
  if (typeof enabled === 'boolean') soundsEnabled = enabled;
  if (typeof volume === 'number' && Number.isFinite(volume)) {
    soundsVolume = Math.max(0, Math.min(1, volume));
  }
}

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', gain = 0.15) {
  if (!soundsEnabled || soundsVolume <= 0) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain * soundsVolume;
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration / 1000);
}

function playSweep(startFreq, endFreq, duration, gain = 0.12) {
  if (!soundsEnabled || soundsVolume <= 0) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + duration / 1000);
  g.gain.value = gain * soundsVolume;
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration / 1000);
}

export const sounds = {
  incomingCall() {
    playTone(800, 100);
    setTimeout(() => playTone(1200, 100), 110);
  },
  messageSent() {
    playTone(600, 50);
  },
  messageReceived() {
    playTone(800, 50);
  },
  peerOnline() {
    playSweep(300, 900, 200);
  },
  callEnd() {
    playSweep(1200, 400, 150);
  },
};
