/**
 * File transfer IPC (extracted from main/index.js).
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain } from 'electron';
import { sendFileFromPathOnSocket } from '../file-tcp-send.js';

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

  ipcMain.handle('send-file-from-path', async (event, payload) => {
    const wc = event.sender;
    const config = getConfig();
    try {
      const to = Number(payload?.to);
      const filePath = String(payload?.filePath || '').trim();
      const transferId = String(payload?.transferId || '');
      if (!Number.isFinite(to) || !filePath || !transferId) {
        return { ok: false, error: 'invalid' };
      }
      const socket = await ensurePeerSocket(to);
      await sendFileFromPathOnSocket(socket, config.blipId, {
        filePath,
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
