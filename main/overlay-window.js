import { BrowserWindow, screen, app } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  detectForegroundApp,
  classifyActivity,
} from './presence-detect.js';

let overlayWindow = null;
let presenceTimer = null;
let lastSharedText = '';
/** Runtime visibility — hotkey toggles; settings only enable the feature. */
let overlayShown = false;
let lastPayload = null;

export function getOverlayWindow() {
  return overlayWindow;
}

export function isOverlayShown() {
  return overlayShown;
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
  const width = 420;
  const height = 420;
  overlayWindow = new BrowserWindow({
    width,
    height,
    x: work.x + work.width - width - 20,
    y: work.y + 20,
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
    focusable: false,
    backgroundColor: '#00000000',
    icon,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  try {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  } catch {

  }

  const url = resolveOverlayUrl(rootDir, useViteDev);
  if (url.startsWith('http')) overlayWindow.loadURL(url);
  else overlayWindow.loadFile(url);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayShown = false;
  });
  return overlayWindow;
}

export function destroyOverlayWindow({ keepLoop = false } = {}) {
  if (!keepLoop) stopPresenceLoop();
  overlayShown = false;
  lastPayload = null;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try {
      overlayWindow.destroy();
    } catch {

    }
  }
  overlayWindow = null;
}

export function setOverlayVisible(show, deps) {
  overlayShown = !!show;
  if (!show) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
    return;
  }
  const win = createOverlayWindow(deps);
  if (!win.isDestroyed()) {
    win.showInactive();
    if (lastPayload) pushOverlayUpdate(lastPayload);
  }
}

export function toggleOverlayVisible(deps) {
  const cfg = deps?.getConfig?.() || {};
  if (!cfg.overlayEnabled) return false;
  setOverlayVisible(!overlayShown, deps.windowDeps || deps);
  return overlayShown;
}

export function pushOverlayUpdate(payload) {
  lastPayload = payload || {};
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayShown) return;
  try {
    overlayWindow.webContents.send('overlay-update', lastPayload);
  } catch {

  }
}

function formatCallElapsed(startedAt) {
  if (!startedAt) return '';
  const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function startPresenceLoop({
  getConfig,
  patchConfig,
  getPeersOnline,
  getUnreadTotal,
  getCallInfo,
  getTransferInfo,
  onOverlayPayload,
}) {
  stopPresenceLoop();
  const tick = async () => {
    const cfg = getConfig?.() || {};
    if (!cfg.presenceDetectEnabled && !cfg.overlayEnabled) return;

    let activity = null;
    if (cfg.presenceDetectEnabled) {
      const snap = await detectForegroundApp();
      activity = classifyActivity(snap, {
        preferGames: cfg.presencePreferGames !== false,
        pinnedApp: cfg.presencePinnedApp || '',
      });
      const line = activity?.statusLine || '';
      if (cfg.presenceShareEnabled && line && line !== lastSharedText) {
        lastSharedText = line;
        patchConfig?.({ presenceText: line.slice(0, 48) });
      }
    }

    const call = getCallInfo?.() || null;
    const transfer = getTransferInfo?.() || null;
    const presence = cfg.doNotDisturb
      ? 'busy'
      : cfg.presenceStatus === 'away' || cfg.presenceStatus === 'busy'
        ? cfg.presenceStatus
        : 'online';
    const payload = {
      activityKind: activity?.kind || '',
      activityLabel: activity?.label || '',
      activityApp: activity?.app || '',
      activityTitle: activity?.title || '',
      activityElapsed: activity?.elapsedLabel || '',
      statusLine: activity?.statusLine || cfg.presenceText || '',
      unread: getUnreadTotal?.() || 0,
      peersOnline: getPeersOnline?.() || 0,
      selfName: cfg.displayName || `BLIP-${cfg.blipId || '?'}`,
      selfBlipId: cfg.blipId ?? null,
      presence,
      doNotDisturb: !!cfg.doNotDisturb,
      appVersion: String(app.getVersion() || '').replace(/^v/, ''),
      callActive: !!call?.active,
      callPeerName: call?.peerName || '',
      callPeerId: call?.peerId || null,
      callElapsed: call?.active ? formatCallElapsed(call.startedAt) : '',
      callVideo: !!call?.video,
      callEncrypted: !!call?.encrypted,
      callLegacy: !!call?.legacy,
      callPeerPresence: call?.presence || '',
      transferLabel: transfer?.label || '',
      transferPercent: transfer?.percent || 0,
      now: Date.now(),
    };
    onOverlayPayload?.(payload);
    pushOverlayUpdate(payload);
  };

  void tick();
  presenceTimer = setInterval(() => void tick(), 2000);
}

export function stopPresenceLoop() {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
}

/**
 * When overlay feature is enabled: keep window ready (hidden) + presence loop.
 * Do NOT auto-show — user toggles with Shift+Alt+O.
 */
export function refreshPresenceLoop(deps) {
  const cfg = deps.getConfig?.() || {};
  if (cfg.overlayEnabled || cfg.presenceDetectEnabled) {
    startPresenceLoop(deps);
    if (cfg.overlayEnabled) {
      createOverlayWindow(deps.windowDeps);
      if (overlayShown) setOverlayVisible(true, deps.windowDeps);
      else setOverlayVisible(false, deps.windowDeps);
    } else {
      overlayShown = false;
      destroyOverlayWindow({ keepLoop: true });
    }
  } else {
    stopPresenceLoop();
    overlayShown = false;
    lastSharedText = '';
    destroyOverlayWindow();
  }
}
