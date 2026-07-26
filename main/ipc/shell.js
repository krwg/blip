/**
 * Shell / notifications / display capture IPC.
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain, shell } from 'electron';
import {
  listDisplaySources,
  setPendingDisplaySource,
} from '../display-capture.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {(payload: object) => object} deps.showDesktopNotification
 */
export function registerShellIpc(deps) {
  const { getConfig, showDesktopNotification } = deps;

  ipcMain.handle('show-message-notification', (_, payload) => {
    if (getConfig()?.doNotDisturb) return { ok: false, reason: 'dnd' };
    return showDesktopNotification(payload);
  });

  ipcMain.handle('list-display-sources', () => listDisplaySources());

  ipcMain.handle('prepare-display-capture', (_, sourceId) => {
    if (typeof sourceId !== 'string' || !sourceId) return { ok: false };
    setPendingDisplaySource(sourceId);
    return { ok: true };
  });

  ipcMain.handle('open-external', async (_, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('show-item-in-folder', async (_, filePath) => {
    if (typeof filePath !== 'string' || !filePath.trim()) return { ok: false };
    try {
      shell.showItemInFolder(filePath);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
}
