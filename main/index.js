import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, session } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { Discovery } from './discovery.js';
import { createTcpServer } from './tcp-server.js';
import { connectToPeer } from './tcp-client.js';
import { createTcpLineReader } from './tcp-framing.js';
import { loadConfig, saveConfig, initConfigPath } from './config.js';
import { toPublicConfig } from './config-public.js';
import { resolveEntitlementState } from './mesh-plus-license.js';
import {
  initAppTrustState,
  getAppTrustState,
} from './trust-state.js';
import {
  premiumResetPatch,
  sanitizePremiumPrefs,
} from '../shared/mesh-plus-gates.js';
import {
  canUseAppIconVariant,
  normalizeAppIconVariant,
} from './app-icons.js';
import { resolveAppIconVariant, resolveVariantWindowIconPath } from './app-icons.js';
import { applyAppIcons } from './apply-app-icons.js';
import { ensureMeshIdentity } from './mesh-identity.js';
import {
  handleMeshHandshakeMessage,
  assertAuthenticated,
  isSocketAuthenticated,
  performOutboundHandshakeOrCompat,
  tryLegacyCompatAuth,
  assertMayUseUnencryptedPeer,
  clearSocketSession,
  initInboundSession,
  getSocketSession,
} from './mesh-handshake.js';
import {
  BlipErrorCode,
  createBlipError,
  classifyBlipError,
  logBlipError,
  destroySocketTagged,
  tagSocketClose,
  formatPeerDialDebug,
  isSocketCloseFamily,
} from '../shared/blip-errors.js';
import { parseMeshTcpLine } from './mesh-session-crypto.js';
import { isPeerBlocked } from './trust-policy.js';
import { createTray, destroyTray, setTrayTransferProgress } from './tray.js';
import {
  destroyOverlayWindow,
  refreshPresenceLoop,
  toggleOverlayVisible,
} from './overlay-window.js';
import { registerCallIpc } from './ipc/calls.js';
import { registerBeaconIpc } from './ipc/beacon.js';
import { registerFileIpc } from './ipc/files.js';
import { registerOverlayIpc } from './ipc/overlay.js';
import { registerMeshPlusIpc } from './ipc/mesh-plus.js';
import { registerProfileIpc } from './ipc/profile.js';
import { registerNetworkIpc } from './ipc/network.js';
import { registerShellIpc } from './ipc/shell.js';
import { registerAppMetaIpc } from './ipc/app-meta.js';
import { registerWindowIpc } from './ipc/windows.js';

import {
  setupAutoUpdater,
  configureAutoUpdater,
} from './updater.js';
import { resolveBuildAsset } from './paths.js';
import { resolvePorts } from './ports.js';
import { serializeSdp, sendCallPayload } from './call-wire.js';
import {
  clearActiveProfileGif,
  getProfileGifPublicState,
} from './profile-gif-store.js';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './global-shortcuts.js';
import {
  resolveDisplaySourceForCallback,
} from './display-capture.js';
import { performFactoryReset } from './factory-reset.js';
import {
  extractBlipFileFromArgv,
  extractBlipSeedIdFromArgv,
  readBlipSeedFile,
} from './blip-open.js';

if (process.env.BLIP_USER_DATA_DIR) {
  app.setPath('userData', process.env.BLIP_USER_DATA_DIR);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const useViteDev = process.env.BLIP_VITE_DEV === '1';
const distIndex = join(rootDir, 'dist/index.html');
const preloadPath = join(rootDir, 'preload.cjs');
const appMetaPath = join(rootDir, 'app-metadata.json');

function loadAppMetadata() {
  try {
    if (existsSync(appMetaPath)) {
      return JSON.parse(readFileSync(appMetaPath, 'utf8'));
    }
  } catch (e) {
    console.warn('[BLIP] app-metadata', e);
  }
  return {
    displayName: 'BLIP',
    codename: '',
    version: app.getVersion(),
    githubUrl: '',
  };
}

let mainWindow = null;
let callWindow = null;

let activeCallPeerId = null;
let activeCallStartedAt = 0;
let groupCallWindow = null;
let callWindowReady = false;
let groupCallWindowReady = false;

function setActiveCallPeer(peerId) {
  const id = Number(peerId) || null;
  if (id && id !== activeCallPeerId) {
    activeCallStartedAt = Date.now();
  }
  if (!id) activeCallStartedAt = 0;
  activeCallPeerId = id;
}

function clearActiveCallPeer(peerId = null) {
  if (peerId != null && Number(peerId) !== Number(activeCallPeerId)) return;
  activeCallPeerId = null;
  activeCallStartedAt = 0;
}

const pendingCallIpc = [];

const pendingGroupCallIpc = [];
let discovery = null;
let tcpServer = null;
let config = null;
const peerSockets = new Map();

const peerSocketConnectInflight = new Map();

let appIsQuitting = false;

const pendingRendererDeliveries = [];

let pendingBlipFilePath = null;

function queueRendererDelivery(fn) {
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isLoading()
  ) {
    fn();
    return;
  }
  pendingRendererDeliveries.push(fn);
}

