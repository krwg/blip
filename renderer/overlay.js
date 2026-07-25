const panel = document.getElementById('panel');
const kindEl = document.getElementById('kind');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const metaEl = document.getElementById('meta');
const unreadEl = document.getElementById('unread');
const callBox = document.getElementById('callBox');
const callPeer = document.getElementById('callPeer');
const callElapsed = document.getElementById('callElapsed');
const clockTime = document.getElementById('clockTime');
const clockDate = document.getElementById('clockDate');

function pad(n) {
  return String(n).padStart(2, '0');
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
  const unread = Number(data?.unread) || 0;
  const peers = Number(data?.peersOnline) || 0;

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
    if (elapsed) bits.push(elapsed);
    subEl.textContent = bits.join(' · ');
  } else {
    panel.classList.add('idle');
    kindEl.textContent = '';
    kindEl.className = 'kind';
    titleEl.textContent = 'Listening…';
    subEl.textContent = '';
  }

  if (data?.callActive) {
    callBox.classList.remove('hidden');
    callPeer.textContent = data.callPeerName || `BLIP-${data.callPeerId || '?'}`;
    callElapsed.textContent = data.callElapsed ? `⏱ ${data.callElapsed}` : '';
  } else {
    callBox.classList.add('hidden');
    callPeer.textContent = '';
    callElapsed.textContent = '';
  }

  metaEl.textContent = peers > 0 ? `${peers} online` : '';
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
