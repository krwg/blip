
import { getMaxFileBytes } from './file-transfer-limits.js';
import { parseBlipSeedFile } from './beacon-seed-file.js';
import { recordBandwidthSample } from './bandwidth-monitor.js';
import {
  decodeHaveBitmap,
  pickRarestFirstChunks,
  computeSwarmCoverage,
} from '../shared/beacon-swarm.js';

export const BEACON_CHUNK_SIZE = 1048576;
const PULSE_INTERVAL_MS = 30_000;
const CHUNK_REQUEST_BATCH = 16;
const MAX_PARALLEL_PEERS = 8;
const PIPELINED_BATCHES_PER_PEER = 3;

const SEED_TCP_BATCH = 2;
const CHUNK_TIMEOUT_MS = 45_000;
const HAVE_QUERY_MS = 12_000;

const peerHaveBitmaps = new Map();

/** @type {Map<string, boolean[]>} */
const localHaveCache = new Map();

const pendingHave = new Map();

const catalog = new Map();

const localComplete = new Set();

const localSeedIds = new Set();

const stoppedSeeding = new Set();

const jobProgress = new Map();

let pendingIngest = null;

const pendingChunks = new Map();

let pulseTimer = null;
let meshApi = null;
let getConfig = () => ({});

function beaconIpc() {
  if (meshApi?.beaconPublishFromPath) return meshApi;
  if (typeof window !== 'undefined' && window.blip?.beaconPublishFromPath) {
    return window.blip;
  }
  return meshApi;
}
let getPeers = () => [];
let getPeerLatency = () => 9999;

const pausedSeeds = new Set();

let activeServeRequests = 0;

function getMaxParallelPeers() {
  const cfg = getConfig();
  const n = Number(cfg?.beaconParallelPeers);
  if (Number.isFinite(n) && n >= 1) return Math.min(8, Math.round(n));
  return MAX_PARALLEL_PEERS;
}

function getMaxConcurrentServes() {
  const cfg = getConfig();
  const cap = Number(cfg?.beaconUploadCapPercent);
  const pct = Number.isFinite(cap) ? Math.max(10, Math.min(100, cap)) : 100;
  return Math.max(2, Math.round(12 * (pct / 100)));
}

async function acquireServeSlot() {
  const max = getMaxConcurrentServes();
  while (activeServeRequests >= max) {
    await new Promise((r) => setTimeout(r, 8));
  }
  activeServeRequests += 1;
}

function releaseServeSlot() {
  activeServeRequests = Math.max(0, activeServeRequests - 1);
}

function syncTrayProgress() {
  let best = null;
  for (const [, job] of jobProgress) {
    if (
      job?.progress > 0 &&
      job.progress < 100 &&
      (job.phase === 'downloading' || job.phase === 'publishing' || job.phase === 'hashing')
    ) {
      if (!best || job.progress >= best.progress) best = job;
    }
  }
  if (best) {
    const label =
      best.phase === 'publishing' || best.phase === 'hashing' ? 'BEACON ↑' : 'BEACON ↓';
    void meshApi?.setTrayTransferProgress?.({ percent: best.progress, label });
  } else {
    void meshApi?.setTrayTransferProgress?.(null);
  }
}

function emitCatalog() {
  window.dispatchEvent(new CustomEvent('blip-beacon-catalog'));
}

function beginPendingIngest(seedId, { filename, size }) {
  pendingIngest = {
    seedId,
    filename: String(filename || 'file'),
    size: Number(size) || 0,
  };
  setJobProgress(seedId, 0, 'hashing');
  emitCatalog();
}

function endPendingIngest() {
  pendingIngest = null;
  emitCatalog();
}

export function getPendingBeaconIngest() {
  return pendingIngest;
}

function emitProgress(seedId) {
  window.dispatchEvent(
    new CustomEvent('blip-beacon-progress', { detail: { seedId, ...(jobProgress.get(seedId) || {}) } })
  );
}

function setJobProgress(seedId, progress, phase) {
  const prev = jobProgress.get(seedId) || {};
  jobProgress.set(seedId, { ...prev, progress, phase });
  syncTrayProgress();
  emitProgress(seedId);
}

function clearJobProgress(seedId) {
  jobProgress.delete(seedId);
  syncTrayProgress();
  emitProgress(seedId);
}

function upsertCatalogEntry(data) {
  const seedId = String(data.seedId || '').trim();
  if (!seedId) return;
  const blipId = Number(data.blipId);
  let entry = catalog.get(seedId);
  if (!entry) {
    entry = {
      seedId,
      filename: String(data.filename || 'file'),
      size: Number(data.size) || 0,
      chunkSize: Number(data.chunkSize) || BEACON_CHUNK_SIZE,
      totalChunks: Number(data.totalChunks) || 0,
      seeders: new Map(),
      leechers: Number(data.leechers) || 0,
      updatedAt: Date.now(),
      previewB64: data.previewB64 || data.preview || '',
      infoHash: data.infoHash || '',
      chunkHashes: Array.isArray(data.chunkHashes) ? data.chunkHashes : undefined,
    };
    catalog.set(seedId, entry);
  }
  if (data.filename) entry.filename = String(data.filename);
  if (data.size) entry.size = Number(data.size);
  if (data.chunkSize) entry.chunkSize = Number(data.chunkSize);
  if (data.totalChunks) entry.totalChunks = Number(data.totalChunks);
  if (Number.isFinite(blipId) && blipId > 0) entry.seeders.set(blipId, Date.now());
  if (data.leechers != null) entry.leechers = Number(data.leechers) || 0;
  if (data.previewB64 || data.preview) entry.previewB64 = String(data.previewB64 || data.preview);
  if (data.infoHash) entry.infoHash = String(data.infoHash);
  if (Array.isArray(data.chunkHashes)) entry.chunkHashes = data.chunkHashes;
  entry.updatedAt = Date.now();
}