function flushPendingRendererDeliveries() {
  while (pendingRendererDeliveries.length) {
    const fn = pendingRendererDeliveries.shift();
    try {
      fn();
    } catch (e) {
      console.warn('[BLIP] pending delivery', e);
    }
  }
}

function deliverBeaconOpenSeed(seedId) {
  if (!seedId) return;
  queueRendererDelivery(() => {
    sendToRenderer('beacon-open-seed', { seedId: String(seedId) });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function deliverBeaconOpenBlipFile(filePath) {
  try {
    const { text, doc } = readBlipSeedFile(filePath);
    queueRendererDelivery(() => {
      sendToRenderer('beacon-open-blip-file', { filePath, text, doc });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (e) {
    console.warn('[BLIP] open .blip file', filePath, e?.message || e);
  }
}

function handleOpenRequestFromArgv(argv) {
  const blipFile = extractBlipFileFromArgv(argv);
  if (blipFile) {
    deliverBeaconOpenBlipFile(blipFile);
    return;
  }
  const seedId = extractBlipSeedIdFromArgv(argv);
  if (seedId) deliverBeaconOpenSeed(seedId);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    handleOpenRequestFromArgv(argv);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!extractBlipFileFromArgv(argv) && !extractBlipSeedIdFromArgv(argv)) {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

app.on('open-file', (event, filePath) => {
  if (!/\.blip$/i.test(filePath || '')) return;
  event.preventDefault();
  if (app.isReady()) deliverBeaconOpenBlipFile(filePath);
  else pendingBlipFilePath = filePath;
});

function getRendererUrl() {
  if (useViteDev) return 'http://localhost:5173';
  if (existsSync(distIndex)) return distIndex;
  return 'http://localhost:5173';
}

function getWindowIcon() {
  const iconPath = resolveVariantWindowIconPath(resolveAppIconVariant(config));
  if (existsSync(iconPath)) return nativeImage.createFromPath(iconPath);
  return undefined;
}

function refreshAppIcons() {
  return applyAppIcons(config, { mainWindow, callWindow, groupCallWindow });
}

function createWindow() {
  const icon = getWindowIcon();
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    frame: false,
    icon,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const url = getRendererUrl();
  console.log('[BLIP] Loading UI:', url);
  if (url.startsWith('http')) {
    mainWindow.loadURL(url);
  } else {
    mainWindow.loadFile(url);
  }

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, validatedURL) => {
    console.error('[BLIP] did-fail-load:', code, desc, validatedURL);
    if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.webContents.on('preload-error', (_event, path, error) => {
    console.error('[BLIP] preload-error:', path, error);
  });

  if (!app.isPackaged && process.env.BLIP_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (e) => {
    if (appIsQuitting) return;
    if (config?.closeToTray) {
      e.preventDefault();
      if (!mainWindow.isDestroyed()) mainWindow.hide();
      return;
    }
    try {
      if (callWindow && !callWindow.isDestroyed()) {
        callWindow.destroy();
        callWindow = null;
      }
    } catch {

    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    unregisterGlobalShortcuts();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    refreshGlobalShortcuts();
    flushPendingRendererDeliveries();
  });
}

function refreshGlobalShortcuts() {
  if (!config?.blipId) {
    unregisterGlobalShortcuts();
    return;
  }
  registerGlobalShortcuts({
    enabled: config.globalShortcutsEnabled !== false,
    getMainWindow: () => mainWindow,
    getCallWindow: () => callWindow,
    onToggleOverlay: () => toggleOverlayHotkey(),
  });
}

function getCallWindowUrl() {
  if (useViteDev) return 'http://localhost:5173/call-window.html';
  const p = join(rootDir, 'dist/call-window.html');
  if (existsSync(p)) return p;
  return `http://localhost:5173/call-window.html`;
}

async function ensureCallWindow() {
  if (callWindow && !callWindow.isDestroyed()) return callWindow;

  const icon = getWindowIcon();
  callWindow = new BrowserWindow({
    width: 440,
    height: 560,
    minWidth: 400,
    minHeight: 500,
    frame: false,
    show: false,
    icon,
    title: 'BLIP — Call',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  callWindow.setMenuBarVisibility(false);

  const url = getCallWindowUrl();
  console.log('[BLIP] Call window load:', url);
  if (url.startsWith('http')) {
    await callWindow.loadURL(url);
  } else {
    await callWindow.loadFile(url);
  }

  callWindow.on('closed', () => {
    callWindow = null;
    callWindowReady = false;
    pendingCallIpc.length = 0;
  });

  callWindow.webContents.on('did-start-load', () => {
    callWindowReady = false;
  });

  return callWindow;
}

function flushCallWindowQueue() {
  if (!callWindow || callWindow.isDestroyed() || !callWindowReady) return;
  let shouldFocus = false;
  for (const item of pendingCallIpc) {
    callWindow.webContents.send(item.channel, item.data);
    if (item.focus) shouldFocus = true;
  }
  pendingCallIpc.length = 0;
  if (shouldFocus) {
    callWindow.show();
    callWindow.focus();
  }
}

function flushGroupCallWindowQueue() {
  if (!groupCallWindow || groupCallWindow.isDestroyed() || !groupCallWindowReady) return;
  let shouldFocus = false;
  for (const item of pendingGroupCallIpc) {
    groupCallWindow.webContents.send(item.channel, item.data);
    if (item.focus) shouldFocus = true;
  }
  pendingGroupCallIpc.length = 0;
  if (shouldFocus) {
    groupCallWindow.show();
    groupCallWindow.focus();
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeRendererReady(win, globalFlag) {
  if (!win || win.isDestroyed()) return false;
  try {
    return await win.webContents.executeJavaScript(`Boolean(window.${globalFlag})`);
  } catch {
    return false;
  }
}

async function waitForCallWindowReady(win, timeoutMs = 20000) {
  if (callWindowReady) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (callWindowReady) return;
    if (await probeRendererReady(win, '__blipCallReady')) {
      callWindowReady = true;
      flushCallWindowQueue();
      return;
    }
    await delay(50);
  }
  throw new Error('Call window did not become ready');
}

async function waitForGroupCallWindowReady(win, timeoutMs = 20000) {
  if (groupCallWindowReady) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (groupCallWindowReady) return;
    if (await probeRendererReady(win, '__blipGroupCallReady')) {
      groupCallWindowReady = true;
      flushGroupCallWindowQueue();
      return;
    }
    await delay(50);
  }
  throw new Error('Group call window did not become ready');
}

async function readGroupFromMainWindow(groupId) {
  if (!mainWindow || mainWindow.isDestroyed() || !groupId) return null;
  const key = JSON.stringify(String(groupId));
  try {
    return await mainWindow.webContents.executeJavaScript(`(() => {
      try {
        const raw = localStorage.getItem('blip_groups_v1');
        if (!raw) return null;
        const o = JSON.parse(raw);
        return o[${key}] ?? null;
      } catch { return null; }
    })()`);
  } catch (e) {
    console.warn('[BLIP] readGroupFromMainWindow', e?.message || e);
    return null;
  }
}

function getGroupCallWindowUrl() {
  if (useViteDev) return 'http://localhost:5173/group-call-window.html';
  const p = join(rootDir, 'dist/group-call-window.html');
  if (existsSync(p)) return p;
  return 'http://localhost:5173/group-call-window.html';
}

async function ensureGroupCallWindow() {
  if (groupCallWindow && !groupCallWindow.isDestroyed()) return groupCallWindow;

  const icon = getWindowIcon();
  groupCallWindow = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 560,
    minHeight: 420,
    frame: false,
    show: false,
    icon,
    title: 'BLIP — Group call',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  groupCallWindow.setMenuBarVisibility(false);

  const url = getGroupCallWindowUrl();
  console.log('[BLIP] Group call window load:', url);
  if (url.startsWith('http')) {
    await groupCallWindow.loadURL(url);
  } else {
    await groupCallWindow.loadFile(url);
  }

  groupCallWindow.on('closed', () => {
    groupCallWindow = null;
    groupCallWindowReady = false;
    pendingGroupCallIpc.length = 0;
  });

  groupCallWindow.webContents.on('did-start-load', () => {
    groupCallWindowReady = false;
  });

  return groupCallWindow;
}

async function sendToGroupCallWindow(channel, data, { focus = true } = {}) {
  try {
    const win = await ensureGroupCallWindow();
    if (!win || win.isDestroyed()) return;
    pendingGroupCallIpc.push({ channel, data, focus });
    if (!groupCallWindowReady) {
      await waitForGroupCallWindowReady(win);
    }
    flushGroupCallWindowQueue();
  } catch (e) {
    console.error('[BLIP] sendToGroupCallWindow', channel, e);
  }
}

function applyLaunchAtLogin(enabled) {
  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') {
    return;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: false,
    });
  } catch (e) {
    console.warn('[BLIP] launchAtLogin', e?.message || e);
  }
}

async function sendToCallWindow(channel, data, { focus = true } = {}) {
  try {
    const win = await ensureCallWindow();
    if (!win || win.isDestroyed()) return;
    pendingCallIpc.push({ channel, data, focus });
    if (!callWindowReady) {
      console.log('[BLIP] → call-window (queued)', channel);
      await waitForCallWindowReady(win);
    }
    flushCallWindowQueue();
    console.log('[BLIP] → call-window', channel, focus ? '+focus' : '');
  } catch (e) {
    console.error('[BLIP] sendToCallWindow', channel, e);
  }
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function broadcastTrustState() {
  const trust = getAppTrustState();
  sendToRenderer('trust-state', trust);
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.webContents.send('trust-state', trust);
  }
  if (groupCallWindow && !groupCallWindow.isDestroyed()) {
    groupCallWindow.webContents.send('trust-state', trust);
  }
}

function patchConfig(updates) {
  config = saveConfig(updates);
  discovery?.updateConfig(config);
  discovery?.announce();
  const pub = toPublicConfig(config);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('config-updated', pub);
  }
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.webContents.send('config-updated', pub);
  }
  if (groupCallWindow && !groupCallWindow.isDestroyed()) {
    groupCallWindow.webContents.send('config-updated', pub);
  }
  if (updates?.launchAtLogin !== undefined) {
    applyLaunchAtLogin(config.launchAtLogin);
  }
  if (
    updates?.overlayEnabled !== undefined ||
    updates?.presenceDetectEnabled !== undefined ||
    updates?.presenceShareEnabled !== undefined ||
    updates?.presencePreferGames !== undefined ||
    updates?.presencePinnedApp !== undefined
  ) {
    syncOverlayFeature();
  }
  return config;
}

function overlayWindowDeps() {
  return {
    rootDir,
    useViteDev,
    preloadPath,
    icon: getWindowIcon(),
  };
}

/** Last unread total pushed from renderer (nav badge). */
let lastOverlayUnread = 0;

function syncOverlayFeature() {
  refreshPresenceLoop({
    getConfig: () => config,
    patchConfig,
    getPeersOnline: () =>
      (discovery?.getPeers?.() || []).filter((p) => p?.online).length,
    getUnreadTotal: () => lastOverlayUnread,
    getCallInfo: () => {
      if (!activeCallPeerId) return { active: false };
      const peer = (discovery?.getPeers?.() || []).find(
        (p) => Number(p.blipId) === Number(activeCallPeerId)
      );
      return {
        active: true,
        peerId: activeCallPeerId,
        peerName: peer?.displayName || `BLIP-${activeCallPeerId}`,
        startedAt: activeCallStartedAt || Date.now(),
      };
    },
    windowDeps: overlayWindowDeps(),
  });
}

function toggleOverlayHotkey() {
  if (!config?.overlayEnabled) return;
  toggleOverlayVisible({
    getConfig: () => config,
    windowDeps: overlayWindowDeps(),
  });
}

function meshHandshakeContext() {
  return {
    config,
    discovery,
    tcpServer,
    onConfigPatch: (updates) => patchConfig(updates),
  };
}

function showDesktopNotification(payload) {
  if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' };
  const peerId = Number(payload?.peerId);
  const kind = payload?.kind === 'call' ? 'call' : 'chat';
  const title =
    typeof payload?.title === 'string' ? payload.title.trim().slice(0, 128) : 'BLIP';
  let body = typeof payload?.body === 'string' ? payload.body.replace(/\s+/g, ' ').trim() : '';
  body = body.slice(0, 256);
  if (!body) body = ' ';
  try {
    const n = new Notification({ title: title || 'BLIP', body, silent: false });
    n.on('click', () => {
      if (kind === 'call') {
        void ensureCallWindow().then((win) => {
          if (win && !win.isDestroyed()) {
            win.show();
            win.focus();
          }
        });
        return;
      }
      if (Number.isFinite(peerId) && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('notification-open-chat', peerId);
      }
    });
    n.show();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function findPeer(blipId) {
  const peers = discovery?.getPeers() || [];
  return peers.find((p) => p.blipId === blipId && p.online) || null;
}

function wirePeerSocket(socket, socketKey, peerIp) {
  if (socket._blipPeerWired) return;
  socket._blipPeerWired = true;

  initInboundSession(socket, peerIp || socket.remoteAddress || '');

  const reader = createTcpLineReader(() => {
    destroySocketTagged(
      socket,
      BlipErrorCode.SOCKET_CLOSED_LINE_TOO_LARGE,
      'TCP line reader overflow'
    );
  });

  const onSocketLine = (msg) => {
    if (msg.type === 'ping') return;
    if (handleMeshHandshakeMessage(msg, socket, meshHandshakeContext())) return;
    if (!isSocketAuthenticated(socket)) {
      const compat = tryLegacyCompatAuth({
        session: getSocketSession(socket),
        msg,
        config,
        discovery,
        remoteIp: peerIp || socket.remoteAddress || '',
      });
      if (!compat.ok) return;
      tcpServer?.registerConnection?.(compat.from, socket);
      discovery?.notePeerCompat?.(compat.from, true);
      discovery?.notePeerChannelCrypto?.(compat.from, false);
    }
    const auth = assertAuthenticated(socket, msg);
    if (!auth.ok) return;
    if (isPeerBlocked(config, auth.from)) return;
    handleTcpPayload(msg, auth.from);
  };

  socket.on('data', (chunk) => {
    try {
      for (const line of reader.push(chunk)) {
        try {
          const session = getSocketSession(socket);
          onSocketLine(parseMeshTcpLine(session?.cipher || null, line));
        } catch (err) {
          if (
            err?.code === 'MESH_PLAINTEXT_AFTER_CIPHER' ||
            err?.code === 'MESH_BAD_ENVELOPE' ||
            err?.code === 'MESH_NO_CIPHER'
          ) {
            destroySocketTagged(
              socket,
              BlipErrorCode.SOCKET_CLOSED_MESH_CRYPTO,
              err.code
            );
            return;
          }
        }
      }
    } catch (e) {
      if (e?.code === 'LINE_TOO_LARGE') {
        destroySocketTagged(
          socket,
          BlipErrorCode.SOCKET_CLOSED_LINE_TOO_LARGE,
          'LINE_TOO_LARGE'
        );
      }
    }
  });

  socket.on('error', (err) => {
    if (!socket._blipCloseCode) {
      tagSocketClose(
        socket,
        BlipErrorCode.SOCKET_ERROR,
        err?.message || String(err)
      );
    }
    console.error(
      `[BLIP E${BlipErrorCode.SOCKET_ERROR}/SOCKET_ERROR] outbound ${socketKey}: ${err?.message || err}`
    );
  });

  socket.on('close', (hadError) => {
    if (!socket._blipCloseCode) {
      tagSocketClose(
        socket,
        hadError
          ? BlipErrorCode.SOCKET_CLOSED_AFTER_ERROR
          : BlipErrorCode.SOCKET_CLOSED_REMOTE_EOF,
        hadError ? 'close after error' : 'remote EOF'
      );
    }
    clearSocketSession(socket);
    peerSockets.delete(socketKey);
    socket._blipPeerWired = false;
  });
}

async function ensurePeerSocket(blipId) {
  const peer = findPeer(blipId);
  if (!peer) {
    throw createBlipError(BlipErrorCode.PEER_NOT_FOUND, `Peer #${blipId} not found`);
  }
  if (!peer.online) {
    throw createBlipError(BlipErrorCode.PEER_OFFLINE, `Peer #${blipId} offline`);
  }

  console.error(`[BLIP dial] ensurePeerSocket ${formatPeerDialDebug(peer)}`);

  const gate = assertMayUseUnencryptedPeer(config, peer);
  if (!gate.ok) {
    throw createBlipError(BlipErrorCode.UNENCRYPTED_DISABLED, gate.error);
  }

  try {
    const inbound = tcpServer?.getConnection?.(blipId);
    if (inbound && !inbound.destroyed && isSocketAuthenticated(inbound)) {
      console.error(`[BLIP dial] reuse inbound authenticated socket for #${blipId}`);
      return inbound;
    }

    const tcpPort = peer.tcpPort || resolvePorts(config).tcpPort;
    const socketKey = `${peer.ip}:${blipId}:${tcpPort}`;

    const cached = peerSockets.get(socketKey);
    if (cached && !cached.destroyed && isSocketAuthenticated(cached)) {
      console.error(`[BLIP dial] reuse cached outbound socket for #${blipId}`);
      return cached;
    }

    const inflight = peerSocketConnectInflight.get(socketKey);
    if (inflight) return inflight;

    const registerConnection = (id, sock) => tcpServer?.registerConnection?.(id, sock);

    const connectPromise = (async () => {
      peerSockets.delete(socketKey);

      const openWired = async () => {
        let socket;
        try {
          socket = await connectToPeer(peer.ip, blipId, tcpPort);
        } catch (err) {
          throw classifyBlipError(err);
        }
        wirePeerSocket(socket, socketKey, peer.ip);
        return socket;
      };

      let socket;
      try {
        socket = await openWired();
      } catch (err) {
        logBlipError(err, `ensurePeerSocket #${blipId} connect`);
        throw err;
      }

      try {
        await performOutboundHandshakeOrCompat(socket, config, blipId, discovery, {
          registerConnection,
        });
      } catch (err) {
        const classified = classifyBlipError(err);
        const mayCompat =
          err?.needCompatReconnect ||
          isSocketCloseFamily(classified.blipCode) ||
          classified.blipCode === BlipErrorCode.HANDSHAKE_PEER_CLOSED ||
          classified.blipCode === BlipErrorCode.ENSURE_HANDSHAKE_FAILED;

        if (mayCompat && config?.allowUnencryptedMesh !== false) {
          logBlipError(
            createBlipError(
              BlipErrorCode.ENSURE_COMPAT_RETRY,
              `Retry plaintext compat for #${blipId}`,
              classified
            ),
            `ensurePeerSocket #${blipId}`
          );
          try {
            if (!socket.destroyed) {
              destroySocketTagged(
                socket,
                BlipErrorCode.ENSURE_COMPAT_RETRY,
                'closing before compat reconnect'
              );
            }
          } catch {
            /* ignore */
          }
          try {
            socket = await openWired();
            await performOutboundHandshakeOrCompat(socket, config, blipId, discovery, {
              registerConnection,
              forcePlaintext: true,
            });
          } catch (retryErr) {
            throw createBlipError(
              BlipErrorCode.COMPAT_RECONNECT_FAILED,
              `Compat reconnect failed for #${blipId}`,
              retryErr
            );
          }
        } else {
          logBlipError(classified, `ensurePeerSocket #${blipId}`);
          throw createBlipError(
            BlipErrorCode.ENSURE_HANDSHAKE_FAILED,
            `ensurePeerSocket handshake failed for #${blipId}`,
            classified
          );
        }
      }
      peerSockets.set(socketKey, socket);
      return socket;
    })().finally(() => {
      peerSocketConnectInflight.delete(socketKey);
    });

    peerSocketConnectInflight.set(socketKey, connectPromise);
    return connectPromise;
  } catch (err) {
    const classified = classifyBlipError(err);
    logBlipError(classified, `ensurePeerSocket #${blipId} outer`);
    throw classified;
  }
}

function sendCallToPeer(peerBlipId, payload) {
  return sendCallPayload(tcpServer, ensurePeerSocket, peerBlipId, payload, peerSockets);
}

function handleTcpPayload(msg, fromBlipId) {
  if (isPeerBlocked(config, fromBlipId)) return;

  switch (msg.type) {
    case 'ping':
      return;
    case 'mesh-handshake':
    case 'mesh-handshake-ack':
      return;
    case 'message':
    case 'typing':
    case 'receipt':
    case 'reaction':
    case 'group-invite':
    case 'group-invite-ack':
    case 'group-msg':
    case 'group-host':
    case 'group-sync':
    case 'group-leave':
    case 'group-disband':
      sendToRenderer('tcp-message', msg);
      break;
    case 'group-call-signal':
      void sendToGroupCallWindow('group-call-tcp', msg, { focus: false });
      break;
    case 'group-call-start':
      sendToRenderer('tcp-message', msg);
      break;
    case 'group-call-state':
    case 'group-call-end':
      sendToRenderer('tcp-message', msg);
      void sendToGroupCallWindow('group-call-tcp', msg, { focus: false });
      break;
    case 'voice-ch-roster':
    case 'voice-ch-signal':
      sendToRenderer('tcp-message', msg);
      break;
    case 'seed-request':
    case 'seed-chunk':
    case 'seed-chunks-batch':
    case 'seed-have':
    case 'seed-have-request':
    case 'file-offer':
    case 'file-chunk':
    case 'file-chunks-batch':
    case 'file-done':
    case 'file-abort':
    case 'clipboard-push':
    case 'avatar-share':
    case 'group-avatar-share':
    case 'group-avatar-request':
    case 'profile-gif-share':
    case 'profile-gif-request':
      sendToRenderer('tcp-message', msg);
      break;
    case 'call-offer': {
      const callerId = msg.from ?? fromBlipId;
      setActiveCallPeer(callerId);
      if (config?.desktopCallNotifications !== false && !config?.doNotDisturb) {
        showDesktopNotification({
          kind: 'call',
          peerId: callerId,
          title: 'BLIP',
          body: `Incoming call · #${callerId}`,
        });
      }
      void sendToCallWindow(
        'incoming-call',
        {
          ...msg,
          from: callerId,
          sdp: msg.sdp,
          video: msg.video,
        },
        { focus: true }
      );
      break;
    }
    case 'call-answer':
      setActiveCallPeer(msg.from ?? fromBlipId ?? activeCallPeerId);
      void sendToCallWindow('call-answer', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-candidate':
      void sendToCallWindow('call-candidate', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-reject':
      void sendToCallWindow('call-rejected', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-hangup':
      clearActiveCallPeer(msg.from ?? fromBlipId);
      void sendToCallWindow('call-ended', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-state':
      void sendToCallWindow('call-state', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-renegotiate':
      void sendToCallWindow('call-renegotiate', { ...msg, from: msg.from ?? fromBlipId }, { focus: false });
      break;
    case 'call-renegotiate-answer':
      void sendToCallWindow(
        'call-renegotiate-answer',
        { ...msg, from: msg.from ?? fromBlipId },
        { focus: false }
      );
      break;
    default:
      break;
  }
}

function createTcpHandlers() {
  return {
    onMessage: (msg, socket, remoteIp) => {
      if (msg.type === 'ping') {
        socket.write(JSON.stringify({ type: 'pong' }) + '\n');
        return;
      }

      if (handleMeshHandshakeMessage(msg, socket, meshHandshakeContext())) return;

      if (!isSocketAuthenticated(socket)) {
        const compat = tryLegacyCompatAuth({
          session: getSocketSession(socket),
          msg,
          config,
          discovery,
          remoteIp,
        });
        if (!compat.ok) return;
        tcpServer?.registerConnection?.(compat.from, socket);
        discovery?.notePeerCompat?.(compat.from, true);
        discovery?.notePeerChannelCrypto?.(compat.from, false);
      }

      const auth = assertAuthenticated(socket, msg);
      if (!auth.ok) {
        destroySocketTagged(
          socket,
          BlipErrorCode.SOCKET_CLOSED_AUTH_GATE,
          `unauthenticated frame type=${msg?.type} from ${remoteIp}`
        );
        return;
      }

      if (isPeerBlocked(config, auth.from)) return;

      handleTcpPayload(msg, auth.from);
    },
  };
}

async function rollbackNetworking(reasonErr) {
  if (reasonErr) console.error('[BLIP] network bootstrap failed:', reasonErr.message || reasonErr);
  try {
    discovery?.stop();
  } catch {

  }
  discovery = null;
  if (tcpServer) {
    try {
      await tcpServer.close();
    } catch {

    }
    tcpServer = null;
  }
}

async function bootstrapNetworking() {
  const { tcpPort } = resolvePorts(config);
  tcpServer = await createTcpServer(createTcpHandlers(), tcpPort);
  discovery = new Discovery(config, (peers, occupiedIds) => {
    sendToRenderer('peers-updated', { peers, occupiedIds });
  });
  discovery.onSeedPacket = (data) => sendToRenderer('seed-udp', data);
  await discovery.start();
}

function closeAuxiliaryWindows() {
  if (callWindow && !callWindow.isDestroyed()) {
    callWindow.destroy();
    callWindow = null;
  }
  if (groupCallWindow && !groupCallWindow.isDestroyed()) {
    groupCallWindow.destroy();
    groupCallWindow = null;
    groupCallWindowReady = false;
  }
}

async function stopNetwork() {
  discovery?.stop();
  discovery = null;
  for (const s of peerSockets.values()) {
    if (!s.destroyed) s.destroy();
  }
  peerSockets.clear();
  if (tcpServer) {
    await tcpServer.close();
    tcpServer = null;
  }
}

async function restartNetwork() {
  await stopNetwork();
  await bootstrapNetworking();
}

function installTray() {
  const meta = loadAppMetadata();
  const trayLabels =
    config.language === 'ru'
      ? { show: 'Показать', quit: 'Выход' }
      : { show: 'Show', quit: 'Quit' };
  const { trayPath } = refreshAppIcons();
  createTray({
    getMainWindow: () => mainWindow,
    tooltip: `${meta.displayName || 'BLIP'} — local network`,
    labels: trayLabels,
    iconPath: trayPath,
    onQuit: async () => {
      await stopNetwork();
      app.quit();
    },
  });
}

function setupIpc() {
  ipcMain.handle('get-config', () => toPublicConfig(config));

  registerOverlayIpc({
    getConfig: () => config,
    getLastOverlayUnread: () => lastOverlayUnread,
    setLastOverlayUnread: (n) => {
      lastOverlayUnread = n;
    },
    getPeersOnline: () =>
      (discovery?.getPeers?.() || []).filter((p) => p?.online).length,
  });

  ipcMain.handle('save-config', (_, updates) => {
    const prevLang = config?.language;
    const safe = { ...updates };
    delete safe.meshPlusLicenseId;
    delete safe.meshPlusLicenseSig;
    delete safe.meshPlusActivatedAt;
    delete safe.tier;
    delete safe.meshPlusActive;
    delete safe.meshPlusLicenseMasked;
    if (safe.appIconVariant !== undefined) {
      const id = normalizeAppIconVariant(safe.appIconVariant);
      safe.appIconVariant = canUseAppIconVariant(
        { ...config, ...safe },
        id
      )
        ? id
        : 'main';
    }
    const meshActive = resolveEntitlementState({ ...config, ...safe });
    Object.assign(
      safe,
      sanitizePremiumPrefs(config, safe, meshActive)
    );
    config = saveConfig(safe);
    if (safe.appIconVariant !== undefined) refreshAppIcons();
    if (updates?.receiveBetaUpdates !== undefined || updates?.autoDownloadUpdates !== undefined) {
      void configureAutoUpdater(config);
    }
    discovery?.updateConfig(config);
    discovery?.announce();
    if (typeof updates?.language === 'string' && updates.language !== prevLang) {
      installTray();
    }
    const pub = toPublicConfig(config);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('config-updated', pub);
    }
    if (callWindow && !callWindow.isDestroyed()) {
      callWindow.webContents.send('config-updated', pub);
    }
    if (groupCallWindow && !groupCallWindow.isDestroyed()) {
      groupCallWindow.webContents.send('config-updated', pub);
    }
    if (updates?.launchAtLogin !== undefined) {
      applyLaunchAtLogin(config.launchAtLogin);
    }
    if (
      updates?.overlayEnabled !== undefined ||
      updates?.presenceDetectEnabled !== undefined ||
      updates?.presenceShareEnabled !== undefined ||
      updates?.presencePreferGames !== undefined ||
      updates?.presencePinnedApp !== undefined
    ) {
      syncOverlayFeature();
    }
    if (
      updates?.globalShortcutsEnabled !== undefined ||
      updates?.blipId !== undefined
    ) {
      refreshGlobalShortcuts();
    }
    return pub;
  });

  registerMeshPlusIpc({
    getConfig: () => config,
    setConfig: (cfg) => {
      config = cfg;
    },
    getDiscovery: () => discovery,
    refreshAppIcons,
    broadcastTrustState,
    clearActiveProfileGif,
    getMainWindow: () => mainWindow,
    closeAuxiliaryWindows,
    clearPeerSockets: () => {
      for (const s of peerSockets.values()) {
        if (!s.destroyed) s.destroy();
      }
      peerSockets.clear();
    },
    performFactoryReset,
    unregisterGlobalShortcuts,
    sendToRenderer,
  });

  registerAppMetaIpc({
    getConfig: () => config,
    loadAppMetadata,
    refreshAppIcons,
  });

  registerNetworkIpc({
    getConfig: () => config,
    getDiscovery: () => discovery,
    findPeer,
    ensurePeerSocket,
  });

  registerBeaconIpc({
    getConfig: () => config,
    getDiscovery: () => discovery,
    ensurePeerSocket,
  });

  registerFileIpc({
    getConfig: () => config,
    ensurePeerSocket,
    setTrayTransferProgress,
  });

  registerCallIpc({
    getConfig: () => config,
    sendCallToPeer,
    setActiveCallPeer,
    clearActiveCallPeer,
    findPeer,
    ensurePeerSocket,
    sendToCallWindow,
    getCallWindow: () => callWindow,
  });

  registerProfileIpc({
    getConfig: () => config,
    setConfig: (cfg) => {
      config = cfg;
    },
    getDiscovery: () => discovery,
  });

  registerShellIpc({
    getConfig: () => config,
    showDesktopNotification,
  });

  registerWindowIpc({
    getMainWindow: () => mainWindow,
    getCallWindow: () => callWindow,
    getGroupCallWindow: () => groupCallWindow,
    readGroupFromMainWindow,
    sendToGroupCallWindow,
    flushCallWindowQueue,
    flushGroupCallWindowQueue,
    setCallWindowReady: (ready) => {
      callWindowReady = ready;
    },
    setGroupCallWindowReady: (ready) => {
      groupCallWindowReady = ready;
    },
    isVoiceCallActive: () => !!(callWindow && !callWindow.isDestroyed()),
  });
}

function showFatalPortDialog(err) {
  const { tcpPort, udpPort } = resolvePorts(config);
  const extra =
    err?.code === 'EADDRINUSE'
      ? 'Another BLIP window or another program is probably already listening on those ports.'
      : 'Check firewall settings and ensure no orphaned BLIP process is running.';
  dialog.showErrorBox(
    'BLIP — network error',
    [
      `Could not open networking (TCP ${tcpPort}, UDP ${udpPort}).`,
      '',
      extra,
      '',
      'Close the duplicate instance, or run one instance with BLIP_TCP_PORT and BLIP_UDP_PORT set to free ports.',
      '',
      `${err?.code ?? ''} ${err?.message ?? String(err)}`.trim(),
    ].join('\n')
  );
}

function setupMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow = permission === 'media' || permission === 'display-capture';
    callback(allow);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'display-capture';
  });

  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const pick = await resolveDisplaySourceForCallback();
      if (!pick) {
        callback({});
        return;
      }
      callback({ video: pick, audio: false });
    } catch (err) {
      console.warn('[BLIP] display media:', err.message);
      callback({});
    }
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.blip.messenger');
  }

  setupMediaPermissions();

  initConfigPath();
  config = loadConfig();
  initAppTrustState(config);
  const gifPub = getProfileGifPublicState();
  if (
    config.hasProfileGif !== gifPub.hasProfileGif ||
    config.profileGifActiveId !== gifPub.profileGifActiveId
  ) {
    config = saveConfig({
      profileGifActiveId: gifPub.profileGifActiveId,
      hasProfileGif: gifPub.hasProfileGif,
    });
  }
  const meshClamp = premiumResetPatch(config);
  if (meshClamp && !resolveEntitlementState(config)) {
    config = saveConfig(meshClamp);
  }
  const hadMeshKeys = !!(config.meshPrivateKey && config.meshPublicKey);
  config = ensureMeshIdentity(config);
  if (!hadMeshKeys && config.meshPrivateKey) {
    config = saveConfig({
      meshPublicKey: config.meshPublicKey,
      meshPrivateKey: config.meshPrivateKey,
    });
  }

  try {
    await bootstrapNetworking();
  } catch (err) {
    await rollbackNetworking(err);
    showFatalPortDialog(err);
    app.quit();
    return;
  }

  applyLaunchAtLogin(!!config.launchAtLogin);

  setupIpc();
  createWindow();
  broadcastTrustState();
  refreshAppIcons();
  installTray();
  syncOverlayFeature();
  void ensureCallWindow().catch((e) => console.warn('[BLIP] prewarm call window', e));
  void ensureGroupCallWindow().catch((e) => console.warn('[BLIP] prewarm group call window', e));
  setupAutoUpdater(() => mainWindow, () => config);

  if (!app.isPackaged || process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux') {
    try {
      app.setAsDefaultProtocolClient('blip');
    } catch (e) {
      console.warn('[BLIP] protocol client', e?.message || e);
    }
  }

  handleOpenRequestFromArgv(process.argv);
  if (pendingBlipFilePath) {
    deliverBeaconOpenBlipFile(pendingBlipFilePath);
    pendingBlipFilePath = null;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

async function hangupActiveCallIfAny() {
  const peer = activeCallPeerId;
  if (!peer || !config?.blipId) return;
  clearActiveCallPeer();
  try {
    await sendCallToPeer(peer, {
      type: 'call-hangup',
      from: config.blipId,
      to: peer,
    });
  } catch {

  }
}

app.on('before-quit', () => {
  appIsQuitting = true;
  void hangupActiveCallIfAny();
  unregisterGlobalShortcuts();
  destroyTray();
  destroyOverlayWindow();
});

app.on('window-all-closed', () => {
  void stopNetwork();
  if (process.platform !== 'darwin') app.quit();
});
