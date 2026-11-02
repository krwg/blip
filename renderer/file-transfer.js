import { createMessageId } from './message-id.js';
import {
  encodeInlineFileAttachment,
  INLINE_FILE_BYTES,
  validateChatFile,
  inferAttachmentKind,
} from './chat-attachments.js';
import { getMaxFileBytes } from './file-transfer-limits.js';
import { getChunkDelayMs } from './file-transfer-speed.js';
import { recordBandwidthSample } from './bandwidth-monitor.js';

const CHUNK_RAW_BYTES = 1024 * 1024;

const CHUNKS_PER_TCP_BATCH = 2;

const SEND_PIPELINE_DEPTH = 12;

/** Soft cap on chunkCount to stop absurd offers from allocating huge sparse arrays. */
const MAX_CHUNK_COUNT = 100 * 1024;

function resolveFileDiskPath(file) {
  if (!file) return '';
  if (typeof window !== 'undefined' && window.blip?.getPathForFile) {
    const p = window.blip.getPathForFile(file);
    if (typeof p === 'string' && p.trim()) return p.trim();
  }
  if (typeof file.path === 'string' && file.path.trim()) return file.path.trim();
  return '';
}

function buildChunkedAttachment(file, transferId, opts) {
  return {
    chunked: true,
    transferId,
    attachment: {
      kind: 'file',
      name: file.name || 'file',
      mime: file.type || 'application/octet-stream',
      size: file.size,
      transferId,
      groupId: opts.groupId,
      msgId: opts.msgId,
    },
  };
}

