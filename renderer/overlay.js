const activityEl = document.getElementById('activity');
const metaEl = document.getElementById('meta');
const unreadEl = document.getElementById('unread');
const panel = document.getElementById('panel');

function applyPayload(data) {
  const activity = String(data?.activity || '').trim();
  const unread = Number(data?.unread) || 0;
  const peers = Number(data?.peersOnline) || 0;

  if (activity) {
    panel.classList.remove('idle');
    activityEl.textContent = activity;
  } else {
    panel.classList.add('idle');
    activityEl.textContent = data?.idleLabel || 'Listening…';
  }

  metaEl.textContent =
    peers > 0 ? `${peers} online` : data?.meta || '';

  if (unread > 0) {
    unreadEl.classList.remove('hidden');
    unreadEl.textContent = unread > 99 ? '99+' : String(unread);
  } else {
    unreadEl.classList.add('hidden');
    unreadEl.textContent = '';
  }
}

window.blipOverlay?.onUpdate?.((data) => applyPayload(data || {}));
window.blipOverlay?.ready?.();