function ingestSeedUdp(data) {
  const cfg = getConfig();
  if (!cfg?.devBeaconEnabled) return;
  switch (data.type) {
    case 'seed-announce':
      upsertCatalogEntry(data);
      emitCatalog();
      break;
    case 'seed-pulse':
      if (Array.isArray(data.seeds)) {
        for (const s of data.seeds) upsertCatalogEntry({ ...s, blipId: s.blipId ?? data.blipId });
      }
      emitCatalog();
      break;
    case 'seed-gone': {
      const seedId = String(data.seedId || '');
      const blipId = Number(data.blipId);
      if (!seedId) break;
      const entry = catalog.get(seedId);
      if (entry && Number.isFinite(blipId) && blipId > 0) {
        entry.seeders.delete(blipId);
        if (entry.seeders.size === 0 && !localComplete.has(seedId)) {
          catalog.delete(seedId);
        }
      } else if (!localComplete.has(seedId)) {
        catalog.delete(seedId);
      }
      emitCatalog();
      break;
    }
    default:
      break;
  }
}

function stopBeaconPulse() {
  if (pulseTimer) {
    clearInterval(pulseTimer);
    pulseTimer = null;
  }
}

function startBeaconPulse() {
  stopBeaconPulse();
  const cfg = getConfig();
  if (!cfg?.devBeaconEnabled) return;
  pulseTimer = setInterval(() => {
    const seeds = [...localComplete]
      .filter((seedId) => !stoppedSeeding.has(seedId) && !pausedSeeds.has(seedId))
      .map((seedId) => {
        const entry = catalog.get(seedId);
        return {
          seedId,
          leechers: entry?.leechers || 0,
          blipId: cfg.blipId,
        };
      })
      .filter(Boolean);
    if (!seeds.length || !meshApi?.beaconSendUdp) return;
    void meshApi.beaconSendUdp({
      type: 'seed-pulse',
      blipId: cfg.blipId,
      seeds,
      timestamp: Date.now(),
    });
  }, PULSE_INTERVAL_MS);
}

async function reconcileLocalSeeds() {
  for (const seedId of [...localComplete]) {
    const meta = await meshApi?.beaconReadMeta?.({ seedId });
    if (!meta?.seedId) {
      localComplete.delete(seedId);
      continue;
    }
    const have = await meshApi.beaconCountChunks?.({
      seedId,
      totalChunks: meta.totalChunks,
    });
    if (have < meta.totalChunks) localComplete.delete(seedId);
  }
}

async function ensureLocalMeta(seedId, entry) {
  let meta = await meshApi?.beaconReadMeta?.({ seedId });
  if (meta?.seedId) {
    let dirty = false;
    if (!meta.infoHash && entry.infoHash) {
      meta.infoHash = entry.infoHash;
      dirty = true;
    }
    if (!meta.chunkHashes?.length && entry.chunkHashes?.length) {
      meta.chunkHashes = entry.chunkHashes;
      dirty = true;
    }
    if (dirty) await meshApi?.beaconWriteMeta?.({ seedId, meta });
    return meta;
  }
  meta = {
    seedId,
    filename: entry.filename || 'file',
    size: entry.size || 0,
    chunkSize: entry.chunkSize || BEACON_CHUNK_SIZE,
    totalChunks: entry.totalChunks || 0,
    mime: 'application/octet-stream',
    publishedAt: Date.now(),
    infoHash: entry.infoHash,
    chunkHashes: entry.chunkHashes,
  };
  const res = await meshApi?.beaconWriteMeta?.({ seedId, meta });
  if (res?.ok === false) throw new Error('no_meta');
  return meta;
}

async function ipcWriteChunk(seedId, chunkIndex, data) {
  const res = await meshApi?.beaconWriteChunk?.({ seedId, chunkIndex, data });
  if (res?.ok === false) throw new Error('chunk_write_failed');
}

async function ipcWriteMeta(seedId, meta) {
  const res = await meshApi?.beaconWriteMeta?.({ seedId, meta });
  if (res?.ok === false) throw new Error('no_meta');
}

async function loadLocalSeeds() {
  const list = await meshApi?.beaconListLocal?.();
  if (!Array.isArray(list)) return;
  const cfg = getConfig();
  for (const meta of list) {
    if (!meta?.seedId) continue;
    localSeedIds.add(meta.seedId);
    upsertCatalogEntry({ ...meta, blipId: cfg.blipId, previewB64: meta.previewB64 });
    const have = await meshApi.beaconCountChunks?.({
      seedId: meta.seedId,
      totalChunks: meta.totalChunks,
    });
    if (have >= meta.totalChunks) {
      localComplete.add(meta.seedId);
      void refreshLocalHaveCache(meta.seedId, meta.totalChunks);
    }
  }
  await reconcileLocalSeeds();
  emitCatalog();
}

export async function refreshBeaconLocalState() {
  await reconcileLocalSeeds();
  for (const seedId of localSeedIds) {
    const entry = catalog.get(seedId);
    if (entry?.totalChunks) await refreshLocalHaveCache(seedId, entry.totalChunks);
  }
  emitCatalog();
}

function readFileSliceAsBase64(file, start, end) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('not_readable'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => {
      const err = reader.error;
      reject(err instanceof Error ? err : new Error('not_readable'));
    };
    try {
      reader.readAsDataURL(file.slice(start, end));
    } catch (e) {
      reject(e instanceof Error ? e : new Error('not_readable'));
    }
  });
}

