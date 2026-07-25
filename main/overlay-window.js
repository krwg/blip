import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  detectForegroundApp,
  formatPresenceActivity,
} from './presence-detect.js';

let overlayWindow = null;
let presenceTimer = null;
let lastSharedText = '';

export function getOverlayWindow() {
  return overlayWindow;
}

function resolveOverlayUrl(rootDir, useViteDev) {
  if (useViteDev) return 'http://localhost:5173/overlay.html';
  const p = join(rootDir, 'dist/overlay.html');
  if (existsSync(p)) return p;
  return 'http://localhost:5173/overlay.html';
}

export function createOverlayWindow({ rootDir, useViteDev, preloadPath, icon }) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  const width = 280;
  const height = 120;
  overlayWindow = new BrowserWindow({
    width,
    height,
    x: work.x + work.width - width - 16,
    y: work.y + 16,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    icon,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const url = resolveOverlayUrl(rootDir, useViteDev);
  if (url.startsWith('http')) overlayWindow.loadURL(url);
  else overlayWindow.loadFile(url);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
  return overlayWindow;
}

export function destroyOverlayWindow() {
  stopPresenceLoop();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.destroy();
    } catch {

    }
  }
  overlayWindow = null;
}

export function setOverlayVisible(show, deps) {
  if (!show) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
    return;
  }
  const win = createOverlayWindow(deps);
  if (!win.isDestroyed()) {
    win.showInactive();
  }
}

export function pushOverlayUpdate(payload) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try {
    overlayWindow.webContents.send('overlay-update', payload || {});
  } catch {

  }
}

export function startPresenceLoop({
  getConfig,
  patchConfig,
  getPeersOnline,
  getUnreadTotal,
  onOverlayPayload,
}) {
  stopPresenceLoop();
  const tick = async () => {
    const cfg = getConfig?.() || {};
    if (!cfg.presenceDetectEnabled && !cfg.overlayEnabled) return;

    let activity = '';
    if (cfg.presenceDetectEnabled) {
      const snap = await detectForegroundApp();
      activity = formatPresenceActivity(snap) || '';
      if (cfg.presenceShareEnabled && activity && activity !== lastSharedText) {
        lastSharedText = activity;
        patchConfig?.({ presenceText: activity.slice(0, 48) });
      }
    }

    const payload = {
      activity: activity || (cfg.presenceText || ''),
      unread: getUnreadTotal?.() || 0,
      peersOnline: getPeersOnline?.() || 0,
      idleLabel: 'BLIP',
    };
    onOverlayPayload?.(payload);
    if (cfg.overlayEnabled) pushOverlayUpdate(payload);
  };

  void tick();
  presenceTimer = setInterval(() => void tick(), 4000);
}

export function stopPresenceLoop() {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
}

export function refreshPresenceLoop(deps) {
  const cfg = deps.getConfig?.() || {};
  if (cfg.overlayEnabled || cfg.presenceDetectEnabled) {
    startPresenceLoop(deps);
    if (cfg.overlayEnabled) {
      setOverlayVisible(true, deps.windowDeps);
    } else {
      setOverlayVisible(false, deps.windowDeps);
    }
  } else {
    stopPresenceLoop();
    setOverlayVisible(false, deps.windowDeps);
    lastSharedText = '';
  }
}
