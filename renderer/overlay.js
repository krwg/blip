import { createAvatarElement } from './avatar.js';
import { t, setLang, getLang } from './i18n.js';

function peersOnlineLabel(n) {
  return t('overlay.peers_online').replace('{n}', String(n));
}

function peersCountLabel(n) {
  return t('overlay.peers_count').replace('{n}', String(n));
}

const panel = document.getElementById('panel');
const kindEl = document.getElementById('kind');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const footerApp = document.getElementById('footerApp');
const unreadEl = document.getElementById('unread');
const callBox = document.getElementById('callBox');
const callPeer = document.getElementById('callPeer');
const callElapsed = document.getElementById('callElapsed');
const callAvatar = document.getElementById('callAvatar');
const callMesh = document.getElementById('callMesh');
const callPing = document.getElementById('callPing');
const legacyPill = document.getElementById('legacyPill');
const callBadge = document.getElementById('callBadge');
const muteBtn = document.getElementById('muteBtn');
const endBtn = document.getElementById('endBtn');
const micMeter = document.getElementById('micMeter');
const clockTime = document.getElementById('clockTime');
const clockDate = document.getElementById('clockDate');
const selfLine = document.getElementById('selfLine');
const statsEl = document.getElementById('stats');
const statPresence = document.getElementById('statPresence');
const statPeers = document.getElementById('statPeers');
const statUnreadWrap = document.getElementById('statUnreadWrap');
const statUnread = document.getElementById('statUnread');
const labelStatus = document.getElementById('labelStatus');
const labelMesh = document.getElementById('labelMesh');
const labelUnread = document.getElementById('labelUnread');
const labelCallMesh = document.getElementById('labelCallMesh');
const labelCallPing = document.getElementById('labelCallPing');
const activityBlock = document.getElementById('activityBlock');
const activityChips = document.getElementById('activityChips');
const transferBox = document.getElementById('transferBox');
const transferLabel = document.getElementById('transferLabel');
const transferPct = document.getElementById('transferPct');
const pttPill = document.getElementById('pttPill');
const micBars = micMeter ? [...micMeter.querySelectorAll('span')] : [];

let lastCallPeerId = null;
let mutedOptimistic = false;
let lastClickThrough = true;
let overlayHitInteractive = false;