function resolvePublishFilePath(file) {
  if (!file) return '';
  if (typeof file.path === 'string' && file.path.trim()) return file.path.trim();
  const api = beaconIpc();
  if (typeof api?.getPathForFile === 'function') {
    const p = api.getPathForFile(file);
    if (typeof p === 'string' && p.trim()) return p.trim();
  }
  return '';
}

async function computeSeedId(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function publishBeaconFileFromPath(filePath, file) {
  const cfg = getConfig();
  const maxBytes = getMaxFileBytes(cfg);
  const displayName =
    file?.name || String(filePath || '').replace(/^.*[/\\]/, '') || 'file';
  const displaySize = Number(file?.size) || 0;
  beginPendingIngest('path-ingest', { filename: displayName, size: displaySize });
  let unsub = () => {};
  const api = beaconIpc();
  if (typeof api?.onBeaconIngestProgress === 'function') {
    unsub = api.onBeaconIngestProgress((p) => {
      if (p?.phase === 'hashing') setJobProgress('path-ingest', 5, 'hashing');
      else if (p?.phase === 'publishing' && p.percent != null) {
        setJobProgress('path-ingest', p.percent, 'publishing');
      }
    });
  }
  try {
    const res = await api.beaconPublishFromPath({
      filePath,
      maxBytes,
      chunkSize: BEACON_CHUNK_SIZE,
    });
    if (!res?.ok || !res.meta) {
      const code = res?.error || 'publish_failed';
      if (code === 'not_found' || code === 'read' || /could not be read/i.test(code)) {
        throw new Error('not_readable');
      }
      if (code === 'too_large') throw new Error('too_large');
      throw new Error(code);
    }
    const meta = res.meta;
    clearJobProgress('path-ingest');
    localSeedIds.add(meta.seedId);
    localComplete.add(meta.seedId);
    stoppedSeeding.delete(meta.seedId);
    upsertCatalogEntry({ ...meta, blipId: cfg.blipId });
    await announceSeed(meta);
    setJobProgress(meta.seedId, 100, 'ready');
    clearJobProgress(meta.seedId);
    return meta;
  } finally {
    unsub();
    clearJobProgress('path-ingest');
    endPendingIngest();
  }
}

function previewDataUrlFromB64(b64) {
  if (!b64) return null;
  return `data:image/jpeg;base64,${b64}`;
}

async function generatePreviewFromFile(file) {
  if (!file?.type?.startsWith('image/')) return null;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.fillStyle = '#0a0f14';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        const data = canvas.toDataURL('image/jpeg', 0.7);
        const b64 = data.split(',')[1] || '';
        resolve(b64.length > 14000 ? b64.slice(0, 14000) : b64);
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export async function resolveBeaconPreviewUrl(seedId, previewB64) {
  if (previewB64) return previewDataUrlFromB64(previewB64);
  const res = await meshApi?.beaconReadPreview?.({ seedId });
  if (res?.ok && res.data) return previewDataUrlFromB64(res.data);
  return null;
}

function peerHaveKey(seedId, peerId) {
  return `${seedId}:${peerId}`;
}

function swarmStatsForSeed(seedId, entry, local) {
  const total = entry?.totalChunks || 0;
  if (!total) {
    return { swarmPeerCount: entry?.seeders?.size || 0, swarmHavePct: local ? 100 : null };
  }
  const seederIds = [...(entry?.seeders?.keys() || [])];
  const peerHaves = [];
  for (const id of seederIds) {
    const b64 = peerHaveBitmaps.get(peerHaveKey(seedId, id));
    if (b64) peerHaves.push(decodeHaveBitmap(b64, total));
  }
  const cachedLocal = localHaveCache.get(seedId);
  const localHave =
    local && !cachedLocal
      ? Array(total).fill(true)
      : cachedLocal || Array(total).fill(false);
  const { peerCount, havePct } = computeSwarmCoverage({
    localHave,
    peerHaves,
    totalChunks: total,
  });
  const swarmPeerCount = Math.max(peerCount, seederIds.length);
  const swarmHavePct = peerHaves.length || local ? havePct : null;
  return { swarmPeerCount, swarmHavePct };
}

async function refreshLocalHaveCache(seedId, totalChunks) {
  const total = Number(totalChunks) || 0;
  if (!total || !meshApi?.beaconHaveBitmap) return;
  const res = await meshApi.beaconHaveBitmap({ seedId, totalChunks: total });
  const haveSet = decodeBitmap(res?.bitmap || '', total);
  const arr = Array.from({ length: total }, (_, i) => haveSet.has(i));
  localHaveCache.set(seedId, arr);
}

async function sha256HexFromBase64(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bin);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function computeInfoHashFromChunkHashesAsync(chunkHashes) {
  let len = 0;
  const parts = [];
  for (const hex of chunkHashes || []) {
    if (!hex) continue;
    const buf = new Uint8Array(hex.length / 2);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    parts.push(buf);
    len += buf.length;
  }
  const cat = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    cat.set(p, off);
    off += p.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', cat);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function decodeBitmap(bitmapB64, totalChunks) {
  if (!bitmapB64 || totalChunks <= 0) return new Set();
  try {
    const bytes = Uint8Array.from(atob(bitmapB64), (c) => c.charCodeAt(0));
    const have = new Set();
    for (let i = 0; i < totalChunks; i++) {
      if (bytes[i >> 3] & (1 << (i & 7))) have.add(i);
    }
    return have;
  } catch {
    return new Set();
  }
}

function countBitmapOverlap(bitmapB64, missingSet, totalChunks) {
  if (!bitmapB64 || !missingSet.size) return 0;
  const have = decodeBitmap(bitmapB64, totalChunks);
  let n = 0;
  for (const idx of missingSet) {
    if (have.has(idx)) n++;
  }
  return n;
}

function waitForPeerHave(seedId, peerId) {
  const key = peerHaveKey(seedId, peerId);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingHave.delete(key);
      resolve(null);
    }, HAVE_QUERY_MS);
    pendingHave.set(key, (bitmap) => {
      clearTimeout(timer);
      pendingHave.delete(key);
      resolve(bitmap);
    });
  });
}

