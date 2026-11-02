const STORAGE_KEY = 'blip_pins_v1';

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

function saveAll(o) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch (e) {
    console.warn('[BLIP pins]', e);
  }
}

function dmKey(peerId) {
  return String(peerId);
}

function groupKey(groupId) {
  return `g:${groupId}`;
}

export function getPinnedMessageId(peerId) {
  const id = loadAll()[dmKey(peerId)];
  return id ? String(id) : null;
}

export function setPinnedMessageId(peerId, messageId) {
  const o = loadAll();
  const k = dmKey(peerId);
  if (!messageId) delete o[k];
  else o[k] = String(messageId);
  saveAll(o);
}

export function getGroupPinnedMessageId(groupId) {
  const id = loadAll()[groupKey(groupId)];
  return id ? String(id) : null;
}

export function setGroupPinnedMessageId(groupId, messageId) {
  const o = loadAll();
  const k = groupKey(groupId);
  if (!messageId) delete o[k];
  else o[k] = String(messageId);
  saveAll(o);
}
