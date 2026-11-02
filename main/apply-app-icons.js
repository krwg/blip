import { nativeImage } from 'electron';
import { existsSync, readFileSync } from 'fs';
import {
  resolveAppIconVariant,
  resolveVariantTrayIconPath,
  resolveVariantWindowIconPath,
} from './app-icons.js';
import { setTrayIconPath } from './tray.js';

/** CSP blocks file:// images in the renderer — serve as data URL. */
export function filePathToDataUrl(filePath) {
  if (!filePath || !existsSync(filePath)) return '';
  try {
    const buf = readFileSync(filePath);
    const lower = String(filePath).toLowerCase();
    const mime = lower.endsWith('.svg')
      ? 'image/svg+xml'
      : lower.endsWith('.jpg') || lower.endsWith('.jpeg')
        ? 'image/jpeg'
        : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

export function applyAppIcons(config, wins = {}) {
  const variantId = resolveAppIconVariant(config);
  const winPath = resolveVariantWindowIconPath(variantId);
  const trayPath = resolveVariantTrayIconPath(variantId);
  const image = nativeImage.createFromPath(winPath);

  for (const w of [wins.mainWindow, wins.callWindow, wins.groupCallWindow]) {
    if (w && !w.isDestroyed()) {
      try {
        w.setIcon(image);
      } catch {
        /* ignore */
      }
    }
  }

  setTrayIconPath(trayPath);
  return {
    variantId,
    winPath,
    trayPath,
    iconUrl: filePathToDataUrl(winPath),
  };
}