async function refreshPeerHaves(seedId, peers, totalChunks) {
  const cfg = getConfig();
  if (!meshApi?.sendTcpMessage) return;
  await Promise.allSettled(
    peers.map(async (peer) => {
      const wait = waitForPeerHave(seedId, peer.id);
      await meshApi.sendTcpMessage({
        type: 'seed-have-request',
        to: peer.id,
        from: cfg.blipId,
        seedId,
        totalChunks,
      });
      const bitmap = await wait;
      if (bitmap) peerHaveBitmaps.set(peerHaveKey(seedId, peer.id), bitmap);
    })
  );
}

function pickDownloadPeers(seedId, missingSet) {
  const entry = catalog.get(seedId);
  const cfg = getConfig();
  if (!entry) return [];
  const total = entry.totalChunks || 0;
  const onlineIds = new Set(
    getPeers()
      .filter((p) => p.online && p.blipId !== cfg.blipId)
      .map((p) => p.blipId)
  );
  const candidates = [...entry.seeders.keys()]
    .filter((id) => onlineIds.has(id))
    .map((id) => {
      const bitmap = peerHaveBitmaps.get(peerHaveKey(seedId, id));
      const overlap = bitmap
        ? countBitmapOverlap(bitmap, missingSet, total)
        : missingSet.size;
      return {
        id,
        lat: getPeerLatency(id) ?? 9999,
        overlap,
      };
    })
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.lat - b.lat;
    })
    .slice(0, getMaxParallelPeers());
  return candidates;
}

function planChunkAssignments(seedId, peers, missingSet, batchSize) {
  const entry = catalog.get(seedId);
  const total = entry?.totalChunks || 0;
  const peerHaves = peers.map((p) => {
    const b64 = peerHaveBitmaps.get(peerHaveKey(seedId, p.id));
    return b64 && total ? decodeHaveBitmap(b64, total) : null;
  });
  const hasAnyBitmap = peerHaves.some(Boolean);

  if (hasAnyBitmap && total > 0) {
    const localHave = Array.from({ length: total }, (_, i) => !missingSet.has(i));
    const ordered = pickRarestFirstChunks({
      localHave,
      peerHaves: peerHaves.map((h) => h || Array(total).fill(false)),
      limit: Math.max(batchSize * peers.length * PIPELINED_BATCHES_PER_PEER, batchSize),
    });
    const assignments = [];
    const remaining = new Set(ordered);
    for (const peer of peers) {
      const peerIdx = peers.indexOf(peer);
      for (let p = 0; p < PIPELINED_BATCHES_PER_PEER; p++) {
        const chunks = [];
        for (const idx of [...remaining]) {
          if (peerHaves[peerIdx] && !peerHaves[peerIdx][idx]) continue;
          chunks.push(idx);
          remaining.delete(idx);
          if (chunks.length >= batchSize) break;
        }
        if (chunks.length) assignments.push({ peerId: peer.id, chunks });
      }
    }
    if (assignments.length) return assignments;
  }

  const queue = [...missingSet];
  const assignments = [];
  for (const peer of peers) {
    for (let p = 0; p < PIPELINED_BATCHES_PER_PEER; p++) {
      if (!queue.length) break;
      const chunks = queue.splice(0, batchSize);
      if (chunks.length) assignments.push({ peerId: peer.id, chunks });
    }
  }
  return assignments;
}