function setMicMeterLevel(level, muted) {
  if (!micMeter) return;
  const m = !!muted;
  micMeter.classList.toggle('is-muted', m);
  const live = !m && level > 0.05;
  micMeter.classList.toggle('is-live', live);
  if (!live && !m) return;
  micBars.forEach((bar, i) => {
    const scale = m ? 0.22 : 0.35 + Math.min(1, level * 1.35) * (0.55 + i * 0.08);
    bar.style.height = `${Math.round(scale * 100)}%`;
  });
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function chip(text, mod = '') {
  const el = document.createElement('span');
  el.className = `chip${mod ? ` chip--${mod}` : ''}`;
  el.textContent = text;
  return el;
}

function initialsFromName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '?';
  const parts = raw.split(/[\s._#-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase().slice(0, 2);
  }
  return raw.slice(0, 2).toUpperCase();
}

function applySkin(data) {
  const html = document.documentElement;
  const skin = data?.uiSkin === 'nest' ? 'nest' : 'pixel';
  const theme = data?.theme === 'light' ? 'light' : 'dark';
  const accent = String(data?.accentId || 'mint');
  html.dataset.uiSkin = skin;
  html.dataset.theme = theme;
  html.dataset.accent = accent;
  html.lang = getLang() === 'ru' ? 'ru' : 'en';
  if (data?.accentHex) {
    html.style.setProperty('--accent', data.accentHex);
  } else {
    html.style.removeProperty('--accent');
  }
}

function applyStaticLabels() {
  if (labelStatus) labelStatus.textContent = t('overlay.status');
  if (labelMesh) labelMesh.textContent = t('overlay.mesh');
  if (labelUnread) labelUnread.textContent = t('overlay.unread');
  if (labelCallMesh) labelCallMesh.textContent = t('overlay.mesh');
  if (labelCallPing) labelCallPing.textContent = t('overlay.ping');
  if (callBadge) callBadge.textContent = t('overlay.in_call');
  if (legacyPill) legacyPill.textContent = t('overlay.legacy');
  if (endBtn) endBtn.textContent = t('overlay.end');
  if (micMeter) micMeter.title = t('overlay.mute');
  setMuteUi(mutedOptimistic);
}

function tickClock(now = Date.now()) {
  const d = new Date(now);
  clockTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  clockDate.textContent = d.toLocaleDateString(getLang() === 'ru' ? 'ru-RU' : undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function renderCallAvatar(peerId, peerName, nest) {
  callAvatar.replaceChildren();
  if (nest) {
    const span = document.createElement('span');
    span.className = 'call-avatar-initials';
    span.textContent = initialsFromName(peerName);
    callAvatar.appendChild(span);
    return;
  }
  if (peerId != null && Number.isFinite(Number(peerId))) {
    const av = createAvatarElement(Number(peerId), 5);
    const node = av.querySelector('canvas, img') || av;
    callAvatar.appendChild(node);
  } else {
    const span = document.createElement('span');
    span.className = 'call-avatar-initials';
    span.textContent = initialsFromName(peerName);
    callAvatar.appendChild(span);
  }
}

function setMuteUi(muted) {
  mutedOptimistic = !!muted;
  muteBtn.classList.toggle('is-muted', mutedOptimistic);
  muteBtn.textContent = mutedOptimistic ? t('overlay.unmute') : t('overlay.mute');
  micMeter.classList.toggle('is-muted', mutedOptimistic);
}

function resolveCallQualityLabel(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  if (n < 80) return t('overlay.quality_good');
  if (n < 170) return t('overlay.quality_unstable');
  return t('overlay.quality_poor');
}

function applyPayload(data) {
  setLang(data?.language === 'ru' ? 'ru' : 'en');
  applySkin(data);
  applyStaticLabels();

  const kind = String(data?.activityKind || '');
  const label = String(data?.activityLabel || '').trim();
  const status = String(data?.statusLine || '').trim();
  const elapsed = String(data?.activityElapsed || '').trim();
  const app = String(data?.activityApp || '').trim();
  const winTitle = String(data?.activityTitle || '').trim();
  const unread = Number(data?.unread) || 0;
  const peers = Number(data?.peersOnline) || 0;
  const selfName = String(data?.selfName || '').trim();
  const selfId = data?.selfBlipId != null ? Number(data.selfBlipId) : null;
  const presence = String(data?.presence || 'online');
  const dnd = !!data?.doNotDisturb;
  const nest = data?.uiSkin === 'nest';

  lastClickThrough = data?.overlayClickThrough !== false;
  if (!lastClickThrough) {
    window.blipOverlay?.setInteractive?.(true);
  } else if (!overlayHitInteractive) {
    window.blipOverlay?.setInteractive?.(false);
  }

  if (selfName || Number.isFinite(selfId)) {
    const idBit = Number.isFinite(selfId) ? ` · #${selfId}` : '';
    selfLine.innerHTML = `${selfName || 'BLIP'}<span class="self-id">${idBit}</span>`;
  } else {
    selfLine.textContent = 'BLIP';
  }

  const presenceLabel = dnd
    ? t('overlay.dnd')
    : presence === 'away'
      ? t('overlay.away')
      : presence === 'busy'
        ? t('overlay.busy')
        : t('overlay.online');
  statPresence.textContent = presenceLabel;
  statPeers.textContent = peers > 0 ? peersOnlineLabel(peers) : t('overlay.solo');

  if (unread > 0) {
    statsEl.classList.add('has-unread');
    statUnreadWrap.classList.remove('hidden');
    const unreadText = unread > 99 ? '99+' : String(unread);
    statUnread.textContent = unreadText;
    unreadEl.classList.remove('hidden');
    unreadEl.textContent = unreadText;
  } else {
    statsEl.classList.remove('has-unread');
    statUnreadWrap.classList.add('hidden');
    unreadEl.classList.add('hidden');
    unreadEl.textContent = '';
  }

  activityChips.replaceChildren();

  if (label || status) {
    panel.classList.remove('idle');
    activityBlock.classList.remove('hidden');
    kindEl.textContent =
      kind === 'game'
        ? t('overlay.playing')
        : kind === 'app'
          ? t('overlay.in_app')
          : t('overlay.activity');
    kindEl.className = `kind${kind === 'game' ? ' kind--game' : ''}`;
    titleEl.textContent = label || status || '—';
    const bits = [];
    if (app && label && !label.toLowerCase().includes(app.toLowerCase())) {
      bits.push(app);
    }
    if (winTitle && winTitle !== label && !label.includes(winTitle.slice(0, 24))) {
      bits.push(winTitle.length > 42 ? `${winTitle.slice(0, 40)}…` : winTitle);
    }
    subEl.textContent = bits.join(' · ');
    if (kind === 'game') activityChips.appendChild(chip(t('overlay.game'), 'ok'));
    else if (kind === 'app') activityChips.appendChild(chip(t('overlay.app')));
  } else if (!data?.callActive) {
    panel.classList.add('idle');
    activityBlock.classList.remove('hidden');
    kindEl.textContent = '';
    kindEl.className = 'kind';
    titleEl.textContent = t('overlay.listening');
    subEl.textContent = t('overlay.listening_sub');
  } else {
    panel.classList.remove('idle');
    activityBlock.classList.add('hidden');
  }

  if (data?.callActive) {
    callBox.classList.remove('hidden');
    const peerName = data.callPeerName || `BLIP-${data.callPeerId || '?'}`;
    const peerId = data.callPeerId != null ? Number(data.callPeerId) : null;
    const idBit = Number.isFinite(peerId) ? ` #${peerId}` : '';
    callPeer.textContent = `${peerName}${idBit}`;
    const mode = data.callVideo ? t('overlay.video') : t('overlay.voice');
    callElapsed.textContent = data.callElapsed ? `${mode} · ${data.callElapsed}` : mode;

    if (peerId !== lastCallPeerId) {
      lastCallPeerId = peerId;
      renderCallAvatar(peerId, peerName, nest);
    }

    callAvatar.classList.toggle('call-avatar--speaking', !!data.callPeerSpeaking);

    const pttOn = !!data.callPushToTalkActive;
    if (pttPill) {
      pttPill.classList.toggle('hidden', !pttOn);
      pttPill.textContent = data.callPttHeld ? t('overlay.ptt_hot') : t('overlay.ptt_idle');
      pttPill.classList.toggle('is-hot', !!data.callPttHeld);
    }

    setMicMeterLevel(Number(data.callLocalMicLevel) || 0, !!data.callMuted);

    callMesh.textContent = peersCountLabel(peers);
    const pingMs = data.callPingMs;
    if (pingMs != null && Number.isFinite(Number(pingMs))) {
      const ms = Math.round(Number(pingMs));
      const q = resolveCallQualityLabel(ms);
      callPing.textContent = q ? `${ms}ms · ${q}` : `${ms}ms`;
      callPing.classList.toggle('metric-value--ok', ms < 80);
      callPing.classList.toggle('metric-value--bad', ms >= 160);
    } else {
      callPing.textContent = '—';
      callPing.classList.remove('metric-value--bad');
      callPing.classList.add('metric-value--ok');
    }

    if (data.callLegacy) legacyPill.classList.remove('hidden');
    else legacyPill.classList.add('hidden');

    setMuteUi(!!data.callMuted);
  } else {
    callBox.classList.add('hidden');
    lastCallPeerId = null;
    callPeer.textContent = '';
    callElapsed.textContent = '';
    callAvatar.replaceChildren();
    callAvatar.classList.remove('call-avatar--speaking');
    setMuteUi(false);
    setMicMeterLevel(0, false);
    if (pttPill) pttPill.classList.add('hidden');
  }

  const xferPct = Math.round(Number(data?.transferPercent) || 0);
  const xferLabel = String(data?.transferLabel || '').trim();
  if (xferLabel && xferPct > 0 && xferPct < 100) {
    transferBox.classList.remove('hidden');
    transferLabel.textContent = xferLabel || t('overlay.transfer');
    transferPct.textContent = ` · ${xferPct}%`;
  } else {
    transferBox.classList.add('hidden');
    transferLabel.textContent = '';
    transferPct.textContent = '';
  }

  if (app) {
    footerApp.classList.remove('hidden');
    const elapsedBit = elapsed ? ` · ${elapsed}` : '';
    footerApp.textContent = `${app}${elapsedBit}`;
  } else if (dnd) {
    footerApp.classList.remove('hidden');
    footerApp.textContent = t('overlay.dnd_footer');
  } else {
    footerApp.classList.add('hidden');
    footerApp.textContent = '';
  }

  if (data?.now) tickClock(data.now);
}

muteBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  setMuteUi(!mutedOptimistic);
  window.blipOverlay?.callMute?.();
});

endBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.blipOverlay?.callHangup?.();
});

tickClock();
setInterval(() => tickClock(), 1000);

function onOverlayPointerMove(e) {
  if (!lastClickThrough) return;
  const hit = e.target?.closest?.('[data-overlay-interactive]');
  const interactive = !!hit;
  if (interactive === overlayHitInteractive) return;
  overlayHitInteractive = interactive;
  window.blipOverlay?.setInteractive?.(interactive);
}

document.addEventListener('mousemove', onOverlayPointerMove);
document.addEventListener('mouseleave', () => {
  if (!lastClickThrough) return;
  overlayHitInteractive = false;
  window.blipOverlay?.setInteractive?.(false);
});

function bindPttPointer(el) {
  if (!el) return;
  const down = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.blipOverlay?.pttHeld?.(true);
  };
  const up = () => window.blipOverlay?.pttHeld?.(false);
  el.addEventListener('mousedown', down);
  el.addEventListener('mouseup', up);
  el.addEventListener('mouseleave', up);
  el.addEventListener('touchstart', down, { passive: false });
  el.addEventListener('touchend', up);
  el.addEventListener('touchcancel', up);
}
bindPttPointer(micMeter);

window.blipOverlay?.onUpdate?.((data) => applyPayload(data || {}));
window.blipOverlay?.ready?.();
