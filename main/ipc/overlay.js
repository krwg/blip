/**
 * Overlay / presence IPC (extracted from main/index.js).
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain } from 'electron';
import { pushOverlayUpdate } from '../overlay-window.js';
import { detectForegroundApp } from '../presence-detect.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {() => number} deps.getLastOverlayUnread
 * @param {(n: number) => void} deps.setLastOverlayUnread
 * @param {() => number} deps.getPeersOnline
 */
export function registerOverlayIpc(deps) {
  const {
    getConfig,
    getLastOverlayUnread,
    setLastOverlayUnread,
    getPeersOnline,
  } = deps;

  ipcMain.handle('get-foreground-presence', async () => detectForegroundApp());

  ipcMain.handle('overlay-push-stats', (_, stats) => {
    const unread = Math.max(0, Number(stats?.unread) || 0);
    setLastOverlayUnread(unread);
    pushOverlayUpdate({
      activity: getConfig()?.presenceText || '',
      unread,
      peersOnline: getPeersOnline(),
      idleLabel: 'BLIP',
    });
    return true;
  });

  ipcMain.on('overlay-ready', () => {
    const config = getConfig();
    if (config?.overlayEnabled) {
      pushOverlayUpdate({
        activity: config?.presenceText || '',
        unread: getLastOverlayUnread(),
        peersOnline: getPeersOnline(),
        idleLabel: 'BLIP',
      });
    }
  });
}