function waitForChunk(seedId, chunkIndex) {
  const key = `${seedId}:${chunkIndex}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingChunks.delete(key);
      reject(new Error('chunk_timeout'));
    }, CHUNK_TIMEOUT_MS);
    pendingChunks.set(key, {
      resolve: (data) => {
        clearTimeout(timer);
        pendingChunks.delete(key);
        resolve(data);
      },
      reject: (err) => {
        clearTimeout(timer);
        pendingChunks.delete(key);
        reject(err);
      },
      timer,
    });
  });
}

async function collectMissingChunks(seedId, total) {
  if (meshApi?.beaconHaveBitmap) {
    const res = await meshApi.beaconHaveBitmap({ seedId, totalChunks: total });
    const have = decodeBitmap(res?.bitmap || '', total);
    const missing = new Set();
    for (let i = 0; i < total; i++) {
      if (!have.has(i)) missing.add(i);
    }
    return missing;
  }
  const missing = new Set();
  for (let i = 0; i < total; i++) {
    const exists = await meshApi.beaconChunkExists?.({ seedId, chunkIndex: i });
    if (!exists) missing.add(i);
  }
  return missing;
}

async function requestChunksFromPeer(peerId, seedId, indices) {
  if (!indices.length || !meshApi?.sendTcpMessage) return [];

  const meta = await meshApi?.beaconReadMeta?.({ seedId });
  const expected = Array.isArray(meta?.chunkHashes) ? meta.chunkHashes : null;

  const waiters = indices.map((idx) =>
    waitForChunk(seedId, idx).then((data) => ({ chunkIndex: idx, data }))
  );

  void meshApi.sendTcpMessage({
    type: 'seed-request',
    to: peerId,
    from: getConfig().blipId,
    seedId,
    chunks: indices,
  });

  const settled = await Promise.allSettled(waiters);
  const chunks = [];
  for (const r of settled) {
    if (r.status !== 'fulfilled' || !r.value?.data) continue;
    const { chunkIndex, data } = r.value;
    if (expected?.[chunkIndex]) {
      const hex = await sha256HexFromBase64(data);
      if (hex !== expected[chunkIndex]) continue;
    }
    chunks.push({ chunkIndex, data });
  }

  if (!chunks.length) return [];

  if (meshApi.beaconWriteChunksBatch) {
    await meshApi.beaconWriteChunksBatch({ seedId, chunks });
  } else {
    await Promise.all(
      chunks.map((c) => meshApi.beaconWriteChunk?.({ seedId, chunkIndex: c.chunkIndex, data: c.data }))
    );
  }
  localSeedIds.add(seedId);
  const entry = catalog.get(seedId);
  if (entry?.totalChunks) void refreshLocalHaveCache(seedId, entry.totalChunks);
  return chunks.map((c) => c.chunkIndex);
}

async function serveSeedRequest(msg, api, config) {
  const from = Number(msg.from);
  const seedId = String(msg.seedId || '');
  const chunks = Array.isArray(msg.chunks) ? msg.chunks.map(Number).filter(Number.isFinite) : [];
  if (!seedId || !Number.isFinite(from) || !chunks.length) return;
  if (pausedSeeds.has(seedId)) return;
  if (stoppedSeeding.has(seedId)) return;
  if (!localComplete.has(seedId)) return;

  await acquireServeSlot();
  try {
    const ipc = beaconIpc();
    if (typeof ipc?.beaconServeChunksTcp === 'function') {
      const res = await ipc.beaconServeChunksTcp({ to: from, seedId, chunkIndices: chunks });
      const sent = Number(res?.sent) || 0;
      if (sent > 0) {
        recordBandwidthSample({ upBps: sent * BEACON_CHUNK_SIZE * 8 });
      }
      return;
    }

    let payloads = [];
    if (meshApi?.beaconReadChunksBatch) {
      const res = await meshApi.beaconReadChunksBatch({ seedId, chunkIndices: chunks });
      payloads = (res?.chunks || []).filter((c) => c?.ok && c.data);
    } else {
      payloads = (
        await Promise.all(
          chunks.map(async (idx) => {
            const exists = await meshApi?.beaconChunkExists?.({ seedId, chunkIndex: idx });
            if (!exists) return null;
            const res = await meshApi?.beaconReadChunk?.({ seedId, chunkIndex: idx });
            if (!res?.ok || !res.data) return null;
            return { chunkIndex: idx, data: res.data };
          })
        )
      ).filter(Boolean);
    }

    const sends = [];
    for (let i = 0; i < payloads.length; i += SEED_TCP_BATCH) {
      const batch = payloads.slice(i, i + SEED_TCP_BATCH);
      if (batch.length === 1) {
        const { chunkIndex, data } = batch[0];
        sends.push(
          api.sendTcpMessage({
            type: 'seed-chunk',
            to: from,
            from: config.blipId,
            seedId,
            chunkIndex,
            data,
          })
        );
      } else {
        sends.push(
          api.sendTcpMessage({
            type: 'seed-chunks-batch',
            to: from,
            from: config.blipId,
            seedId,
            chunks: batch,
          })
        );
      }
    }
    void Promise.allSettled(sends);
    const bytesUp = payloads.reduce((n, p) => n + (p.data?.length || 0) * 0.75, 0);
    if (bytesUp > 0) recordBandwidthSample({ upBps: bytesUp * 8 });
  } finally {
    releaseServeSlot();
  }
}

async function respondSeedHaveRequest(msg, api, config) {
  const from = Number(msg.from);
  const seedId = String(msg.seedId || '');
  const totalChunks = Number(msg.totalChunks) || 0;
  if (!seedId || !Number.isFinite(from) || !localComplete.has(seedId)) return;
  let bitmap = '';
  let infoHash = '';
  const meta = await meshApi?.beaconReadMeta?.({ seedId });
  if (meshApi?.beaconHaveBitmap) {
    const res = await meshApi.beaconHaveBitmap({ seedId, totalChunks });
    bitmap = res?.bitmap || '';
  }
  if (meta?.infoHash) infoHash = meta.infoHash;
  await api.sendTcpMessage({
    type: 'seed-have',
    to: from,
    from: config.blipId,
    seedId,
    totalChunks,
    bitmap,
    chunkSize: meta?.chunkSize || BEACON_CHUNK_SIZE,
    infoHash,
  });
}

function ingestPeerHave(msg) {
  const seedId = String(msg.seedId || '');
  const from = Number(msg.from);
  const bitmap = String(msg.bitmap || '');
  if (!seedId || !Number.isFinite(from)) return;
  peerHaveBitmaps.set(peerHaveKey(seedId, from), bitmap);
  if (msg.infoHash) {
    const entry = catalog.get(seedId);
    if (entry && !entry.infoHash) entry.infoHash = String(msg.infoHash);
  }
  const pending = pendingHave.get(peerHaveKey(seedId, from));
  if (pending) pending(bitmap);
}

function resolveIncomingChunksBatch(msg) {
  const seedId = String(msg.seedId || '');
  const chunks = Array.isArray(msg.chunks) ? msg.chunks : [];
  for (const c of chunks) {
    if (c?.data != null && Number.isFinite(Number(c.chunkIndex))) {
      resolveIncomingChunk({ seedId, chunkIndex: c.chunkIndex, data: c.data });
    }
  }
}

function resolveIncomingChunk(msg) {
  const seedId = String(msg.seedId || '');
  const idx = Number(msg.chunkIndex);
  const data = String(msg.data || '');
  if (!seedId || !Number.isFinite(idx) || !data) return;
  const key = `${seedId}:${idx}`;
  const pending = pendingChunks.get(key);
  if (pending) pending.resolve(data);
}

export function initBeaconMesh(opts) {
  meshApi = opts.api;
  getConfig = opts.getConfig;
  getPeers = opts.getPeers || (() => []);
  getPeerLatency = opts.getPeerLatency || (() => 9999);
  opts.api?.onSeedUdp?.((data) => ingestSeedUdp(data));
  window.addEventListener('beforeunload', stopBeaconPulse);
  void loadLocalSeeds().then(() => startBeaconPulse());
}

export function refreshBeaconMesh() {
  void loadLocalSeeds().then(() => startBeaconPulse());
}

export function isSeedPaused(seedId) {
  return pausedSeeds.has(seedId);
}

export function setSeedPaused(seedId, paused) {
  if (paused) pausedSeeds.add(seedId);
  else pausedSeeds.delete(seedId);
  emitCatalog();
}

export function setAllSeedsPaused(paused) {
  pausedSeeds.clear();
  if (paused) {
    for (const seedId of localComplete) pausedSeeds.add(seedId);
  }
  emitCatalog();
}

export async function stopAllBeaconSeeds() {
  for (const seedId of [...localComplete]) {
    if (stoppedSeeding.has(seedId)) continue;
    try {
      await stopBeaconSeed(seedId);
    } catch {

    }
  }
  return true;
}

export function buildBeaconSeedLink(seedId) {
  return `blip://seed/${String(seedId || '').trim()}`;
}

