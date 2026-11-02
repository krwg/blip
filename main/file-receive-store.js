/**
 * Disk-backed inbound file assembly (chunked transfers).
 * Writes base64 chunks at fixed offsets under a caller-provided incoming dir.
 */

import { mkdir, open, unlink, rename } from 'fs/promises';
import { join } from 'path';

export const FILE_RECEIVE_CHUNK_BYTES = 1024 * 1024;

/**
 * @param {{ getIncomingDir: () => string }} deps
 */
export function createFileReceiveStore(deps) {
  /** @type {Map<string, { path: string, size: number, chunkCount: number, chunkBytes: number, received: number, seen: Set<number>, name: string, mime: string, handle: import('fs/promises').FileHandle | null }>} */
  const sinks = new Map();

  function safeTransferId(id) {
    return String(id || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  }

  async function beginFileReceive(opts) {
    const transferId = safeTransferId(opts?.transferId);
    const size = Number(opts?.size) || 0;
    const chunkCount = Number(opts?.chunkCount) || 0;
    const chunkBytes = Number(opts?.chunkBytes) || FILE_RECEIVE_CHUNK_BYTES;
    if (!transferId || size <= 0 || chunkCount <= 0) {
      return { ok: false, error: 'invalid' };
    }
    await abortFileReceive(transferId);
    const dir = deps.getIncomingDir();
    await mkdir(dir, { recursive: true });
    const partPath = join(dir, `${transferId}.part`);
    const handle = await open(partPath, 'w');
    try {
      if (size > 0) await handle.truncate(size);
    } catch {
      /* sparse truncate optional */
    }
    sinks.set(transferId, {
      path: partPath,
      size,
      chunkCount,
      chunkBytes,
      received: 0,
      seen: new Set(),
      name: String(opts?.name || 'file').slice(0, 200),
      mime: String(opts?.mime || 'application/octet-stream').slice(0, 120),
      handle,
    });
    return { ok: true, transferId };
  }

  async function writeFileReceiveChunk(opts) {
    const transferId = safeTransferId(opts?.transferId);
    const sink = sinks.get(transferId);
    if (!sink?.handle) return { ok: false, error: 'missing' };
    const index = Number(opts?.index);
    if (!Number.isFinite(index) || index < 0 || index >= sink.chunkCount) {
      return { ok: false, error: 'bad_index' };
    }
    if (sink.seen.has(index)) return { ok: true, received: sink.received, duplicate: true };
    const raw = Buffer.from(String(opts?.data || ''), 'base64');
    const offset = index * sink.chunkBytes;
    await sink.handle.write(raw, 0, raw.length, offset);
    sink.seen.add(index);
    sink.received += 1;
    return { ok: true, received: sink.received };
  }

  async function writeFileReceiveChunksBatch(opts) {
    const chunks = Array.isArray(opts?.chunks) ? opts.chunks : [];
    let received = 0;
    for (const part of chunks) {
      const res = await writeFileReceiveChunk({
        transferId: opts?.transferId,
        index: part?.index,
        data: part?.data,
      });
      if (res.ok) received = res.received;
    }
    return { ok: true, received };
  }

  async function finishFileReceive(opts) {
    const transferId = safeTransferId(opts?.transferId);
    const sink = sinks.get(transferId);
    if (!sink) return { ok: false, error: 'missing' };
    if (sink.received !== sink.chunkCount || sink.seen.size !== sink.chunkCount) {
      await abortFileReceive(transferId);
      return { ok: false, error: 'incomplete' };
    }
    try {
      await sink.handle?.close();
    } catch {

    }
    sink.handle = null;
    const safeName = sink.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
    const finalPath = join(deps.getIncomingDir(), `${transferId}-${Date.now()}-${safeName}`);
    await rename(sink.path, finalPath);
    sinks.delete(transferId);
    return {
      ok: true,
      filePath: finalPath,
      name: sink.name,
      mime: sink.mime,
      size: sink.size,
    };
  }

  async function abortFileReceive(transferIdRaw) {
    const transferId = safeTransferId(transferIdRaw);
    const sink = sinks.get(transferId);
    if (!sink) return { ok: true };
    sinks.delete(transferId);
    try {
      await sink.handle?.close();
    } catch {

    }
    try {
      await unlink(sink.path);
    } catch {

    }
    return { ok: true };
  }

  return {
    beginFileReceive,
    writeFileReceiveChunk,
    writeFileReceiveChunksBatch,
    finishFileReceive,
    abortFileReceive,
  };
}
