const STORAGE_KEY = 'blip_netlog_v1';
const MAX = 120;

let entries = [];

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) entries = arr.slice(-MAX);
  } catch {
    entries = [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {
    /* ignore */
  }
}

load();

export function logPeerEvent(peerId, event, detail = '') {
  entries.push({
    ts: Date.now(),
    peerId: peerId != null ? Number(peerId) : null,
    event: String(event || ''),
    detail: detail ? String(detail).slice(0, 80) : '',
  });
  if (entries.length > MAX) entries = entries.slice(-MAX);
  persist();
}

export function logDiscoveryEmit(meta = {}) {
  const reason = meta?.reason || 'unspecified';
  const peerId = meta?.peerId != null ? Number(meta.peerId) : null;
  const flags = [];
  if (meta?.sublineOnly) flags.push('subline');
  logPeerEvent(Number.isFinite(peerId) ? peerId : null, `emit:${reason}`, flags.join(','));
}

export function getNetworkLogEntries() {
  return [...entries].reverse();
}

export function clearNetworkLog() {
  entries = [];
  persist();
}