export function buildBeaconAttachment(meta) {
  if (!meta?.seedId) return null;
  return {
    kind: 'file',
    name: meta.filename || 'file',
    size: meta.size || 0,
    seedId: meta.seedId,
    beacon: true,
  };
}

export function hasLocalSeedData(seedId) {
  return localSeedIds.has(String(seedId || ''));
}

export async function deleteBeaconSeed(seedId) {
  const cfg = getConfig();
  if (!cfg?.devBeaconEnabled) throw new Error('disabled');
  seedId = String(seedId || '').trim();
  if (!seedId) throw new Error('invalid');

  if (localComplete.has(seedId) && !stoppedSeeding.has(seedId)) {
    try {
      await stopBeaconSeed(seedId);
    } catch {

    }
  }

  pausedSeeds.delete(seedId);
  stoppedSeeding.delete(seedId);
  localComplete.delete(seedId);
  localSeedIds.delete(seedId);
  jobProgress.delete(seedId);
  catalog.delete(seedId);
  localHaveCache.delete(seedId);
  peerHaveBitmaps.forEach((_, key) => {
    if (key.startsWith(`${seedId}:`)) peerHaveBitmaps.delete(key);
  });

  await meshApi?.beaconDeleteSeed?.({ seedId });
  syncTrayProgress();
  emitCatalog();
  return true;
}

export function registerBlipSeedDescriptor(doc) {
  if (!doc?.seedId) throw new Error('invalid');
  upsertCatalogEntry({
    seedId: doc.seedId,
    filename: doc.filename,
    size: doc.size,
    chunkSize: doc.chunkSize || BEACON_CHUNK_SIZE,
    totalChunks: doc.totalChunks,
  });
  emitCatalog();
  return doc.seedId;
}

export async function openBlipSeedFileContent(text) {
  const doc = parseBlipSeedFile(text);
  if (!doc) throw new Error('invalid_blip');
  registerBlipSeedDescriptor(doc);
  return doc;
}

export async function getBeaconSeedExportMeta(seedId) {
  const meta = await meshApi?.beaconReadMeta?.({ seedId });
  if (meta?.seedId) return meta;
  const entry = catalog.get(seedId);
  if (!entry) return null;
  return {
    seedId,
    filename: entry.filename,
    size: entry.size,
    chunkSize: entry.chunkSize,
    totalChunks: entry.totalChunks,
  };
}

export async function stopBeaconSeed(seedId) {
  const cfg = getConfig();
  if (!cfg?.devBeaconEnabled) throw new Error('disabled');
  seedId = String(seedId || '');
  if (!seedId || !localComplete.has(seedId)) throw new Error('not_seeding');

  pausedSeeds.delete(seedId);
  stoppedSeeding.add(seedId);

  const entry = catalog.get(seedId);
  if (entry) {
    entry.seeders.delete(cfg.blipId);
    if (entry.seeders.size === 0) catalog.delete(seedId);
  }

  jobProgress.delete(seedId);

  if (meshApi?.beaconSendUdp) {
    await meshApi.beaconSendUdp({
      type: 'seed-gone',
      seedId,
      blipId: cfg.blipId,
      timestamp: Date.now(),
    });
  }

  emitCatalog();
  startBeaconPulse();
  return true;
}

export function isSeedStopped(seedId) {
  return stoppedSeeding.has(String(seedId || ''));
}

export async function resumeBeaconSeeding(seedId) {
  const cfg = getConfig();
  if (!cfg?.devBeaconEnabled) throw new Error('disabled');
  seedId = String(seedId || '');
  if (!localComplete.has(seedId)) throw new Error('not_local');
  const meta = await meshApi?.beaconReadMeta?.({ seedId });
  if (!meta?.seedId) throw new Error('no_meta');
  stoppedSeeding.delete(seedId);
  pausedSeeds.delete(seedId);
  await announceSeed(meta);
  startBeaconPulse();
  return true;
}

export function getBeaconJobProgress(seedId) {
  return jobProgress.get(seedId) || null;
}

export function isSeedLocalComplete(seedId) {
  return localComplete.has(seedId);
}

