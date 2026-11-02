/**
 * SteamLAN — optional Steamworks runtime (App ID 480) for peer reachability.
 * @see docs/STEAM-LAN.md
 * @see https://github.com/krwg/blip/issues/156
 */

import { createRequire } from 'module';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export const STEAM_LAN_APP_ID = 480;

const require = createRequire(import.meta.url);

/** @typedef {'off' | 'unavailable' | 'ready' | 'error'} SteamLanState */

/**
 * @typedef {object} SteamLanStatus
 * @property {boolean} enabled
 * @property {SteamLanState} state
 * @property {number} appId
 * @property {string} personaName
 * @property {string} steamId64
 * @property {string} [detail]
 */

/** @type {ReturnType<typeof require> | null} */
let steamworksMod = null;
/** @type {object | null} */
let client = null;
/** @type {string} */
let lastError = '';

function emptyStatus(enabled, state, detail = '') {
  /** @type {SteamLanStatus} */
  const out = {
    enabled: !!enabled,
    state,
    appId: STEAM_LAN_APP_ID,
    personaName: '',
    steamId64: '',
  };
  if (detail) out.detail = detail;
  return out;
}

function ensureSteamAppIdFile() {
  try {
    const { app } = require('electron');
    const dir = app.isPackaged ? process.resourcesPath : app.getAppPath();
    const target = join(dir, 'steam_appid.txt');
    if (!existsSync(target)) {
      writeFileSync(target, `${STEAM_LAN_APP_ID}\n`, 'utf8');
    }
  } catch {

  }
}

/**
 * @param {object|null|undefined} config
 * @returns {SteamLanStatus}
 */
export function getSteamLanStatus(config) {
  const enabled = !!config?.steamLanEnabled;
  if (!enabled) return emptyStatus(false, 'off');
  if (!client) {
    return emptyStatus(
      true,
      lastError ? 'error' : 'unavailable',
      lastError || 'Steam is not available'
    );
  }
  try {
    const personaName = String(client.localplayer.getName() || '');
    const id = client.localplayer.getSteamId();
    const steamId64 = id?.steamId64 != null ? String(id.steamId64) : '';
    return {
      enabled: true,
      state: 'ready',
      appId: STEAM_LAN_APP_ID,
      personaName,
      steamId64,
    };
  } catch (err) {
    return emptyStatus(true, 'error', String(err?.message || err || 'status_failed'));
  }
}

/**
 * Start or stop the SteamLAN runtime based on config.
 * @param {object|null|undefined} config
 * @returns {SteamLanStatus}
 */
export function syncSteamLanRuntime(config) {
  const enabled = !!config?.steamLanEnabled;
  if (!enabled) {
    shutdownSteamLan();
    return emptyStatus(false, 'off');
  }

  if (client) return getSteamLanStatus(config);

  lastError = '';
  try {
    ensureSteamAppIdFile();
    if (!steamworksMod) {
      steamworksMod = require('steamworks.js');
    }
    // init() starts the Steamworks callback pump internally.
    client = steamworksMod.init(STEAM_LAN_APP_ID);
    return getSteamLanStatus(config);
  } catch (err) {
    client = null;
    lastError = String(err?.message || err || 'init_failed');
    const unavailable =
      /steam/i.test(lastError) || /not running/i.test(lastError) || /init/i.test(lastError);
    return emptyStatus(true, unavailable ? 'unavailable' : 'error', lastError);
  }
}

export function shutdownSteamLan() {
  client = null;
  lastError = '';
}

/** @returns {object | null} live Steam client when ready */
export function getSteamLanClient() {
  return client;
}
