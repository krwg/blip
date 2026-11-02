/**
 * BEACON seed IPC (extracted from main/index.js).
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain, dialog } from 'electron';
import { readFileSync } from 'fs';
import {
  ensureBeaconSeedsRoot,
  getBeaconSeedsRoot,
  writeSeedMeta,
  readSeedMeta,
  writeSeedPreview,
  readSeedPreview,
  writeSeedChunk,
  readSeedChunk,
  readSeedChunksBatch,
  writeSeedChunksBatch,
  buildSeedHaveBitmap,
  chunkExists,
  countLocalChunks,
  listLocalSeedMetas,
  promptSaveAssembledSeed,
  deleteLocalSeed,
  localSeedExists,
} from '../beacon-store.js';
import {
  ingestPublishFromPath,
  tryReadImagePreviewB64,
} from '../beacon-ingest.js';
import { serveSeedChunksOnSocket } from '../beacon-tcp-serve.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {() => import('../discovery.js').Discovery|null} deps.getDiscovery
 * @param {(peerId: number) => Promise<import('net').Socket>} deps.ensurePeerSocket
 */
export function registerBeaconIpc(deps) {
  const { getConfig, getDiscovery, ensurePeerSocket } = deps;

  ipcMain.handle('beacon-paths', async () => {
    await ensureBeaconSeedsRoot();
    return { seedsDir: getBeaconSeedsRoot() };
  });

  ipcMain.handle('beacon-udp-send', (_, payload) => {
    if (!payload || typeof payload !== 'object') return false;
    getDiscovery()?.broadcastPacket?.(payload);
    return true;
  });

  ipcMain.handle('beacon-pick-publish-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'BEACON — publish file',
    });
    if (canceled || !filePaths?.[0]) {
      return { ok: false, cancelled: true };
    }
    return { ok: true, filePath: filePaths[0] };
  });

  ipcMain.handle('beacon-publish-from-path', async (event, { filePath, maxBytes, chunkSize }) => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return { ok: false, error: 'no_path' };
    }
    const wc = event.sender;
    try {
      const meta = await ingestPublishFromPath(filePath.trim(), {
        maxBytes: Number(maxBytes) || undefined,
        chunkSize: Number(chunkSize) || 1048576,
        onProgress: (p) => {
          try {
            wc.send('beacon-ingest-progress', p);
          } catch {

          }
        },
      });
      const previewB64 = await tryReadImagePreviewB64(filePath.trim());
      if (previewB64) {
        meta.previewB64 = previewB64.length > 14000 ? previewB64.slice(0, 14000) : previewB64;
        await writeSeedPreview(meta.seedId, meta.previewB64);
      }
      return { ok: true, meta };
    } catch (e) {
      const msg = e?.message || String(e);
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('beacon-write-meta', async (_, { seedId, meta }) => {
    if (!seedId || !meta) return { ok: false };
    await writeSeedMeta(seedId, meta);
    return { ok: true };
  });

  ipcMain.handle('beacon-read-meta', async (_, { seedId }) => {
    if (!seedId) return null;
    return readSeedMeta(seedId);
  });

  ipcMain.handle('beacon-read-preview', async (_, { seedId }) => {
    if (!seedId) return { ok: false };
    const data = await readSeedPreview(seedId);
    return data ? { ok: true, data } : { ok: false };
  });

  ipcMain.handle('beacon-write-preview', async (_, { seedId, data }) => {
    if (!seedId || !data) return { ok: false };
    await writeSeedPreview(seedId, data);
    return { ok: true };
  });

  ipcMain.handle('beacon-write-chunk', async (_, { seedId, chunkIndex, data }) => {
    if (!seedId || chunkIndex == null || !data) return { ok: false };
    await writeSeedChunk(seedId, Number(chunkIndex), data);
    return { ok: true };
  });

  ipcMain.handle('beacon-write-chunks-batch', async (_, { seedId, chunks }) => {
    if (!seedId || !Array.isArray(chunks) || !chunks.length) return { ok: false };
    await writeSeedChunksBatch(seedId, chunks);
    return { ok: true, count: chunks.length };
  });

  ipcMain.handle('beacon-read-chunk', async (_, { seedId, chunkIndex }) => {
    if (!seedId || chunkIndex == null) return { ok: false };
    try {
      const data = await readSeedChunk(seedId, Number(chunkIndex));
      return { ok: true, data };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('beacon-read-chunks-batch', async (_, { seedId, chunkIndices }) => {
    if (!seedId || !Array.isArray(chunkIndices)) return { ok: false, chunks: [] };
    const chunks = await readSeedChunksBatch(seedId, chunkIndices.map(Number));
    return { ok: true, chunks };
  });

  ipcMain.handle('beacon-serve-chunks-tcp', async (_, payload) => {
    try {
      const config = getConfig();
      const to = Number(payload?.to);
      const seedId = String(payload?.seedId || '');
      const chunkIndices = Array.isArray(payload?.chunkIndices) ? payload.chunkIndices : [];
      if (!Number.isFinite(to) || !seedId || !chunkIndices.length) {
        return { ok: false, error: 'invalid' };
      }
      const socket = await ensurePeerSocket(to);
      return await serveSeedChunksOnSocket(socket, config.blipId, {
        to,
        seedId,
        chunkIndices,
      });
    } catch (err) {
      return { ok: false, error: err?.message || 'serve_failed' };
    }
  });

  ipcMain.handle('beacon-have-bitmap', async (_, { seedId, totalChunks }) => {
    if (!seedId) return { ok: false, bitmap: '' };
    const bitmap = await buildSeedHaveBitmap(seedId, Number(totalChunks) || 0);
    return { ok: true, bitmap };
  });

  ipcMain.handle('beacon-chunk-exists', async (_, { seedId, chunkIndex }) => {
    if (!seedId || chunkIndex == null) return false;
    return chunkExists(seedId, Number(chunkIndex));
  });

  ipcMain.handle('beacon-count-chunks', async (_, { seedId, totalChunks }) => {
    if (!seedId) return 0;
    return countLocalChunks(seedId, Number(totalChunks) || 0);
  });

  ipcMain.handle('beacon-list-local', async () => listLocalSeedMetas());

  ipcMain.handle('beacon-save-assembled', async (_, { seedId, defaultName }) => {
    try {
      return await promptSaveAssembledSeed(seedId, defaultName);
    } catch (err) {
      return { ok: false, error: err?.message || 'save_failed' };
    }
  });

  ipcMain.handle('beacon-delete-seed', async (_, { seedId }) => {
    if (!seedId) return { ok: false };
    try {
      if (await localSeedExists(seedId)) await deleteLocalSeed(seedId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'delete_failed' };
    }
  });

  ipcMain.handle('beacon-seed-exists', async (_, { seedId }) => {
    if (!seedId) return { exists: false };
    return { exists: await localSeedExists(seedId) };
  });

  ipcMain.handle('beacon-read-blip-file', async (_, { filePath }) => {
    if (!filePath || typeof filePath !== 'string') return { ok: false };
    try {
      const raw = readFileSync(filePath, 'utf8');
      return { ok: true, text: raw };
    } catch (err) {
      return { ok: false, error: err?.message || 'read_failed' };
    }
  });
}
