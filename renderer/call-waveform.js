/**
 * Drive call waveform bars from a MediaStream (mic), replacing CSS-only pulse.
 */

function sampleBarLevels(freqData, barCount) {
  const levels = new Array(barCount).fill(0);
  const n = freqData.length;
  if (!n || barCount < 1) return levels;
  const slice = Math.max(1, Math.floor(n / barCount));
  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    const start = i * slice;
    const end = Math.min(n, start + slice);
    for (let j = start; j < end; j++) sum += freqData[j];
    const avg = sum / (end - start) / 255;
    levels[i] = Math.min(1, avg * 1.55);
  }
  return levels;
}

/**
 * @param {HTMLElement} root `.call-waveform` with `.wave-bar` children
 * @returns {{ start: (stream: MediaStream|null) => Promise<void>, stop: () => void, setMuted: (muted: boolean) => void }}
 */
export function bindCallWaveform(root) {
  const bars = Array.from(root?.querySelectorAll?.('.wave-bar') || []);
  let ctx = null;
  let analyser = null;
  let source = null;
  let raf = null;
  let muted = false;

  function resetBarStyles() {
    for (const bar of bars) {
      bar.style.height = '';
    }
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    try {
      source?.disconnect();
    } catch {
      /* ignore */
    }
    source = null;
    analyser = null;
    if (ctx) {
      void ctx.close().catch(() => {});
      ctx = null;
    }
    root?.classList.remove('call-waveform--live');
    resetBarStyles();
  }

  function tick() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const levels = muted ? bars.map(() => 0) : sampleBarLevels(data, bars.length);
    for (let i = 0; i < bars.length; i++) {
      const h = 6 + (levels[i] || 0) * 22;
      bars[i].style.height = `${h.toFixed(1)}px`;
    }
    raf = requestAnimationFrame(tick);
  }

  async function start(stream) {
    stop();
    if (!root || !bars.length) return;
    if (!stream?.getAudioTracks?.()?.length) return;

    root.classList.add('call-waveform--live');
    ctx = new AudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.62;
    source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    tick();
  }

  function setMuted(next) {
    muted = !!next;
    if (muted) {
      for (const bar of bars) bar.style.height = '6px';
    }
  }

  return { start, stop, setMuted };
}
