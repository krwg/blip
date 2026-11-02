const STORAGE_KEY = 'blip_peer_call_volumes_v1';

function readMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function normalizePeerVolumePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.max(0, Math.min(200, Math.round(n)));
}

export function getPeerCallVolumePct(peerId) {
  const id = String(Number(peerId));
  if (!Number.isFinite(Number(peerId))) return 100;
  const map = readMap();
  return normalizePeerVolumePct(map[id] ?? 100);
}

export function setPeerCallVolumePct(peerId, pct) {
  const id = String(Number(peerId));
  if (!Number.isFinite(Number(peerId))) return 100;
  const next = normalizePeerVolumePct(pct);
  const map = readMap();
  map[id] = next;
  writeMap(map);
  return next;
}
