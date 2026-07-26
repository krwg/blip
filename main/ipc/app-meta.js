/**
 * Updater + app metadata / icons IPC.
 * @see https://github.com/krwg/blip/issues/60
 */

import { app, ipcMain } from 'electron';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { APP_ICON_VARIANTS, resolveVariantWindowIconPath } from '../app-icons.js';
import {
  checkForUpdatesNow,
  quitAndInstallUpdater,
  isPortableInstall,
} from '../updater.js';
import { fetchGithubReleases } from '../github-releases.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {() => object} deps.loadAppMetadata
 * @param {() => { iconUrl?: string }} deps.refreshAppIcons
 */
export function registerAppMetaIpc(deps) {
  const { getConfig, loadAppMetadata, refreshAppIcons } = deps;

  ipcMain.handle('get-github-releases', async (_, limit) => fetchGithubReleases(limit ?? 8));

  ipcMain.handle('get-app-metadata', () => ({
    ...loadAppMetadata(),
    isPackaged: app.isPackaged,
    isPortable: isPortableInstall(),
  }));

  ipcMain.handle('get-app-icon-url', () => {
    const { iconUrl } = refreshAppIcons();
    return iconUrl || '';
  });

  ipcMain.handle('get-app-icon-variants', () => {
    return APP_ICON_VARIANTS.map((v) => {
      const p = resolveVariantWindowIconPath(v.id);
      return {
        id: v.id,
        tier: v.tier,
        previewUrl: existsSync(p) ? pathToFileURL(p).href : '',
      };
    });
  });

  ipcMain.handle('check-for-updates', () => checkForUpdatesNow(() => getConfig()));
  ipcMain.handle('quit-and-install', () => {
    quitAndInstallUpdater();
    return { ok: true };
  });
}
