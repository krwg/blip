const panel = document.getElementById('panel');
const kindEl = document.getElementById('kind');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const metaEl = document.getElementById('meta');
const unreadEl = document.getElementById('unread');
const callBox = document.getElementById('callBox');
const callPeer = document.getElementById('callPeer');
const callElapsed = document.getElementById('callElapsed');
const callMeta = document.getElementById('callMeta');
const clockTime = document.getElementById('clockTime');
const clockDate = document.getElementById('clockDate');
const selfLine = document.getElementById('selfLine');
const statPresence = document.getElementById('statPresence');
const statPeers = document.getElementById('statPeers');
const statUnread = document.getElementById('statUnread');
const activityChips = document.getElementById('activityChips');
const transferBox = document.getElementById('transferBox');
const transferLabel = document.getElementById('transferLabel');
const transferPct = document.getElementById('transferPct');

function pad(n) {
  return String(n).padStart(2, '0');
}

function chip(text, mod = '') {
  const el = document.createElement('span');
  el.className = `chip${mod ? ` chip--${mod}` : ''}`;
  el.textContent = text;
  return el;
}

function tickClock(now = Date.now()) {
  const d = new Date(now);
  clockTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  clockDate.textContent = d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function applyPayload(data) {
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
  statUnread.textContent = unread > 99 ? '99+' : String(unread);

  activityChips.replaceChildren();

  if (label || status) {
    panel.classList.remove('idle');
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
    if (elapsed) bits.push(elapsed);
    subEl.textContent = bits.join(' · ');
    if (kind === 'game') activityChips.appendChild(chip('Game', 'ok'));
    else if (kind === 'app') activityChips.appendChild(chip('App'));
    if (elapsed) activityChips.appendChild(chip(`Session ${elapsed}`));
  } else {
    panel.classList.add('idle');
    kindEl.textContent = '';
    kindEl.className = 'kind';
    titleEl.textContent = 'Listening…';
    subEl.textContent = 'No foreground game or app pinned';
  }

  if (data?.callActive) {
    callBox.classList.remove('hidden');
    const peerName = data.callPeerName || `BLIP-${data.callPeerId || '?'}`;
    const peerId = data.callPeerId != null ? ` · #${data.callPeerId}` : '';
    callPeer.textContent = `${peerName}${peerId}`;
    callElapsed.textContent = data.callElapsed ? `⏱ ${data.callElapsed}` : '';
    callMeta.replaceChildren();
    callMeta.appendChild(chip(data.callVideo ? 'Video' : 'Voice', 'ok'));
    if (data.callEncrypted) callMeta.appendChild(chip('Encrypted mesh', 'ok'));
    else if (data.callLegacy) callMeta.appendChild(chip('Legacy peer', 'warn'));
    if (data.callPeerPresence) {
      callMeta.appendChild(chip(String(data.callPeerPresence)));
    }
  } else {
    callBox.classList.add('hidden');
    callPeer.textContent = '';
    callElapsed.textContent = '';
    callMeta.replaceChildren();
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

  const footerBits = [];
  if (data?.appVersion) footerBits.push(`[${data.appVersion}]`);
  if (dnd) footerBits.push('Do not disturb');
  metaEl.textContent = footerBits.join(' · ');

  if (unread > 0) {
    unreadEl.classList.remove('hidden');
    unreadEl.textContent = unread > 99 ? '99+' : String(unread);
  } else {
    unreadEl.classList.add('hidden');
    unreadEl.textContent = '';
  }

  if (data?.now) tickClock(data.now);
}

tickClock();
setInterval(() => tickClock(), 1000);

window.blipOverlay?.onUpdate?.((data) => applyPayload(data || {}));
window.blipOverlay?.ready?.();
