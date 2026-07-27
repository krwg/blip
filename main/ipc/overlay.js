/**
 * Overlay / presence IPC (extracted from main/index.js).
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain } from 'electron';
import { pushOverlayUpdate, setOverlayInteractive } from '../overlay-window.js';
import { detectForegroundApp } from '../presence-detect.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {() => number} deps.getLastOverlayUnread
 * @param {(n: number) => void} deps.setLastOverlayUnread
 * @param {() => number} deps.getPeersOnline
 * @param {() => import('electron').BrowserWindow|null} [deps.getCallWindow]
 * @param {() => Promise<void>|void} [deps.hangupActiveCall]
 * @param {(muted: boolean) => void} [deps.setActiveCallMuted]
 * @param {(payload: object) => void} [deps.setActiveCallMedia]
 * @param {(held: boolean) => void} [deps.sendCallPttHeld]
 */
export function registerOverlayIpc(deps) {
  const {
    getConfig,
    getLastOverlayUnread,
    setLastOverlayUnread,
    getPeersOnline,
    getCallWindow,
    hangupActiveCall,
    setActiveCallMuted,
    setActiveCallMedia,
    sendCallPttHeld,
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

  ipcMain.handle('overlay-call-mute', async () => {
    const win = getCallWindow?.();
    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send('overlay-toggle-mute');
      } catch {
        /* ignore */
      }
    }
    return { ok: true };
  });

  ipcMain.handle('overlay-call-hangup', async () => {
    const win = getCallWindow?.();
    if (win && !win.isDestroyed()) {
      try {
        win.webContents.send('global-hangup');
      } catch {
        /* ignore */
      }
    } else if (hangupActiveCall) {
      await hangupActiveCall();
    }
    return { ok: true };
  });

  ipcMain.handle('call-report-local-state', (_, payload) => {
    if (typeof setActiveCallMuted === 'function' && payload?.muted != null) {
      setActiveCallMuted(!!payload.muted);
    }
    if (typeof setActiveCallMedia === 'function') {
      setActiveCallMedia(payload || {});
    }
    return { ok: true };
  });

  ipcMain.on('overlay-set-interactive', (_, interactive) => {
    setOverlayInteractive(!!interactive);
  });

  ipcMain.on('overlay-ptt-held', (_, held) => {
    if (typeof sendCallPttHeld === 'function') sendCallPttHeld(!!held);
  });
}