function delay(ms) {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

async function isCallActive() {
  try {
    if (window.blip?.isVoiceCallActive) {
      if (await window.blip.isVoiceCallActive()) return true;
    }
    if (window.blip?.isGroupCallActiveSync?.()) return true;
  } catch {

  }
  return false;
}

const incoming = new Map();

const cancelRequested = new Set();

function transferKey(peerId, transferId) {
  return `${peerId}:${transferId}`;
}

export function isTransferCancelled(peerId, transferId) {
  return cancelRequested.has(transferKey(peerId, transferId));
}

export function clearTransferCancel(peerId, transferId) {
  cancelRequested.delete(transferKey(peerId, transferId));
}

export async function abortFileTransfer(api, config, peerId, transferId) {
  cancelRequested.add(transferKey(peerId, transferId));
  incoming.delete(transferKey(peerId, transferId));
  try {
    await api.sendTcpMessage({
      type: 'file-abort',
      to: peerId,
      from: config.blipId,
      transferId,
    });
  } catch {

  }
}

function readFileSliceAsBase64(file, start, end) {
  return new Promise((resolve, reject) => {
    const slice = file.slice(start, end);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('read'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(slice);
  });
}

function base64ToUint8Array(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function countFilledChunks(entry) {
  let n = 0;
  for (let i = 0; i < entry.chunks.length; i++) {
    if (typeof entry.chunks[i] === 'string') n += 1;
  }
  return n;
}

function assembleIncoming(entry) {
  const { chunkCount, mime, name, size } = entry.meta;
  if (!chunkCount || entry.chunks.length < chunkCount) {
    throw new Error('incomplete');
  }
  const parts = [];
  for (let i = 0; i < chunkCount; i++) {
    const part = entry.chunks[i];
    if (typeof part !== 'string') throw new Error('incomplete');
    parts.push(base64ToUint8Array(part));
    entry.chunks[i] = null;
  }
  entry.chunks.length = 0;

  const blob = new Blob(parts, { type: mime || 'application/octet-stream' });
  const kind = inferAttachmentKind(mime, name);
  const objectUrl = URL.createObjectURL(blob);
  return {
    kind,
    name,
    mime,
    size: size || blob.size,
    blob,
    objectUrl,
  };
}

function useDiskReceive(size) {
  return (
    Number(size) > INLINE_FILE_BYTES &&
    typeof window !== 'undefined' &&
    !!window.blip?.receiveFileBegin
  );
}

async function ensureDiskSink(entry) {
  if (entry.diskReady || entry.diskFailed) return;
  if (entry.diskPromise) {
    await entry.diskPromise;
    return;
  }
  entry.diskPromise = (async () => {
    const res = await window.blip.receiveFileBegin({
      transferId: entry.meta.transferId,
      name: entry.meta.name,
      mime: entry.meta.mime,
      size: entry.meta.size,
      chunkCount: entry.meta.chunkCount,
      chunkBytes: CHUNK_RAW_BYTES,
    });
    if (!res?.ok) {
      entry.diskFailed = true;
      throw new Error(res?.error || 'receive_begin_failed');
    }
    entry.diskReady = true;
    const pending = entry.pendingDiskChunks || [];
    entry.pendingDiskChunks = [];
    if (pending.length) {
      await window.blip.receiveFileChunksBatch({
        transferId: entry.meta.transferId,
        chunks: pending,
      });
    }
  })();
  try {
    await entry.diskPromise;
  } finally {
    entry.diskPromise = null;
  }
}

async function writeDiskChunks(entry, chunks) {
  if (!Array.isArray(chunks) || !chunks.length) return;
  await ensureDiskSink(entry);
  if (entry.diskFailed) throw new Error('disk_failed');
  if (!entry.diskReady) {
    entry.pendingDiskChunks = entry.pendingDiskChunks || [];
    entry.pendingDiskChunks.push(...chunks);
    return;
  }
  const fresh = [];
  for (const part of chunks) {
    const idx = Number(part?.index);
    if (!Number.isFinite(idx) || idx < 0) continue;
    if (entry.seenDisk?.has(idx)) continue;
    if (!entry.seenDisk) entry.seenDisk = new Set();
    entry.seenDisk.add(idx);
    entry.received += 1;
    fresh.push({ index: idx, data: String(part.data || '') });
  }
  if (fresh.length) {
    await window.blip.receiveFileChunksBatch({
      transferId: entry.meta.transferId,
      chunks: fresh,
    });
  }
}

export function isAcceptableIncomingFileOffer(msg, config) {
  const size = Number(msg?.size) || 0;
  const chunkCount = Number(msg?.chunkCount) || 0;
  if (!msg?.transferId) return false;
  if (size <= 0 || chunkCount <= 0) return false;
  if (chunkCount > MAX_CHUNK_COUNT) return false;
  const maxBytes = getMaxFileBytes(config);
  if (size > maxBytes) return false;
  const expectedChunks = Math.ceil(size / CHUNK_RAW_BYTES);
  if (chunkCount > expectedChunks + 1) return false;
  return true;
}

async function sendChatFileFromDisk(api, config, peerId, file, diskPath, onProgress, opts) {
  const transferId = opts.transferId || createMessageId();
  const key = transferKey(peerId, transferId);
  clearTransferCancel(peerId, transferId);

  let unsub = () => {};
  if (typeof window !== 'undefined' && window.blip?.onFileSendProgress) {
    unsub = window.blip.onFileSendProgress((p) => {
      if (p?.transferId !== transferId) return;
      if (p.speedBps) recordBandwidthSample({ upBps: p.speedBps });
      onProgress?.(p.percent ?? 0, { speedBps: p.speedBps, bytesSent: p.bytesSent });
    });
  }

  try {
    const res = await window.blip.sendFileFromPath({
      filePath: diskPath,
      to: peerId,
      transferId,
      name: file.name || 'file',
      mime: file.type || 'application/octet-stream',
      size: file.size,
      groupId: opts.groupId,
      msgId: opts.msgId,
    });
    if (!res?.ok) throw new Error(res?.error || 'send_failed');
    if (cancelRequested.has(key)) throw new Error('cancelled');
    clearTransferCancel(peerId, transferId);
    return buildChunkedAttachment(file, transferId, opts);
  } finally {
    unsub();
  }
}

export async function sendChatFile(api, config, peerId, file, onProgress, opts = {}) {
  validateChatFile(file);

  if (file.size <= INLINE_FILE_BYTES) {
    const attachment = await encodeInlineFileAttachment(file, config);
    return { inline: true, attachment };
  }

  const diskPath = resolveFileDiskPath(file);
  if (diskPath && typeof window !== 'undefined' && window.blip?.sendFileFromPath) {
    return sendChatFileFromDisk(api, config, peerId, file, diskPath, onProgress, opts);
  }

  const transferId = opts.transferId || createMessageId();
  const chunkCount = Math.ceil(file.size / CHUNK_RAW_BYTES);
  const key = transferKey(peerId, transferId);
  clearTransferCancel(peerId, transferId);

  const base = {
    to: peerId,
    from: config.blipId,
    transferId,
  };
  if (opts.groupId) base.groupId = opts.groupId;
  if (opts.msgId) base.msgId = opts.msgId;

  await api.sendTcpMessage({
    type: 'file-offer',
    ...base,
    name: file.name || 'file',
    mime: file.type || 'application/octet-stream',
    size: file.size,
    chunkCount,
  });

  const callActive = await isCallActive();
  const chunkDelay = getChunkDelayMs(config, callActive);
  const startedAt = Date.now();
  let bytesSent = 0;
  const inFlight = [];

  for (let i = 0; i < chunkCount; ) {
    if (cancelRequested.has(key)) {
      await abortFileTransfer(api, config, peerId, transferId);
      throw new Error('cancelled');
    }

    const batch = [];
    for (let b = 0; b < CHUNKS_PER_TCP_BATCH && i < chunkCount; b++, i++) {
      const start = i * CHUNK_RAW_BYTES;
      const end = Math.min(file.size, start + CHUNK_RAW_BYTES);
      const data = await readFileSliceAsBase64(file, start, end);
      batch.push({ index: i, data });
      bytesSent = end;
    }

    const sendPromise = api.sendTcpMessage({
      type: 'file-chunks-batch',
      ...base,
      chunks: batch,
    });
    inFlight.push(sendPromise);
    if (inFlight.length >= SEND_PIPELINE_DEPTH) {
      await inFlight.shift();
    }

    const elapsed = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const speedBps = bytesSent / elapsed;
    recordBandwidthSample({ upBps: speedBps });
    onProgress?.(Math.round((bytesSent / file.size) * 100), { speedBps, bytesSent });
    await delay(chunkDelay);
  }

  while (inFlight.length) {
    await inFlight.shift();
  }

  if (cancelRequested.has(key)) {
    await abortFileTransfer(api, config, peerId, transferId);
    throw new Error('cancelled');
  }

  await api.sendTcpMessage({
    type: 'file-done',
    ...base,
  });

  clearTransferCancel(peerId, transferId);

  return buildChunkedAttachment(file, transferId, opts);
}

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(file);
  });
}

