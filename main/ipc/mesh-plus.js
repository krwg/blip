/**
 * MESH+ / trust IPC (extracted from main/index.js).
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain } from 'electron';
import { saveConfig } from '../config.js';
import { toPublicConfig } from '../config-public.js';
import { confirmEntitlementBlob } from '../mesh-plus-license.js';
import { premiumResetPatch } from '../../shared/mesh-plus-gates.js';
import { getAppTrustState, refreshMeshPlusTrust } from '../trust-state.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {(cfg: object) => void} deps.setConfig
 * @param {() => import('../discovery.js').Discovery|null} deps.getDiscovery
 * @param {() => void} deps.refreshAppIcons
 * @param {() => void} deps.broadcastTrustState
 * @param {() => void} [deps.clearActiveProfileGif]
 * @param {() => import('electron').BrowserWindow|null} deps.getMainWindow
 * @param {() => void} [deps.closeAuxiliaryWindows]
 * @param {() => void} [deps.clearPeerSockets]
 * @param {() => object} [deps.performFactoryReset]
 * @param {() => void} [deps.unregisterGlobalShortcuts]
 * @param {(channel: string, data: object) => void} [deps.sendToRenderer]
 */
export function registerMeshPlusIpc(deps) {
  const {
    getConfig,
    setConfig,
    getDiscovery,
    refreshAppIcons,
    broadcastTrustState,
    clearActiveProfileGif,
    getMainWindow,
    closeAuxiliaryWindows,
    clearPeerSockets,
    performFactoryReset,
    unregisterGlobalShortcuts,
    sendToRenderer,
  } = deps;

  function broadcastConfig(pub) {
    const mainWindow = getMainWindow?.();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config-updated', pub);
    }
  }

  ipcMain.handle('activate-mesh-plus', (_, rawKey) => {
    const result = confirmEntitlementBlob(rawKey);
    if (!result.ok) return result;
    const config = saveConfig({
      meshPlusLicenseId: result.licenseId,
      meshPlusLicenseSig: result.sigB64,
      meshPlusActivatedAt: Date.now(),
    });
    setConfig(config);
    getDiscovery()?.updateConfig(config);
    getDiscovery()?.announce();
    refreshAppIcons();
    refreshMeshPlusTrust(config);
    broadcastTrustState();
    const pub = toPublicConfig(config);
    broadcastConfig(pub);
    return { ok: true, tier: pub.tier };
  });

  ipcMain.handle('deactivate-mesh-plus', () => {
    const config = getConfig();
    const patch = {
      meshPlusLicenseId: '',
      meshPlusLicenseSig: '',
      meshPlusActivatedAt: 0,
    };
    if (String(config.appIconVariant || '').startsWith('mesh-')) {
      patch.appIconVariant = 'main';
    }
    const prefsPatch = premiumResetPatch(config);
    if (prefsPatch) Object.assign(patch, prefsPatch);
    if (prefsPatch?.hasProfileGif === false) clearActiveProfileGif?.();
    const next = saveConfig(patch);
    setConfig(next);
    getDiscovery()?.updateConfig(next);
    getDiscovery()?.announce();
    refreshAppIcons();
    refreshMeshPlusTrust(next);
    broadcastTrustState();
    const pub = toPublicConfig(next);
    broadcastConfig(pub);
    return { ok: true, tier: 'free' };
  });

  ipcMain.handle('factory-reset', () => {
    closeAuxiliaryWindows?.();
    clearPeerSockets?.();
    const config = performFactoryReset?.();
    setConfig(config);
    unregisterGlobalShortcuts?.();
    refreshAppIcons();
    getDiscovery()?.updateConfig(config);
    getDiscovery()?.announce();
    sendToRenderer?.('peers-updated', { peers: [], occupiedIds: [] });
    const pub = toPublicConfig(config);
    const mainWindow = getMainWindow?.();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config-updated', pub);
      mainWindow.webContents.send('factory-reset-done', pub);
    }
    return { ok: true, config: pub };
  });

  ipcMain.handle('get-mesh-plus-status', () => {
    const config = getConfig();
    const pub = toPublicConfig(config);
    return {
      tier: pub.tier,
      active: pub.meshPlusActive,
      licenseMasked: pub.meshPlusLicenseMasked || '',
      activatedAt: config.meshPlusActivatedAt || 0,
    };
  });

  ipcMain.handle('get-trust-state', () => getAppTrustState());
}
