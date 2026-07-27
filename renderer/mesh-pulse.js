const MESH_PULSE_ACTIVE_INTERVAL_MS = 8_000;
const MESH_PULSE_IDLE_INTERVAL_MS = 60_000;
const MESH_PULSE_BATCH_SIZE = 4;

export function createMeshPulse({
  getState,
  getMainContent,
  t,
  isBlocked,
  showAppToast,
  sounds,
}) {
  const peerLatencyMs = new Map();
  const peerLatencyFails = new Map();
  let meshPulseTimer = null;
  let meshPulseLastAt = 0;

  function formatPeerPulseLine(peer) {
    const lat = peerLatencyMs.get(peer.blipId);
    if (lat != null) return t('peers.pulse_ms').replace('{ms}', String(lat));
    if (peer.online) return t('peers.pulse_pending');
    return t('peers.pulse_offline');
  }

  function formatPeerSubline(peer) {
    const custom = (peer?.presenceText || '').trim();
    if (peer?.online && custom) return custom;
    return formatPeerPulseLine(peer);
  }

  function refreshPeerPulseDom() {
    const state = getState();
    const mainContent = getMainContent();
    if (state.view !== 'peers' || !mainContent?.isConnected) return;
    mainContent.querySelectorAll('[data-peer-pulse]').forEach((el) => {
      const id = Number(el.dataset.peerPulse);
      const peer = state.peers.find((p) => p.blipId === id);
      if (!peer) return;
      const nextText = formatPeerSubline(peer);
      if (el.textContent !== nextText) el.textContent = nextText;
      const status = !!(peer.online && (peer.presenceText || '').trim());
      const live = peer.online && peerLatencyMs.has(id);
      const offline = !peer.online;
      el.classList.toggle('peer-pulse--status', status);
      el.classList.toggle('peer-pulse--live', live);
      el.classList.toggle('peer-pulse--offline', offline);
    });
  }

  async function pingPeerSilent(blipId) {
    if (!window.blip?.pingPeer) return;
    try {
      const result = await window.blip.pingPeer(blipId);
      if (result?.ok && result.ms != null) {
        peerLatencyFails.set(blipId, 0);
        const prev = peerLatencyMs.get(blipId);
        const next = prev == null ? result.ms : Math.round(prev * 0.65 + result.ms * 0.35);
        if (peerLatencyMs.get(blipId) !== next) peerLatencyMs.set(blipId, next);
      } else {
        const fails = (peerLatencyFails.get(blipId) || 0) + 1;
        peerLatencyFails.set(blipId, fails);
        if (fails >= 3) peerLatencyMs.delete(blipId);
      }
    } catch {
      const fails = (peerLatencyFails.get(blipId) || 0) + 1;
      peerLatencyFails.set(blipId, fails);
      if (fails >= 3) peerLatencyMs.delete(blipId);
    }
  }

  async function runMeshPulseRound() {
    const state = getState();
    if (!state.config?.blipId) return;
    const targets = state.peers.filter((p) => p.online && !isBlocked(p.blipId));
    for (let i = 0; i < targets.length; i += MESH_PULSE_BATCH_SIZE) {
      const slice = targets.slice(i, i + MESH_PULSE_BATCH_SIZE);
      await Promise.all(slice.map((p) => pingPeerSilent(p.blipId)));
    }
    meshPulseLastAt = Date.now();
    refreshPeerPulseDom();
  }

  function isPulsePriorityView(view) {
    return view === 'peers' || view === 'profile' || (view === 'chat' && !getState().activePeer);
  }

  function getMeshPulseIntervalMs() {
    const state = getState();
    return isPulsePriorityView(state.view)
      ? MESH_PULSE_ACTIVE_INTERVAL_MS
      : MESH_PULSE_IDLE_INTERVAL_MS;
  }

  async function maybeRunMeshPulseRound() {
    const intervalMs = getMeshPulseIntervalMs();
    if (Date.now() - meshPulseLastAt < intervalMs) return;
    await runMeshPulseRound();
  }

  function startMeshPulse() {
    if (!getState().config?.blipId || meshPulseTimer) return;
    meshPulseLastAt = 0;
    void runMeshPulseRound();
    meshPulseTimer = setInterval(() => void maybeRunMeshPulseRound(), 2_000);
  }

  function stopMeshPulse() {
    if (!meshPulseTimer) return;
    clearInterval(meshPulseTimer);
    meshPulseTimer = null;
    meshPulseLastAt = 0;
  }

  async function runPeerPing(peer) {
    const state = getState();
    if (!peer?.online || !window.blip?.pingPeer) {
      showAppToast({ title: t('peers.ping_fail'), variant: 'danger', durationMs: 4000 });
      return;
    }
    const result = await window.blip.pingPeer(peer.blipId);
    if (result?.ok && result.ms != null) {
      peerLatencyFails.set(peer.blipId, 0);
      peerLatencyMs.set(peer.blipId, result.ms);
      if (!state.config?.doNotDisturb) sounds.meshPing();
      showAppToast({
        title: t('peers.ping_ok'),
        body: t('peers.ping_ok_body').replace('{ms}', String(result.ms)),
        durationMs: 4000,
      });
    } else {
      peerLatencyFails.set(peer.blipId, (peerLatencyFails.get(peer.blipId) || 0) + 1);
      showAppToast({ title: t('peers.ping_fail'), variant: 'danger', durationMs: 4000 });
    }
    refreshPeerPulseDom();
  }

  return {
    peerLatencyMs,
    formatPeerSubline,
    refreshPeerPulseDom,
    runMeshPulseRound,
    startMeshPulse,
    stopMeshPulse,
    runPeerPing,
  };
}
