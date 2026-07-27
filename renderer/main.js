import { setLang, t } from './i18n.js';
import { BlipErrorCode, formatBlipErrorCode } from '../shared/blip-errors.js';
import {
  initUI,
  updatePeers,
  handleTcpMessage,
  handleMissedCall,
  navigateToView,
  toggleDoNotDisturb,
} from './ui.js';
import { initMediaViewer } from './media-viewer.js';
import { syncPremiumTierWithHost } from './mesh-plus-verify.js';
import { setLocalTrustState } from './trust-ui.js';
import { syncAchievements } from './achievements-tracker.js';

const api = {
  saveConfig: (data) => window.blip.saveConfig(data),
  sendTcpMessage: (payload) => window.blip.sendTcpMessage(payload),
  initiateCall: (payload) =>
    window.blip.initiateCall({
      to: payload.to,
      sdp: payload.sdp,
      video: payload.video,
    }),
  callAccept: (payload) =>
    window.blip.callAccept({
      to: payload.to,
      sdp: payload.sdp,
    }),
  callReject: (payload) => window.blip.callReject(payload),
  callCandidate: (payload) =>
    window.blip.callCandidate({
      to: payload.to,
      candidate: payload.candidate?.toJSON?.() ?? payload.candidate,
    }),
  callHangup: (payload) => window.blip.callHangup(payload),
};

function showBootError(message, { title, hint } = {}) {
  const root = document.getElementById('app');
  if (!root) return;
  const box = document.createElement('div');
  box.style.cssText =
    'padding:24px;font-family:monospace;color:#ff3366;border:2px solid #ff3366;margin:48px;';
  const titleEl = document.createElement('strong');
  titleEl.textContent = title || t('boot.error_title');
  const p = document.createElement('p');
  p.style.cssText = 'color:#e0e0e0;margin-top:12px;';
  p.textContent = message;
  const hintEl = document.createElement('p');
  hintEl.style.cssText = 'color:#333;margin-top:8px;font-size:12px;';
  hintEl.textContent = hint || t('boot.error_hint');
  box.append(titleEl, p, hintEl);
  root.replaceChildren(box);
}

async function boot() {
  if (!window.blip) {
    const lang = localStorage.getItem('blip_lang') || 'en';
    setLang(lang);
    showBootError(`${t('boot.preload_missing')} (${formatBlipErrorCode(BlipErrorCode.BOOT_PRELOAD_MISSING)})`);
    return;
  }
  const config = await window.blip.getConfig();
  const lang = config.language || localStorage.getItem('blip_lang') || 'en';
  setLang(lang);

  const bootState = { config };
  await syncPremiumTierWithHost(bootState);
  if (window.blip?.getTrustState) {
    setLocalTrustState(await window.blip.getTrustState());
    if (bootState.config?.achievementsEnabled) syncAchievements(bootState.config);
  }
  window.blip?.onTrustState?.((trust) => {
    setLocalTrustState(trust);
    if (bootState.config?.achievementsEnabled) syncAchievements(bootState.config);
  });
  initUI(bootState.config, api);
  initMediaViewer();

  // Prevent Chromium from navigating away when files are dropped on the window.
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
  });

  const { peers, occupiedIds } = await window.blip.getPeers();
  updatePeers({ peers, occupiedIds });

  window.blip.onPeersUpdated((data) => updatePeers(data));
  window.blip.onTcpMessage((msg) => handleTcpMessage(msg));
  window.blip.onMissedCall?.((payload) => handleMissedCall(payload));

  window.blip.onGlobalNavigate?.((payload) => {
    if (payload?.view) navigateToView(payload.view);
  });
  window.blip.onGlobalToggleDnd?.(() => {
    void toggleDoNotDisturb();
  });
}

boot().catch((err) => {
  console.error(err);
  try {
    const lang = localStorage.getItem('blip_lang') || 'en';
    setLang(lang);
  } catch {
    /* ignore */
  }
  const code = formatBlipErrorCode(err?.blipCode != null ? err : BlipErrorCode.BOOT_INIT_FAILED);
  showBootError(`${err?.message || String(err)} (${code})`);
});
