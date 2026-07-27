/**
 * Lightweight RMS level meter for a MediaStream (mic or remote audio).
 */

export function createStreamLevelMeter() {
  let ctx = null;
  let analyser = null;
  let source = null;
  let raf = null;
  let level = 0;

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
    level = 0;
  }

  function tick() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length / 255;
    level = level * 0.55 + Math.min(1, avg * 1.8) * 0.45;
    raf = requestAnimationFrame(tick);
  }

  async function attach(stream) {
    stop();
    if (!stream?.getAudioTracks?.()?.length) return;
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
    analyser.smoothingTimeConstant = 0.65;
    source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    tick();
  }

  function getLevel() {
    return level;
  }

  function isSpeaking({ threshold = 0.08, muted = false } = {}) {
    if (muted) return false;
    return level >= threshold;
  }

  return { attach, stop, getLevel, isSpeaking };
}
