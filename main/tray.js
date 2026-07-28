import { Tray, Menu, nativeImage } from 'electron';
import { existsSync } from 'fs';
import { resolveBuildAsset } from './paths.js';

let tray = null;
let trayIconPath = null;
let baseTrayTooltip = 'BLIP';
let lastCallTrayKey = '';
let callTrayLabels = {
  live: 'In call',
  muted: 'In call · muted',
  ptt: 'In call · PTT',
  speaking: 'In call · mic live',
};

function createTrayIconFromPath(trayPath) {
  if (trayPath && existsSync(trayPath)) {
    return nativeImage.createFromPath(trayPath);
  }

  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const accent = (x + y) % 3 === 0;
      canvas[i] = accent ? 0 : 10;
      canvas[i + 1] = accent ? 255 : 10;
      canvas[i + 2] = accent ? 200 : 10;
      canvas[i + 3] = 255;
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

function createTrayIconFallback() {
  return createTrayIconFromPath(resolveBuildAsset('tray-16.png'));
}

function paintCallBadge(baseImage, mode) {
  try {
    const size = process.platform === 'darwin' ? 18 : 16;
    const img = baseImage?.isEmpty?.() ? createTrayIconFallback() : baseImage;
    const resized = img.resize({ width: size, height: size });
    const { buffer } = resized.toBitmap();
    const out = Buffer.from(buffer);
    // Electron toBitmap is BGRA on Windows.
    const put = (x, y, r, g, b, a = 255) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const i = (y * size + x) * 4;
      out[i] = b;
      out[i + 1] = g;
      out[i + 2] = r;
      out[i + 3] = a;
    };
    let r = 0;
    let g = 220;
    let b = 120;
    if (mode === 'muted') {
      r = 240;
      g = 80;
      b = 90;
    } else if (mode === 'ptt') {
      r = 250;
      g = 180;
      b = 40;
    } else if (mode === 'speaking') {
      r = 40;
      g = 255;
      b = 160;
    }
    for (let y = size - 7; y < size; y++) {
      for (let x = size - 7; x < size; x++) put(x, y, r, g, b);
    }
    return nativeImage.createFromBitmap(out, { width: size, height: size });
  } catch {
    return baseImage || createTrayIconFallback();
  }
}

export function setTrayCallLabels(labels) {
  if (!labels) return;
  callTrayLabels = { ...callTrayLabels, ...labels };
}

/**
 * Update tray badge/tooltip from call media reports.
 * @param {null|{ inCall?: boolean, muted?: boolean, localMicLevel?: number, pttHeld?: boolean, pushToTalkActive?: boolean }} state
 */
export function setTrayCallActivity(state) {
  if (!tray || tray.isDestroyed?.()) return;
  if (!state?.inCall) {
    if (lastCallTrayKey) {
      lastCallTrayKey = '';
      try {
        tray.setImage(createTrayIconFromPath(trayIconPath) || createTrayIconFallback());
        if (process.platform === 'darwin' && typeof tray.setTitle === 'function') {
          tray.setTitle('');
        }
        tray.setToolTip(baseTrayTooltip);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  const muted = !!state.muted;
  const ptt = !!state.pushToTalkActive && !!state.pttHeld;
  const speaking = !muted && (!state.pushToTalkActive || ptt) && Number(state.localMicLevel) > 0.08;
  const mode = muted ? 'muted' : speaking ? 'speaking' : ptt ? 'ptt' : 'live';
  const tip =
    mode === 'muted'
      ? callTrayLabels.muted
      : mode === 'speaking'
        ? callTrayLabels.speaking
        : mode === 'ptt'
          ? callTrayLabels.ptt
          : callTrayLabels.live;
  const key = `${mode}|${tip}`;
  if (key === lastCallTrayKey) return;
  lastCallTrayKey = key;
  try {
    const base = createTrayIconFromPath(trayIconPath) || createTrayIconFallback();
    tray.setImage(paintCallBadge(base, mode));
    if (process.platform === 'darwin' && typeof tray.setTitle === 'function') {
      tray.setTitle(mode === 'muted' ? '◼' : mode === 'speaking' ? '●' : mode === 'ptt' ? '◉' : '◎');
    }
    tray.setToolTip(`${baseTrayTooltip} — ${tip}`);
  } catch {
    /* ignore */
  }
}

export function setTrayBaseTooltip(tooltip) {
  baseTrayTooltip = tooltip || 'BLIP';
  if (tray && !tray.isDestroyed?.() && !lastCallTrayKey) {
    tray.setToolTip(baseTrayTooltip);
  }
}

export function setTrayTransferProgress(info) {
  if (!tray || tray.isDestroyed?.()) return;
  const pct = Math.round(Number(info?.percent) || 0);
  if (info && pct > 0 && pct < 100) {
    const label = String(info.label || 'Transfer').trim();
    tray.setToolTip(`${baseTrayTooltip} — ${label} ${pct}%`);
  } else if (!lastCallTrayKey) {
    tray.setToolTip(baseTrayTooltip);
  }
}

export function destroyTray() {
  if (!tray) return;
  try {
    tray.removeAllListeners();
    tray.destroy();
  } catch {
    /* ignore */
  }
  tray = null;
  lastCallTrayKey = '';
}

export function setTrayIconPath(path) {
  trayIconPath = path || null;
  if (tray && !tray.isDestroyed?.()) {
    try {
      const base = createTrayIconFromPath(trayIconPath) || createTrayIconFallback();
      tray.setImage(lastCallTrayKey ? paintCallBadge(base, lastCallTrayKey.split('|')[0]) : base);
    } catch {
      /* ignore */
    }
  }
}

export function createTray(opts) {
  destroyTray();
  const { getMainWindow, tooltip, onQuit, labels, iconPath } = opts;
  trayIconPath = iconPath || trayIconPath || resolveBuildAsset('tray-16.png');
  const L = { show: labels?.show || 'Show', quit: labels?.quit || 'Quit' };
  try {
    tray = new Tray(createTrayIconFromPath(trayIconPath) || createTrayIconFallback());
    baseTrayTooltip = tooltip || 'BLIP';
    tray.setToolTip(baseTrayTooltip);

    const showMain = () => {
      const w = getMainWindow();
      if (!w || w.isDestroyed()) return;
      if (!w.isVisible()) w.show();
      w.focus();
    };

    const menu = Menu.buildFromTemplate([
      {
        label: L.show,
        click: showMain,
      },
      { type: 'separator' },
      {
        label: L.quit,
        click: () => {
          void onQuit();
        },
      },
    ]);
    tray.setContextMenu(menu);
    if (process.platform === 'darwin') {
      try {
        tray.setIgnoreDoubleClickEvents(true);
      } catch {
        /* ignore */
      }
    } else {
      tray.on('click', showMain);
      tray.on('double-click', showMain);
    }
  } catch {
    tray = null;
  }
}
