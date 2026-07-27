import { createAvatarElement } from './avatar.js';

const STRINGS = {
  en: {
    status: 'Status',
    mesh: 'Mesh',
    unread: 'Unread',
    ping: 'Ping',
    online: 'Online',
    away: 'Away',
    busy: 'Busy',
    dnd: 'DND',
    solo: 'Solo',
    peersOnline: (n) => (n === 1 ? '1 online' : `${n} online`),
    peersCount: (n) => (n === 1 ? '1 peer' : `${n} peers`),
    playing: 'Playing',
    inApp: 'In app',
    activity: 'Activity',
    listening: 'Listening…',
    listeningSub: 'No foreground game or app pinned',
    game: 'Game',
    app: 'App',
    voice: 'Voice',
    video: 'Video',
    inCall: 'in call',
    mute: 'mute',
    unmute: 'unmute',
    end: 'end',
    legacy: 'Legacy',
    transfer: 'Transfer',
    dndFooter: 'Do not disturb',
    qualityGood: 'good',
    qualityUnstable: 'unstable',
    qualityPoor: 'poor',
  },
  ru: {
    status: 'Статус',
    mesh: 'Меш',
    unread: 'Непрочит.',
    ping: 'Пинг',
    online: 'В сети',
    away: 'Отошёл',
    busy: 'Занят',
    dnd: 'Не беспокоить',
    solo: 'Один',
    peersOnline: (n) => (n === 1 ? '1 онлайн' : `${n} онлайн`),
    peersCount: (n) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return `${n} пир`;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} пира`;
      return `${n} пиров`;
    },
    playing: 'Играет',
    inApp: 'В приложении',
    activity: 'Активность',
    listening: 'Слушаю…',
    listeningSub: 'Нет закреплённой игры или приложения',
    game: 'Игра',
    app: 'Прилож.',
    voice: 'Голос',
    video: 'Видео',
    inCall: 'в звонке',
    mute: 'мьют',
    unmute: 'вкл. мик',
    end: 'сброс',
    legacy: 'Legacy',
    transfer: 'Передача',
    dndFooter: 'Не беспокоить',
    qualityGood: 'хорошее',
    qualityUnstable: 'нестабильное',
    qualityPoor: 'плохое',
  },
};

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

let lastCallPeerId = null;
let mutedOptimistic = false;
let lang = 'en';

function S() {
  return STRINGS[lang] || STRINGS.en;
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
  html.lang = lang === 'ru' ? 'ru' : 'en';
  if (data?.accentHex) {
    html.style.setProperty('--accent', data.accentHex);
  } else {
    html.style.removeProperty('--accent');
  }
}

function applyStaticLabels() {
  const s = S();
  if (labelStatus) labelStatus.textContent = s.status;
  if (labelMesh) labelMesh.textContent = s.mesh;
  if (labelUnread) labelUnread.textContent = s.unread;
  if (labelCallMesh) labelCallMesh.textContent = s.mesh;
  if (labelCallPing) labelCallPing.textContent = s.ping;
  if (callBadge) callBadge.textContent = s.inCall;
  if (legacyPill) legacyPill.textContent = s.legacy;
  if (endBtn) endBtn.textContent = s.end;
  if (micMeter) micMeter.title = s.mute;
  setMuteUi(mutedOptimistic);
}

function tickClock(now = Date.now()) {
  const d = new Date(now);
  clockTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  clockDate.textContent = d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : undefined, {
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
  muteBtn.textContent = mutedOptimistic ? S().unmute : S().mute;
  micMeter.classList.toggle('is-muted', mutedOptimistic);
}

function resolveCallQualityLabel(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  const s = S();
  if (n < 80) return s.qualityGood;
  if (n < 170) return s.qualityUnstable;
  return s.qualityPoor;
}

function applyPayload(data) {
  lang = data?.language === 'ru' ? 'ru' : 'en';
  applySkin(data);
  applyStaticLabels();

  const s = S();
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
    ? s.dnd
    : presence === 'away'
      ? s.away
      : presence === 'busy'
        ? s.busy
        : s.online;
  statPresence.textContent = presenceLabel;
  statPeers.textContent = peers > 0 ? s.peersOnline(peers) : s.solo;

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
      kind === 'game' ? s.playing : kind === 'app' ? s.inApp : s.activity;
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
    if (kind === 'game') activityChips.appendChild(chip(s.game, 'ok'));
    else if (kind === 'app') activityChips.appendChild(chip(s.app));
  } else if (!data?.callActive) {
    panel.classList.add('idle');
    activityBlock.classList.remove('hidden');
    kindEl.textContent = '';
    kindEl.className = 'kind';
    titleEl.textContent = s.listening;
    subEl.textContent = s.listeningSub;
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
    const mode = data.callVideo ? s.video : s.voice;
    callElapsed.textContent = data.callElapsed ? `${mode} · ${data.callElapsed}` : mode;

    if (peerId !== lastCallPeerId) {
      lastCallPeerId = peerId;
      renderCallAvatar(peerId, peerName, nest);
    }

    callMesh.textContent = s.peersCount(peers);
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
    setMuteUi(false);
  }

  const xferPct = Math.round(Number(data?.transferPercent) || 0);
  const xferLabel = String(data?.transferLabel || '').trim();
  if (xferLabel && xferPct > 0 && xferPct < 100) {
    transferBox.classList.remove('hidden');
    transferLabel.textContent = xferLabel || s.transfer;
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
    footerApp.textContent = s.dndFooter;
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