export function getBeaconCatalog() {
  const cfg = getConfig();
  const rows = [...catalog.values()].map((e) => {
    const local = localComplete.has(e.seedId);
    const job = jobProgress.get(e.seedId);
    const paused = pausedSeeds.has(e.seedId);
    const stopped = stoppedSeeding.has(e.seedId);
    const activelySeeding = local && !stopped && !paused;
    const swarm = swarmStatsForSeed(e.seedId, e, local);
    return {
      seedId: e.seedId,
      filename: e.filename,
      size: e.size,
      chunkSize: e.chunkSize,
      totalChunks: e.totalChunks,
      seederCount: e.seeders.size,
      swarmPeerCount: swarm.swarmPeerCount,
      swarmHavePct: swarm.swarmHavePct,
      leechers: e.leechers || 0,
      updatedAt: e.updatedAt,
      local,
      mine: activelySeeding && e.seeders.has(cfg.blipId),
      canSave: local,
      paused,
      stopped,
      progress: job?.progress ?? (local ? 100 : 0),
      phase: job?.phase || (local ? 'ready' : ''),
      previewB64: e.previewB64 || '',
      previewUrl: previewDataUrlFromB64(e.previewB64),
      hasLocalData: localSeedIds.has(e.seedId),
      status: stopped
        ? 'stopped'
        : paused
          ? 'paused'
          : job?.phase || (activelySeeding ? 'seeding' : local ? 'local' : 'available'),
    };
  });

  if (pendingIngest) {
    const job = jobProgress.get(pendingIngest.seedId);
    rows.unshift({
      seedId: pendingIngest.seedId,
      filename: pendingIngest.filename,
      size: pendingIngest.size,
      chunkSize: BEACON_CHUNK_SIZE,
      totalChunks: 0,
      seederCount: 0,
      swarmPeerCount: 0,
      swarmHavePct: null,
      leechers: 0,
      updatedAt: Date.now(),
      local: false,
      mine: true,
      canSave: false,
      paused: false,
      stopped: false,
      progress: job?.progress ?? 0,
      phase: job?.phase || 'hashing',
      previewB64: '',
      previewUrl: null,
      hasLocalData: false,
      status: job?.phase || 'hashing',
      pendingIngest: true,
    });
  }

  return rows;
}

export function handleBeaconTcp(msg, { api, config }) {
  if (!config?.devBeaconEnabled) return false;
  switch (msg.type) {
    case 'seed-request':
      void serveSeedRequest(msg, api, config);
      return true;
    case 'seed-have-request':
      void respondSeedHaveRequest(msg, api, config);
      return true;
    case 'seed-chunk':
      resolveIncomingChunk(msg);
      return true;
    case 'seed-chunks-batch':
      resolveIncomingChunksBatch(msg);
      return true;
    case 'seed-have':
      ingestPeerHave(msg);
      return true;
    default:
      return false;
  }
}

export async function announceSeed(meta) {
  const cfg = getConfig();
  if (!cfg?.devBeaconEnabled || !meshApi?.beaconSendUdp) return false;
  upsertCatalogEntry({ ...meta, blipId: cfg.blipId });
  const packet = {
    type: 'seed-announce',
    ...meta,
    blipId: cfg.blipId,
    chunkSize: meta.chunkSize || BEACON_CHUNK_SIZE,
    timestamp: Date.now(),
  };
  if (meta.previewB64 && meta.previewB64.length < 4000) {
    packet.previewB64 = meta.previewB64;
  }
  await meshApi.beaconSendUdp(packet);
  emitCatalog();
  return true;
}

const RENDERER_PUBLISH_MAX = 4 * 1024 * 1024;

export async function publishBeaconFilePath(filePath) {
  const cfg = getConfig();
  if (!cfg?.devBeaconEnabled) throw new Error('disabled');
  const p = String(filePath || '').trim();
  if (!p) throw new Error('no_path');
  if (!beaconIpc()?.beaconPublishFromPath) throw new Error('no_path');
  return publishBeaconFileFromPath(p, null);
}

export async function publishBeaconFile(file) {
  const cfg = getConfig();
  if (!cfg?.devBeaconEnabled) throw new Error('disabled');
  const maxBytes = getMaxFileBytes(cfg);
  if (!file || file.size <= 0) throw new Error('empty');
  if (file.size > maxBytes) throw new Error('too_large');

  const diskPath = resolvePublishFilePath(file);
  if (diskPath && beaconIpc()?.beaconPublishFromPath) {
    return publishBeaconFileFromPath(diskPath, file);
  }
  if (!diskPath && file.size > RENDERER_PUBLISH_MAX) {
    throw new Error('no_path');
  }

  const chunkSize = BEACON_CHUNK_SIZE;
  const totalChunks = Math.ceil(file.size / chunkSize);
  const hashKey = `hash-${Date.now()}`;
  setJobProgress(hashKey, 5, 'hashing');

  let seedId;
  try {
    seedId = await computeSeedId(file);
  } finally {
    jobProgress.delete(hashKey);
  }

  setJobProgress(seedId, 8, 'publishing');

  const meta = {
    seedId,
    filename: file.name || 'file',
    size: file.size,
    chunkSize,
    totalChunks,
    mime: file.type || 'application/octet-stream',
    publishedAt: Date.now(),
  };

  let previewB64 = null;
  if (file.size <= 8 * 1024 * 1024) {
    previewB64 = await generatePreviewFromFile(file);
  }
  if (previewB64) {
    meta.previewB64 = previewB64;
    await meshApi?.beaconWritePreview?.({ seedId, data: previewB64 });
  }

  try {
    const chunkHashes = [];
    await ipcWriteMeta(seedId, meta);
    localSeedIds.add(seedId);

    for (let i = 0; i < totalChunks; i++) {
      const batch = [];
      const end = Math.min(totalChunks, i + 8);
      for (let j = i; j < end; j++) {
        const start = j * chunkSize;
        const sliceEnd = Math.min(file.size, start + chunkSize);
        const data = await readFileSliceAsBase64(file, start, sliceEnd);
        chunkHashes[j] = await sha256HexFromBase64(data);
        batch.push({ chunkIndex: j, data });
      }
      if (meshApi?.beaconWriteChunksBatch) {
        await meshApi.beaconWriteChunksBatch({ seedId, chunks: batch });
      } else {
        for (const { chunkIndex, data } of batch) {
          await ipcWriteChunk(seedId, chunkIndex, data);
        }
      }
      i = end - 1;
      setJobProgress(seedId, Math.round(8 + (end / totalChunks) * 82), 'publishing');
    }

    meta.chunkHashes = chunkHashes;
    meta.infoHash = await computeInfoHashFromChunkHashesAsync(chunkHashes);
    await ipcWriteMeta(seedId, meta);

    localComplete.add(seedId);
    localSeedIds.add(seedId);
    stoppedSeeding.delete(seedId);
    upsertCatalogEntry({ ...meta, blipId: cfg.blipId });
    await announceSeed(meta);
    setJobProgress(seedId, 100, 'ready');
    clearJobProgress(seedId);
    return meta;
  } catch (err) {
    localComplete.delete(seedId);
    clearJobProgress(seedId);
    throw err;
  }
}

