/**
 * File transfer IPC (extracted from main/index.js).
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain, app } from 'electron';
import path from 'path';
import { join } from 'path';
import { sendFileFromPathOnSocket } from '../file-tcp-send.js';
import { createFileReceiveStore } from '../file-receive-store.js';

const receiveStore = createFileReceiveStore({
  getIncomingDir: () => join(app.getPath('userData'), 'incoming'),
});

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {(peerId: number) => Promise<import('net').Socket>} deps.ensurePeerSocket
 * @param {(info: object|null) => void} [deps.setTrayTransferProgress]
 */
export function registerFileIpc(deps) {
  const { getConfig, ensurePeerSocket, setTrayTransferProgress } = deps;

  ipcMain.handle('set-tray-transfer-progress', (_, info) => {
    setTrayTransferProgress?.(info);
    return { ok: true };
  });

  ipcMain.handle('receive-file-begin', async (_, payload) => receiveStore.beginFileReceive(payload));
  ipcMain.handle('receive-file-chunk', async (_, payload) => receiveStore.writeFileReceiveChunk(payload));
  ipcMain.handle('receive-file-chunks-batch', async (_, payload) =>
    receiveStore.writeFileReceiveChunksBatch(payload)
  );
  ipcMain.handle('receive-file-finish', async (_, payload) => receiveStore.finishFileReceive(payload));
  ipcMain.handle('receive-file-abort', async (_, payload) =>
    receiveStore.abortFileReceive(payload?.transferId)
  );

  ipcMain.handle('send-file-from-path', async (event, payload) => {
    const wc = event.sender;
    const config = getConfig();
    try {
      const to = Number(payload?.to);
      const filePath = String(payload?.filePath || '').trim();
      const transferId = String(payload?.transferId || '');
      if (!Number.isFinite(to) || !filePath || !transferId || filePath.includes('\0')) {
        return { ok: false, error: 'invalid' };
      }
      const resolved = path.resolve(filePath);
      if (!path.isAbsolute(resolved)) return { ok: false, error: 'invalid' };
      const socket = await ensurePeerSocket(to);
      await sendFileFromPathOnSocket(socket, config.blipId, {
        filePath: resolved,
        to,
        transferId,
        name: payload.name,
        mime: payload.mime,
        size: payload.size,
        groupId: payload.groupId,
        msgId: payload.msgId,
        onProgress: (p) => {
          try {
            wc.send('file-send-progress', { transferId, to, ...p });
          } catch {

          }
        },
      });
      return { ok: true };
    } catch (err) {
      const msg = err?.message || 'send_failed';
      return { ok: false, error: msg };
    }
  });
}
