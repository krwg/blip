/**
 * SteamLAN — Steamworks runtime, lobby sessions, and reliable peer links.
 * @see docs/STEAM-LAN.md
 * @see https://github.com/krwg/blip/issues/156
 * @see https://github.com/krwg/blip/issues/157
 */

import { createRequire } from 'module';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  STEAM_LAN_APP_ID as APP_ID,
  encodeSteamLanAddress,
  parseSteamLanAddress,
  takeSteamLanFrame,
  STEAM_LAN_FRAME_STREAM,
} from './steam-lan-protocol.js';
import { SteamLanSocket } from './steam-lan-socket.js';

export const STEAM_LAN_APP_ID = APP_ID;

const require = createRequire(import.meta.url);

/** @typedef {'off' | 'unavailable' | 'ready' | 'error'} SteamLanState */
/** @typedef {'friends' | 'invite'} SteamLanSessionMode */

/**
 * @typedef {object} SteamLanStatus
 * @property {boolean} enabled
 * @property {SteamLanState} state
 * @property {number} appId
 * @property {string} personaName
 * @property {string} steamId64
 * @property {string} [detail]
 * @property {null|{ mode: SteamLanSessionMode, address: string, hosting: boolean, memberCount: number }} [session]
 */

/** @type {ReturnType<typeof require> | null} */
let steamworksMod = null;
/** @type {object | null} */
let client = null;
/** @type {string} */
let lastError = '';
/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;
/** @type {object | null} */
let activeLobby = null;
/** @type {SteamLanSessionMode | null} */
let activeMode = null;
/** @type {boolean} */
let hosting = false;
/** @type {Map<string, SteamLanSocket>} */
const socketsBySteamId = new Map();
/** @type {Map<string, Buffer>} */
const rxBufBySteamId = new Map();
/** @type {Map<string, number>} steamId64 → blipId */
const blipBySteamId = new Map();
/** @type {Map<number, string>} blipId → steamId64 */
const steamByBlipId = new Map();

/** @type {(msg: object, fromBlipId: number) => void} */
let onAppMessage = () => {};
/** @type {(peer: object) => void} */
let onPeerUpsert = () => {};
/** @type {() => object|null} */
let getLocalConfig = () => null;

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

function localSteamId64() {
  try {
    const id = client?.localplayer?.getSteamId?.();
    return id?.steamId64 != null ? String(id.steamId64) : '';
  } catch {
    return '';
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
    const steamId64 = localSteamId64();
    /** @type {SteamLanStatus} */
    const st = {
      enabled: true,
      state: 'ready',
      appId: STEAM_LAN_APP_ID,
      personaName,
      steamId64,
    };
    if (activeLobby) {
      st.session = {
        mode: activeMode || 'friends',
        address: encodeSteamLanAddress(activeLobby.id),
        hosting,
        memberCount: Number(activeLobby.getMemberCount?.() || 0),
      };
    }
    return st;
  } catch (err) {
    return emptyStatus(true, 'error', String(err?.message || err || 'status_failed'));
  }
}

/**
 * @param {{
 *   getConfig: () => object|null,
 *   onMessage: (msg: object, fromBlipId: number) => void,
 *   onPeer: (peer: object) => void,
 * }} hooks
 */
export function configureSteamLanHooks(hooks) {
  getLocalConfig = hooks.getConfig || (() => null);
  onAppMessage = hooks.onMessage || (() => {});
  onPeerUpsert = hooks.onPeer || (() => {});
}

