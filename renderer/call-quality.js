const MAX_SAMPLES = 8;

/**
 * Rolling RTT / loss quality estimator for overlay + call HUD.
 * Updates should be fed at ~1 Hz; UI maps to good / unstable / poor.
 */
export function createCallQualityTracker() {
  /** @type {number[]} */
  const rtts = [];
  let lastLoss = null;
  let lastTier = '';
  let lastEmitAt = 0;

  function noteSample({ rttMs = null, packetLoss = null } = {}) {
    if (rttMs != null && Number.isFinite(Number(rttMs))) {
      rtts.push(Number(rttMs));
      if (rtts.length > MAX_SAMPLES) rtts.shift();
    }
    if (packetLoss != null && Number.isFinite(Number(packetLoss))) {
      lastLoss = Math.max(0, Math.min(1, Number(packetLoss)));
    }
  }

  function reset() {
    rtts.length = 0;
    lastLoss = null;
    lastTier = '';
    lastEmitAt = 0;
  }

  function snapshot() {
    if (!rtts.length) {
      return { rttMs: null, jitterMs: null, packetLoss: lastLoss, tier: '' };
    }
    const avg = rtts.reduce((a, b) => a + b, 0) / rtts.length;
    let jitter = 0;
    for (let i = 1; i < rtts.length; i++) {
      jitter += Math.abs(rtts[i] - rtts[i - 1]);
    }
    jitter = rtts.length > 1 ? jitter / (rtts.length - 1) : 0;
    const loss = lastLoss ?? 0;
    let tier = 'good';
    if (avg >= 170 || jitter >= 60 || loss >= 0.05) tier = 'poor';
    else if (avg >= 80 || jitter >= 25 || loss >= 0.02) tier = 'unstable';
    return {
      rttMs: Math.round(avg),
      jitterMs: Math.round(jitter),
      packetLoss: lastLoss,
      tier,
    };
  }

  /** Throttle UI updates to ~1–2 Hz. */
  function snapshotThrottled(minIntervalMs = 750) {
    const now = Date.now();
    const snap = snapshot();
    if (snap.tier && snap.tier === lastTier && now - lastEmitAt < minIntervalMs) {
      return { ...snap, skipped: true };
    }
    if (snap.tier) {
      lastTier = snap.tier;
      lastEmitAt = now;
    }
    return { ...snap, skipped: false };
  }

  return { noteSample, reset, snapshot, snapshotThrottled };
}

/**
 * Read RTT (ms) and audio packet loss from an RTCPeerConnection.
 */
export async function readPeerConnectionQuality(pc) {
  if (!pc?.getStats) return { rttMs: null, packetLoss: null };
  try {
    const report = await pc.getStats();
    let rttMs = null;
    let packetLoss = null;
    report.forEach((r) => {
      if (
        r.type === 'candidate-pair' &&
        r.state === 'succeeded' &&
        typeof r.currentRoundTripTime === 'number'
      ) {
        const ms = r.currentRoundTripTime * 1000;
        if (rttMs == null || ms < rttMs) rttMs = ms;
      }
      if (
        r.type === 'inbound-rtp' &&
        (r.kind === 'audio' || r.mediaType === 'audio') &&
        typeof r.packetsLost === 'number' &&
        typeof r.packetsReceived === 'number'
      ) {
        const total = r.packetsLost + r.packetsReceived;
        if (total > 0) packetLoss = r.packetsLost / total;
      }
    });
    return { rttMs, packetLoss };
  } catch {
    return { rttMs: null, packetLoss: null };
  }
}
