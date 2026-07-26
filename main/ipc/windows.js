/**
 * Group-call window IPC + window chrome controls.
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain } from 'electron';

/**
 * @param {object} deps
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow
 * @param {() => import('electron').BrowserWindow|null} deps.getCallWindow
 * @param {() => import('electron').BrowserWindow|null} deps.getGroupCallWindow
 * @param {(groupId: string) => Promise<object|null>} deps.readGroupFromMainWindow
 * @param {(channel: string, data: object, opts?: object) => Promise<void>} deps.sendToGroupCallWindow
 * @param {() => void} deps.flushCallWindowQueue
 * @param {() => void} deps.flushGroupCallWindowQueue
 * @param {(ready: boolean) => void} deps.setCallWindowReady
 * @param {(ready: boolean) => void} deps.setGroupCallWindowReady
 * @param {() => boolean} deps.isVoiceCallActive
 */
export function registerWindowIpc(deps) {
  const {
    getMainWindow,
    getCallWindow,
    getGroupCallWindow,
    readGroupFromMainWindow,
    sendToGroupCallWindow,
    flushCallWindowQueue,
    flushGroupCallWindowQueue,
    setCallWindowReady,
    setGroupCallWindowReady,
    isVoiceCallActive,
  } = deps;

  ipcMain.handle('is-voice-call-active', () => isVoiceCallActive());

  ipcMain.handle('get-group-for-call', async (_, groupId) => readGroupFromMainWindow(groupId));

  ipcMain.handle('open-group-call', async (_, payload) => {
    try {
      await sendToGroupCallWindow(
        'group-call-join',
        { groupId: payload?.groupId, skipInvite: !!payload?.skipInvite },
        { focus: true }
      );
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('open-group-call-incoming', async (_, payload) => {
    await sendToGroupCallWindow('group-call-incoming', payload || {}, { focus: true });
    return { ok: true };
  });

  ipcMain.handle('leave-group-call', async () => {
    await sendToGroupCallWindow('group-call-leave', {}, { focus: false });
    return { ok: true };
  });

  ipcMain.handle('close-group-call-window', () => {
    const groupCallWindow = getGroupCallWindow();
    if (groupCallWindow && !groupCallWindow.isDestroyed()) {
      groupCallWindow.hide();
    }
    return true;
  });

  ipcMain.on('group-call-active', (_, data) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('group-call-active', data);
    }
  });

  ipcMain.on('sync-group-call-roster', (_, data) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('group-call-roster-sync', data);
    }
  });

  ipcMain.on('call-window-ready', () => {
    setCallWindowReady(true);
    flushCallWindowQueue();
  });

  ipcMain.on('group-call-window-ready', () => {
    setGroupCallWindowReady(true);
    flushGroupCallWindowQueue();
  });

  ipcMain.on('window-minimize', () => getMainWindow()?.minimize());
  ipcMain.on('window-maximize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.on('window-close', () => getMainWindow()?.close());

  ipcMain.on('call-window-minimize', () => getCallWindow()?.minimize());
  ipcMain.on('call-window-maximize', () => {
    const callWindow = getCallWindow();
    if (!callWindow || callWindow.isDestroyed()) return;
    if (callWindow.isMaximized()) callWindow.unmaximize();
    else callWindow.maximize();
  });
  ipcMain.on('call-window-close', () => {
    const callWindow = getCallWindow();
    if (callWindow && !callWindow.isDestroyed()) callWindow.hide();
  });

  ipcMain.on('group-call-window-minimize', () => getGroupCallWindow()?.minimize());
  ipcMain.on('group-call-window-maximize', () => {
    const groupCallWindow = getGroupCallWindow();
    if (!groupCallWindow || groupCallWindow.isDestroyed()) return;
    if (groupCallWindow.isMaximized()) groupCallWindow.unmaximize();
    else groupCallWindow.maximize();
  });
  ipcMain.on('group-call-window-close', () => {
    void sendToGroupCallWindow('group-call-leave', {}, { focus: false });
    const groupCallWindow = getGroupCallWindow();
    if (groupCallWindow && !groupCallWindow.isDestroyed()) groupCallWindow.hide();
  });
}