function sendRawFrame(steamId64, frame) {
  if (!client?.networking) return false;
  try {
    const id = BigInt(steamId64);
    return !!client.networking.sendP2PPacket(
      id,
      client.networking.SendType.Reliable,
      frame
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} steamId64
 */
function ensureSocket(steamId64) {
  const key = String(steamId64);
  let sock = socketsBySteamId.get(key);
  if (sock && !sock.destroyed) return sock;
  sock = new SteamLanSocket(key, sendRawFrame);
  socketsBySteamId.set(key, sock);
  sock.on('close', () => {
    if (socketsBySteamId.get(key) === sock) socketsBySteamId.delete(key);
  });
  return sock;
}

/**
 * @param {number} blipId
 * @returns {SteamLanSocket | null}
 */
export function getSteamLanSocketForBlip(blipId) {
  const sid = steamByBlipId.get(Number(blipId));
  if (!sid) return null;
  return ensureSocket(sid);
}

/**
 * @param {number} blipId
 */
export function isSteamLanPeer(blipId) {
  return steamByBlipId.has(Number(blipId));
}

function rememberMapping(steamId64, blipId) {
  const sid = String(steamId64);
  const id = Number(blipId);
  if (!sid || !Number.isFinite(id)) return;
  blipBySteamId.set(sid, id);
  steamByBlipId.set(id, sid);
}

function upsertPeerFromHello(steamId64, hello) {
  const blipId = Number(hello?.blipId);
  if (!Number.isFinite(blipId) || blipId < 1) return;
  rememberMapping(steamId64, blipId);
  onPeerUpsert({
    blipId,
    displayName: String(hello.displayName || `BLIP-${blipId}`),
    steamId64: String(steamId64),
    steamLan: true,
    presence: 'online',
    presenceText: '',
    ip: `steam:${steamId64}`,
    ips: [`steam:${steamId64}`],
    tcpPort: 0,
    udpPort: 0,
    lastSeen: Date.now(),
    online: true,
    meshVerified: false,
    meshLegacy: true,
    meshProto: 0,
    meshTcpEncrypted: false,
    meshPubkey: String(hello.meshPubkey || ''),
    meshPlus: false,
    hasProfileGif: false,
    buildTrust: 'unverified_build',
    buildIssuer: '',
    buildVerified: false,
    meshPlusTrust: 'unverified_mesh_plus',
  });
}

function sendHello(steamId64) {
  const cfg = getLocalConfig() || {};
  const hello = {
    type: 'steam-lan-hello',
    blipId: cfg.blipId,
    displayName: cfg.displayName || `BLIP-${cfg.blipId}`,
    meshPubkey: cfg.meshPublicKey || '',
  };
  const line = Buffer.from(`${JSON.stringify(hello)}\n`, 'utf8');
  const sock = ensureSocket(steamId64);
  sock.write(line);
}

function handleStreamPayload(steamId64, payload) {
  const sock = ensureSocket(steamId64);
  // Side-parse hello before/while the shared TCP line reader is attached.
  let probe = Buffer.concat([
    rxBufBySteamId.get(`line:${steamId64}`) || Buffer.alloc(0),
    Buffer.isBuffer(payload) ? payload : Buffer.from(payload),
  ]);
  let idx = probe.indexOf(0x0a);
  while (idx >= 0) {
    const line = probe.subarray(0, idx).toString('utf8').trim();
    probe = probe.subarray(idx + 1);
    idx = probe.indexOf(0x0a);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg?.type === 'steam-lan-hello') {
        upsertPeerFromHello(steamId64, msg);
      }
    } catch {

    }
  }
  rxBufBySteamId.set(`line:${steamId64}`, probe);
  sock.pushRemoteBytes(payload);
}

function ingestPacket(raw, steamId64) {
  if (!Buffer.isBuffer(raw)) raw = Buffer.from(raw);
  const key = String(steamId64);
  let pending = Buffer.concat([rxBufBySteamId.get(`frame:${key}`) || Buffer.alloc(0), raw]);
  for (;;) {
    const { frame, rest } = takeSteamLanFrame(pending);
    pending = rest;
    if (!frame) break;
    if (frame.kind === STEAM_LAN_FRAME_STREAM) {
      handleStreamPayload(key, frame.payload);
    }
  }
  rxBufBySteamId.set(`frame:${key}`, pending);
}

