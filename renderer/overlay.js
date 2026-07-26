import { createAvatarElement } from './avatar.js';

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
const activityBlock = document.getElementById('activityBlock');
const activityChips = document.getElementById('activityChips');
const transferBox = document.getElementById('transferBox');
const transferLabel = document.getElementById('transferLabel');
const transferPct = document.getElementById('transferPct');

let lastCallPeerId = null;
let mutedOptimistic = false;

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
  if (data?.accentHex) {
    html.style.setProperty('--accent', data.accentHex);
  } else {
    html.style.removeProperty('--accent');
  }
}

function tickClock(now = Date.now()) {
  const d = new Date(now);
  clockTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  clockDate.textContent = d.toLocaleDateString(undefined, {
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
  muteBtn.textContent = mutedOptimistic ? 'unmute' : 'mute';
  micMeter.classList.toggle('is-muted', mutedOptimistic);
}

function applyPayload(data) {
  applySkin(data);

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

  if (selfName || Number.isFinite(selfId)) {
    const idBit = Number.isFinite(selfId) ? ` · #${selfId}` : '';
    selfLine.innerHTML = `${selfName || 'BLIP'}<span class="self-id">${idBit}</span>`;
  } else {
    selfLine.textContent = 'BLIP';
  }

  const presenceLabel = dnd
    ? 'DND'
    : presence === 'away'
      ? 'Away'
      : presence === 'busy'
        ? 'Busy'
        : 'Online';
  statPresence.textContent = presenceLabel;
  statPeers.textContent = peers > 0 ? `${peers} online` : 'Solo';

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
      kind === 'game' ? 'Playing' : kind === 'app' ? 'In app' : 'Activity';
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
    if (kind === 'game') activityChips.appendChild(chip('Game', 'ok'));
    else if (kind === 'app') activityChips.appendChild(chip('App'));
  } else if (!data?.callActive) {
    panel.classList.add('idle');
    activityBlock.classList.remove('hidden');
    kindEl.textContent = '';
    kindEl.className = 'kind';
    titleEl.textContent = 'Listening…';
    subEl.textContent = 'No foreground game or app pinned';
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
    const mode = data.callVideo ? 'Video' : 'Voice';
    callElapsed.textContent = data.callElapsed ? `${mode} · ${data.callElapsed}` : mode;

    if (peerId !== lastCallPeerId) {
      lastCallPeerId = peerId;
      renderCallAvatar(peerId, peerName, nest);
    }

    callMesh.textContent = peers === 1 ? '1 peer' : `${peers} peers`;
    const pingMs = data.callPingMs;
    if (pingMs != null && Number.isFinite(Number(pingMs))) {
      const ms = Math.round(Number(pingMs));
      callPing.textContent = `${ms}ms`;
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
    setMuteUi(false);
  }

  const xferPct = Math.round(Number(data?.transferPercent) || 0);
  const xferLabel = String(data?.transferLabel || '').trim();
  if (xferLabel && xferPct > 0 && xferPct < 100) {
    transferBox.classList.remove('hidden');
    transferLabel.textContent = xferLabel;
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
    footerApp.textContent = 'Do not disturb';
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

window.blipOverlay?.onUpdate?.((data) => applyPayload(data || {}));
window.blipOverlay?.ready?.();
