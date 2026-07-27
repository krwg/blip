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
let lastPayloadFingerprint = '';
let presenceTick = 0;

const ACCENT_HEX = {
  mint: '#00ffc8',
  cyan: '#22d3ee',
  teal: '#14b8a6',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#a78bfa',
  purple: '#c084fc',
  pink: '#f472b6',
  rose: '#fb7185',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  lime: '#84cc16',
  green: '#22c55e',
  slate: '#94a3b8',
  gold: '#eab308',
};

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

function syncOverlayPointer(interactive) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try {
    if (interactive) {
      overlayWindow.setIgnoreMouseEvents(false);
      overlayWindow.setFocusable(true);
    } else {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      overlayWindow.setFocusable(false);
    }
  } catch {
    /* ignore */
  }
}

export function createOverlayWindow({ rootDir, useViteDev, preloadPath, icon }) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }
  const display = screen.getPrimaryDisplay();
  const work = display.workArea;
  const width = 360;
  const height = 380;
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
  syncOverlayPointer(false);

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
    lastPayloadFingerprint = '';
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
  syncOverlayPointer(!!lastPayload.callActive);
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayShown) return;
  try {
    overlayWindow.webContents.send('overlay-update', lastPayload);
  } catch {

  }
}

function fingerprintOverlayPayload(payload) {
  if (!payload) return '';
  const { now, ...rest } = payload;
  return JSON.stringify(rest);
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

function resolveAccentHex(cfg) {
  const custom = String(cfg?.accentCustomHex || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(custom)) return custom.toLowerCase();
  const id = String(cfg?.accentId || 'mint');
  return ACCENT_HEX[id] || ACCENT_HEX.mint;
}

export function startPresenceLoop({
  getConfig,
  patchConfig,
  getPeersOnline,
  getUnreadTotal,
  getCallInfo,
  getTransferInfo,
  setCallPing,
  getCallPingAt,
  onOverlayPayload,
}) {
  stopPresenceLoop();
  const tick = async () => {
    const cfg = getConfig?.() || {};
    if (!cfg.presenceDetectEnabled && !cfg.overlayEnabled) return;
    presenceTick += 1;

    let activity = null;
    // Foreground detect is expensive (PowerShell/osascript) — only when sharing
    // status or the overlay HUD is actually visible. Throttle when only sharing.
    const needDetect =
      !!cfg.presenceDetectEnabled &&
      (!!cfg.presenceShareEnabled || overlayShown);
    const detectEvery = overlayShown ? 1 : 3;
    if (needDetect && presenceTick % detectEvery === 0) {
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

    // Nothing to push if overlay is hidden and we are not sharing activity.
    if (!overlayShown && !cfg.presenceShareEnabled) return;

    const call = getCallInfo?.() || null;
    if (!call?.active) {
      setCallPing?.(null);
    }
    const callFresh = getCallInfo?.() || call;

    const transfer = getTransferInfo?.() || null;
    const presence = cfg.doNotDisturb
      ? 'busy'
      : cfg.presenceStatus === 'away' || cfg.presenceStatus === 'busy'
        ? cfg.presenceStatus
        : 'online';
    const uiSkin = cfg.uiSkin === 'nest' ? 'nest' : 'pixel';
    const themeMode = cfg.themeMode === 'light' ? 'light' : 'dark';
    const payload = {
      activityKind: activity?.kind || lastPayload?.activityKind || '',
      activityLabel: activity?.label || lastPayload?.activityLabel || '',
      activityApp: activity?.app || lastPayload?.activityApp || '',
      activityTitle: activity?.title || lastPayload?.activityTitle || '',
      activityElapsed: activity?.elapsedLabel || lastPayload?.activityElapsed || '',
      statusLine:
        activity?.statusLine || cfg.presenceText || lastPayload?.statusLine || '',
      unread: getUnreadTotal?.() || 0,
      peersOnline: getPeersOnline?.() || 0,
      selfName: cfg.displayName || `BLIP-${cfg.blipId || '?'}`,
      selfBlipId: cfg.blipId ?? null,
      presence,
      doNotDisturb: !!cfg.doNotDisturb,
      uiSkin,
      theme: themeMode,
      accentId: cfg.accentId || 'mint',
      accentHex: resolveAccentHex(cfg),
      language: cfg.language === 'ru' ? 'ru' : 'en',
      callActive: !!callFresh?.active,
      callPeerName: callFresh?.peerName || '',
      callPeerId: callFresh?.peerId || null,
      callElapsed: callFresh?.active ? formatCallElapsed(callFresh.startedAt) : '',
      callVideo: !!callFresh?.video,
      callMuted: !!callFresh?.muted,
      callPingMs: callFresh?.pingMs ?? null,
      callEncrypted: !!callFresh?.encrypted,
      callLegacy: !!callFresh?.legacy,
      callPeerPresence: callFresh?.presence || '',
      transferLabel: transfer?.label || '',
      transferPercent: transfer?.percent || 0,
      now: Date.now(),
    };

    if (cfg.presenceShareEnabled) onOverlayPayload?.(payload);

    if (overlayShown) {
      const fp = fingerprintOverlayPayload(payload);
      if (fp === lastPayloadFingerprint) return;
      lastPayloadFingerprint = fp;
      pushOverlayUpdate(payload);
    } else {
      lastPayload = payload;
    }
  };

  void tick();
  presenceTimer = setInterval(() => void tick(), 2000);
}

export function stopPresenceLoop() {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
  presenceTick = 0;
  lastPayloadFingerprint = '';
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