function pollIncoming() {
  if (!client?.networking) return;
  try {
    for (let i = 0; i < 32; i++) {
      const available = client.networking.isP2PPacketAvailable?.();
      const size = typeof available === 'number' ? available : 0;
      if (!size) break;
      const packet = client.networking.readP2PPacket(size);
      if (!packet?.data) continue;
      const sid =
        packet.steamId?.steamId64 != null
          ? String(packet.steamId.steamId64)
          : '';
      if (!sid) continue;
      try {
        client.networking.acceptP2PSession?.(BigInt(sid));
      } catch {

      }
      ingestPacket(Buffer.from(packet.data), sid);
    }
  } catch {

  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollIncoming, 33);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function clearSessionState() {
  try {
    activeLobby?.leave?.();
  } catch {

  }
  activeLobby = null;
  activeMode = null;
  hosting = false;
  for (const sock of socketsBySteamId.values()) {
    try {
      sock.destroy();
    } catch {

    }
  }
  socketsBySteamId.clear();
  rxBufBySteamId.clear();
  blipBySteamId.clear();
  steamByBlipId.clear();
}

function registerLobbyCallbacks() {
  if (!client?.callback?.register || !steamworksMod?.SteamCallback) return;
  try {
    client.callback.register(
      steamworksMod.SteamCallback.P2PSessionRequest,
      (value) => {
        try {
          const sid = value?.steamId?.steamId64 ?? value?.remoteSteamId;
          if (sid != null) client.networking.acceptP2PSession(BigInt(String(sid)));
        } catch {

        }
      }
    );
  } catch {

  }
}

function helloAllMembers() {
  if (!activeLobby || !client) return;
  const self = localSteamId64();
  try {
    const members = activeLobby.getMembers?.() || [];
    for (const m of members) {
      const sid = m?.steamId64 != null ? String(m.steamId64) : '';
      if (!sid || sid === self) continue;
      try {
        client.networking.acceptP2PSession?.(BigInt(sid));
      } catch {

      }
      sendHello(sid);
    }
  } catch {

  }
}

/**
 * @param {object|null|undefined} config
 * @returns {SteamLanStatus}
 */
export function syncSteamLanRuntime(config) {
  const enabled = !!config?.steamLanEnabled;
  if (!enabled) {
    shutdownSteamLan();
    return emptyStatus(false, 'off');
  }

  if (client) {
    startPolling();
    return getSteamLanStatus(config);
  }

  lastError = '';
  try {
    ensureSteamAppIdFile();
    if (!steamworksMod) {
      steamworksMod = require('steamworks.js');
    }
    client = steamworksMod.init(STEAM_LAN_APP_ID);
    registerLobbyCallbacks();
    startPolling();
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
  stopPolling();
  clearSessionState();
  client = null;
  lastError = '';
}

/** @returns {object | null} */
export function getSteamLanClient() {
  return client;
}

/**
 * @param {SteamLanSessionMode} mode
 * @param {object} config
 */
export async function hostSteamLanSession(mode, config) {
  const st = syncSteamLanRuntime(config);
  if (st.state !== 'ready' || !client) {
    return { ok: false, error: st.detail || st.state || 'unavailable', status: st };
  }
  clearSessionState();
  const lobbyType =
    mode === 'invite'
      ? client.matchmaking.LobbyType.Private
      : client.matchmaking.LobbyType.FriendsOnly;
  const lobby = await client.matchmaking.createLobby(lobbyType, 8);
  activeLobby = lobby;
  activeMode = mode === 'invite' ? 'invite' : 'friends';
  hosting = true;
  try {
    lobby.mergeFullData?.({
      blip: '1',
      blipId: String(config.blipId || ''),
      name: String(config.displayName || ''),
    });
    lobby.setJoinable?.(true);
  } catch {

  }
  helloAllMembers();
  return { ok: true, status: getSteamLanStatus(config) };
}

/**
 * @param {string} address
 * @param {object} config
 */
export async function joinSteamLanSession(address, config) {
  const st = syncSteamLanRuntime(config);
  if (st.state !== 'ready' || !client) {
    return { ok: false, error: st.detail || st.state || 'unavailable', status: st };
  }
  const lobbyId = parseSteamLanAddress(address);
  if (lobbyId == null) {
    return { ok: false, error: 'invalid_address', status: st };
  }
  clearSessionState();
  const lobby = await client.matchmaking.joinLobby(lobbyId);
  activeLobby = lobby;
  activeMode = 'invite';
  hosting = false;
  helloAllMembers();
  // Host is the lobby owner — say hello specifically.
  try {
    const owner = lobby.getOwner?.();
    const sid = owner?.steamId64 != null ? String(owner.steamId64) : '';
    if (sid && sid !== localSteamId64()) sendHello(sid);
  } catch {

  }
  return { ok: true, status: getSteamLanStatus(config) };
}

/**
 * @param {object} config
 */
export function leaveSteamLanSession(config) {
  clearSessionState();
  return { ok: true, status: getSteamLanStatus(config) };
}

export function openSteamLanInviteDialog() {
  try {
    activeLobby?.openInviteDialog?.();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err || 'invite_failed') };
  }
}