function applyIncomingChunks(entry, chunks) {
  if (!Array.isArray(chunks)) return;
  const maxIdx = Math.max(0, (entry.meta.chunkCount || 0) - 1);
  for (const part of chunks) {
    const idx = Number(part?.index);
    if (!Number.isFinite(idx) || idx < 0 || idx > maxIdx) continue;
    if (typeof entry.chunks[idx] === 'string') continue;
    entry.chunks[idx] = String(part.data || '');
    entry.received += 1;
  }
}

function progressPct(entry) {
  if (!entry.meta.chunkCount) return 0;
  return Math.min(100, Math.round((entry.received / entry.meta.chunkCount) * 100));
}

export function handleFileTransferTcp(msg, { config, onComplete, onProgress, onAbort }) {
  const type = msg.type;
  const peerId = Number(msg.from === config.blipId ? msg.to : msg.from);
  if (!Number.isFinite(peerId)) return false;

  if (type === 'file-offer') {
    const key = transferKey(peerId, msg.transferId);
    if (!isAcceptableIncomingFileOffer(msg, config)) {
      incoming.delete(key);
      onAbort?.(peerId, msg.transferId);
      return true;
    }
    const chunkCount = Number(msg.chunkCount) || 0;
    const size = Number(msg.size) || 0;
    const disk = useDiskReceive(size);
    const entry = {
      meta: {
        transferId: msg.transferId,
        name: String(msg.name || 'file').slice(0, 200),
        mime: String(msg.mime || 'application/octet-stream').slice(0, 120),
        size,
        chunkCount,
        groupId: msg.groupId ? String(msg.groupId) : '',
        msgId: msg.msgId ? String(msg.msgId) : '',
      },
      chunks: disk ? null : new Array(chunkCount),
      received: 0,
      peerId,
      disk,
      seenDisk: disk ? new Set() : null,
      pendingDiskChunks: [],
    };
    incoming.set(key, entry);
    if (disk) void ensureDiskSink(entry).catch(() => {});
    onProgress?.(peerId, msg.transferId, 0);
    return true;
  }

  if (type === 'file-chunks-batch') {
    const key = transferKey(peerId, msg.transferId);
    const entry = incoming.get(key);
    if (!entry) return true;
    if (entry.disk) {
      void writeDiskChunks(entry, msg.chunks)
        .then(() => onProgress?.(peerId, msg.transferId, progressPct(entry)))
        .catch(() => {});
      return true;
    }
    applyIncomingChunks(entry, msg.chunks);
    onProgress?.(peerId, msg.transferId, progressPct(entry));
    return true;
  }

  if (type === 'file-chunk') {
    const key = transferKey(peerId, msg.transferId);
    const entry = incoming.get(key);
    if (!entry) return true;
    if (entry.disk) {
      void writeDiskChunks(entry, [{ index: msg.index, data: msg.data }])
        .then(() => onProgress?.(peerId, msg.transferId, progressPct(entry)))
        .catch(() => {});
      return true;
    }
    applyIncomingChunks(entry, [{ index: msg.index, data: msg.data }]);
    onProgress?.(peerId, msg.transferId, progressPct(entry));
    return true;
  }

  if (type === 'file-abort') {
    const key = transferKey(peerId, msg.transferId);
    const entry = incoming.get(key);
    incoming.delete(key);
    if (entry?.disk) void window.blip?.receiveFileAbort?.({ transferId: msg.transferId });
    onAbort?.(peerId, msg.transferId);
    return true;
  }

  if (type === 'file-done') {
    const key = transferKey(peerId, msg.transferId);
    const entry = incoming.get(key);
    if (!entry) return true;
    if (entry.disk) {
      void (async () => {
        try {
          await ensureDiskSink(entry);
          if (entry.received !== entry.meta.chunkCount) {
            throw new Error('incomplete');
          }
          const res = await window.blip.receiveFileFinish({ transferId: msg.transferId });
          incoming.delete(key);
          if (!res?.ok || !res.filePath) throw new Error(res?.error || 'finish_failed');
          const attachment = {
            kind: inferAttachmentKind(entry.meta.mime, entry.meta.name),
            name: entry.meta.name,
            mime: entry.meta.mime,
            size: entry.meta.size,
            filePath: res.filePath,
            chunked: true,
            transferId: msg.transferId,
          };
          onComplete?.(peerId, {
            transferId: msg.transferId,
            attachment,
            name: attachment.name,
            groupId: entry.meta.groupId || '',
            msgId: entry.meta.msgId || '',
          });
          onProgress?.(peerId, msg.transferId, 100);
        } catch {
          incoming.delete(key);
          void window.blip?.receiveFileAbort?.({ transferId: msg.transferId });
          onAbort?.(peerId, msg.transferId);
        }
      })();
      return true;
    }
    if (countFilledChunks(entry) !== entry.meta.chunkCount) {
      incoming.delete(key);
      onAbort?.(peerId, msg.transferId);
      return true;
    }
    incoming.delete(key);
    let attachment;
    try {
      attachment = assembleIncoming(entry);
    } catch {
      onAbort?.(peerId, msg.transferId);
      return true;
    }
    onComplete?.(peerId, {
      transferId: msg.transferId,
      attachment,
      name: attachment.name,
      groupId: entry.meta.groupId || '',
      msgId: entry.meta.msgId || '',
    });
    onProgress?.(peerId, msg.transferId, 100);
    return true;
  }

  return false;
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  const gb = 1024 * 1024 * 1024;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < gb) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / gb).toFixed(2)} GB`;
}
