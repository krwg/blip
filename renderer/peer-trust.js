/**
 * Trust & block lists — persisted in blip-config.json (enforced in main over TCP).
 */
const TRUST_KEY = 'blip_trusted_peers_v1';
const BLOCK_KEY = 'blip_blocked_peers_v1';

let trustedIds = new Set();
let blockedIds = new Set();
let saveApi = null;

function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((n) => Number(n)).filter((n) => Number.isFinite(n)));
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

function persistToMain() {
  if (!saveApi) return;
  void saveApi({
    trustedPeerIds: [...trustedIds].sort((a, b) => a - b),
    blockedPeerIds: [...blockedIds].sort((a, b) => a - b),
  });
}

/** Call once from initUI with config + api.saveConfig */
export function initPeerTrust(cfg, api) {
  saveApi = (updates) => api.saveConfig(updates);
  const fromConfigTrusted = Array.isArray(cfg?.trustedPeerIds) ? cfg.trustedPeerIds : null;
  const fromConfigBlocked = Array.isArray(cfg?.blockedPeerIds) ? cfg.blockedPeerIds : null;

  if (fromConfigTrusted?.length || fromConfigBlocked?.length) {
    trustedIds = new Set(fromConfigTrusted.map((n) => Number(n)).filter(Number.isFinite));
    blockedIds = new Set(fromConfigBlocked.map((n) => Number(n)).filter(Number.isFinite));
    saveSet(TRUST_KEY, trustedIds);
    saveSet(BLOCK_KEY, blockedIds);
  } else {
    trustedIds = loadSet(TRUST_KEY);
    blockedIds = loadSet(BLOCK_KEY);
    if (trustedIds.size || blockedIds.size) persistToMain();
  }
}

export function applyTrustFromConfig(cfg) {
  if (Array.isArray(cfg?.trustedPeerIds)) {
    trustedIds = new Set(cfg.trustedPeerIds.map((n) => Number(n)).filter(Number.isFinite));
    saveSet(TRUST_KEY, trustedIds);
  }
  if (Array.isArray(cfg?.blockedPeerIds)) {
    blockedIds = new Set(cfg.blockedPeerIds.map((n) => Number(n)).filter(Number.isFinite));
    saveSet(BLOCK_KEY, blockedIds);
  }
}

export function isTrusted(peerId) {
  return trustedIds.has(Number(peerId));
}

export function trustPeer(peerId) {
  trustedIds.add(Number(peerId));
  saveSet(TRUST_KEY, trustedIds);
  persistToMain();
}

export function isBlocked(peerId) {
  return blockedIds.has(Number(peerId));
}

export function blockPeer(peerId) {
  blockedIds.add(Number(peerId));
  saveSet(BLOCK_KEY, blockedIds);
  persistToMain();
  window.dispatchEvent(new CustomEvent('blip-peer-trust-changed'));
}

export function unblockPeer(peerId) {
  blockedIds.delete(Number(peerId));
  saveSet(BLOCK_KEY, blockedIds);
  persistToMain();
  window.dispatchEvent(new CustomEvent('blip-peer-trust-changed'));
}

export function getBlockedPeerIds() {
  return [...blockedIds].sort((a, b) => a - b);
}
