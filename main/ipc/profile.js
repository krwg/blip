/**
 * Avatar / profile GIF / Giphy IPC (extracted from main/index.js).
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain } from 'electron';
import { readFileSync } from 'fs';
import { saveConfig } from '../config.js';
import { resolveEntitlementState } from '../mesh-plus-license.js';
import {
  getCustomAvatarDataUrl,
  saveCustomAvatar,
  clearCustomAvatar,
} from '../avatar-store.js';
import {
  getProfileGifDataUrl,
  getProfileGifShareDataUrl,
  listProfileGifHistory,
  saveProfileGifFromDataUrl,
  saveProfileGifFromBuffer,
  getProfileGifPublicState,
  setActiveProfileGif,
  clearActiveProfileGif,
} from '../profile-gif-store.js';
import {
  isGiphyConfigured,
  searchGiphy,
  trendingGiphy,
  downloadGifUrl,
} from '../giphy-client.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {(cfg: object) => void} deps.setConfig
 * @param {() => import('../discovery.js').Discovery|null} deps.getDiscovery
 */
export function registerProfileIpc(deps) {
  const { getConfig, setConfig, getDiscovery } = deps;

  function persistGifPublic() {
    const pub = getProfileGifPublicState();
    const config = saveConfig({
      profileGifActiveId: pub.profileGifActiveId,
      hasProfileGif: pub.hasProfileGif,
    });
    setConfig(config);
    getDiscovery()?.announce();
    return pub;
  }

  ipcMain.handle('get-avatar-data-url', () => getCustomAvatarDataUrl());

  ipcMain.handle('save-avatar', async (_, dataUrl) => {
    try {
      saveCustomAvatar(dataUrl);
      const config = saveConfig({ customAvatar: true });
      setConfig(config);
      getDiscovery()?.announce();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || 'save_failed' };
    }
  });

  ipcMain.handle('clear-avatar', () => {
    clearCustomAvatar();
    const config = saveConfig({ customAvatar: false });
    setConfig(config);
    getDiscovery()?.announce();
    return { ok: true };
  });

  ipcMain.handle('get-profile-gif-active-url', () => getProfileGifDataUrl());
  ipcMain.handle('get-profile-gif-share-url', () => getProfileGifShareDataUrl());
  ipcMain.handle('get-profile-gif-history', () => listProfileGifHistory());
  ipcMain.handle('is-giphy-configured', () => isGiphyConfigured());
  ipcMain.handle('search-giphy', (_, query, offset) => searchGiphy(query, { offset }));
  ipcMain.handle('trending-giphy', (_, offset) => trendingGiphy({ offset }));

  ipcMain.handle('save-profile-gif', async (_, dataUrl) => {
    const config = getConfig();
    if (!resolveEntitlementState(config) || !config?.meshPlusLicenseId) {
      return { ok: false, error: 'mesh_plus_required' };
    }
    try {
      const id = saveProfileGifFromDataUrl(dataUrl);
      persistGifPublic();
      return { ok: true, id, dataUrl: getProfileGifDataUrl(id) };
    } catch (e) {
      return { ok: false, error: e?.message || 'save_failed' };
    }
  });

  ipcMain.handle('save-profile-gif-bytes', async (_, base64) => {
    const config = getConfig();
    if (!resolveEntitlementState(config) || !config?.meshPlusLicenseId) {
      return { ok: false, error: 'mesh_plus_required' };
    }
    try {
      const buf = Buffer.from(String(base64 || ''), 'base64');
      if (!buf.length) return { ok: false, error: 'invalid_gif' };
      const id = saveProfileGifFromBuffer(buf);
      persistGifPublic();
      return { ok: true, id, dataUrl: getProfileGifDataUrl(id) };
    } catch (e) {
      return { ok: false, error: 'save_failed' };
    }
  });

  ipcMain.handle('save-profile-gif-path', async (_, filePath) => {
    const config = getConfig();
    if (!resolveEntitlementState(config) || !config?.meshPlusLicenseId) {
      return { ok: false, error: 'mesh_plus_required' };
    }
    try {
      const p = String(filePath || '').trim();
      if (!p) return { ok: false, error: 'invalid_gif' };
      const buf = readFileSync(p);
      const id = saveProfileGifFromBuffer(buf);
      persistGifPublic();
      return { ok: true, id, dataUrl: getProfileGifDataUrl(id) };
    } catch (e) {
      return { ok: false, error: e?.message || 'save_failed' };
    }
  });

  ipcMain.handle('import-giphy-gif', async (_, gifUrl) => {
    try {
      const buf = await downloadGifUrl(gifUrl);
      const id = saveProfileGifFromBuffer(buf);
      persistGifPublic();
      return { ok: true, id, dataUrl: getProfileGifDataUrl(id) };
    } catch (e) {
      return { ok: false, error: e?.message || 'import_failed' };
    }
  });

  ipcMain.handle('set-profile-gif-active', (_, id) => {
    try {
      if (!id) clearActiveProfileGif();
      else setActiveProfileGif(id);
      persistGifPublic();
      return { ok: true, dataUrl: getProfileGifDataUrl() };
    } catch (e) {
      return { ok: false, error: e?.message || 'set_failed' };
    }
  });

  ipcMain.handle('clear-profile-gif', () => {
    clearActiveProfileGif();
    const config = saveConfig({
      profileGifActiveId: '',
      hasProfileGif: false,
    });
    setConfig(config);
    getDiscovery()?.announce();
    return { ok: true };
  });
}