export async function downloadBeaconSeed(seedId) {
  const cfg = getConfig();
  if (!cfg?.devBeaconEnabled) throw new Error('disabled');
  const entry = catalog.get(seedId);
  if (!entry) throw new Error('not_found');

  if (localComplete.has(seedId)) {
    await ensureLocalMeta(seedId, entry);
    const res = await meshApi.beaconSaveAssembled?.({
      seedId,
      defaultName: entry.filename,
    });
    if (res?.cancelled) return { cancelled: true };
    if (!res?.ok) {
      if (res?.error === 'no_meta') localComplete.delete(seedId);
      throw new Error(res?.error || 'save_failed');
    }
    return res;
  }

  const total = entry.totalChunks;
  const missing = await collectMissingChunks(seedId, total);

  if (missing.size === 0) {
    await ensureLocalMeta(seedId, entry);
    localComplete.add(seedId);
    localSeedIds.add(seedId);
    stoppedSeeding.delete(seedId);
    upsertCatalogEntry({ ...entry, blipId: cfg.blipId });
    await announceSeed({
      seedId,
      filename: entry.filename,
      size: entry.size,
      chunkSize: entry.chunkSize,
      totalChunks: entry.totalChunks,
    });
    const res = await meshApi.beaconSaveAssembled?.({
      seedId,
      defaultName: entry.filename,
    });
    if (res?.cancelled) return { cancelled: true };
    if (!res?.ok) {
      if (res?.error === 'no_meta') localComplete.delete(seedId);
      throw new Error(res?.error || 'save_failed');
    }
    return res;
  }

  setJobProgress(seedId, Math.round(((total - missing.size) / total) * 100), 'downloading');

  const allPeers = pickDownloadPeers(seedId, missing);
  if (allPeers.length) await refreshPeerHaves(seedId, allPeers, total);

  let stallRounds = 0;
  let downloadedBytes = 0;
  const dlStarted = Date.now();
  while (missing.size > 0) {
    const peers = pickDownloadPeers(seedId, missing);
    if (!peers.length) throw new Error('no_seeders');

    const before = missing.size;
    const assignments = planChunkAssignments(seedId, peers, missing, CHUNK_REQUEST_BATCH);
    const got = await Promise.all(
      assignments.map(({ peerId, chunks }) => requestChunksFromPeer(peerId, seedId, chunks))
    );
    for (const indices of got) {
      for (const idx of indices) missing.delete(idx);
      downloadedBytes += indices.length * (entry.chunkSize || BEACON_CHUNK_SIZE);
    }

    const elapsed = Math.max(0.001, (Date.now() - dlStarted) / 1000);
    const speedBps = downloadedBytes / elapsed;
    setJobProgress(seedId, Math.round(((total - missing.size) / total) * 100), 'downloading');
    jobProgress.set(seedId, {
      progress: Math.round(((total - missing.size) / total) * 100),
      phase: 'downloading',
      speedBps,
    });
    emitProgress(seedId);
    recordBandwidthSample({ downBps: speedBps });
    syncTrayProgress();

    if (missing.size === before) {
      stallRounds += 1;
      if (stallRounds >= 4) {
        await refreshPeerHaves(seedId, peers, total);
        stallRounds = 0;
        if (missing.size === before) throw new Error('stalled');
      }
    } else {
      stallRounds = 0;
    }
  }

  const meta = await meshApi.beaconReadMeta?.({ seedId });
  if (meta) await meshApi.beaconWriteMeta?.({ seedId, meta });

  localComplete.add(seedId);
  stoppedSeeding.delete(seedId);
  upsertCatalogEntry({ ...entry, blipId: cfg.blipId });
  await ensureLocalMeta(seedId, entry);
  await announceSeed({
    seedId,
    filename: entry.filename,
    size: entry.size,
    chunkSize: entry.chunkSize,
    totalChunks: entry.totalChunks,
  });

  setJobProgress(seedId, 100, 'saving');
  const res = await meshApi.beaconSaveAssembled?.({
    seedId,
    defaultName: entry.filename,
  });
  clearJobProgress(seedId);
  void meshApi?.setTrayTransferProgress?.(null);
  if (res?.cancelled) return { cancelled: true };
  if (!res?.ok) throw new Error(res?.error || 'save_failed');
  return res;
}
