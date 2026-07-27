import { t, setLang, getLang, applyLangChange, onLangChange, applyI18n } from './i18n.js';
import { createIdGrid } from './grid.js';
import { createChatView, getMessages, addMessage, addMissedCallMessage } from './chat.js';
import { isFavorite, comparePeersFavoriteFirst } from './peer-favorites.js';
import {
  getGroup,
  getGroupsFor,
  groupDisplayName,
  getGroupMessages,
  isGroupMember,
  purgeGroupsFor,
} from './groups.js';
import {
  createGroupAvatarElement,
  setGroupAvatarDataUrl,
  broadcastGroupAvatarToMembers,
  requestGroupAvatarsFromMembers,
} from './group-avatar.js';
import { createProjectsView } from './projects-view.js';
import { handleMeshProjectTcp } from './projects-mesh-wire.js';
import { createGroupCommunityView } from './group-community-view.js';
import {
  createGroupFromUi,
  handleGroupTcpMessage,
  migrateGroupsHostOnPeerOffline,
  sendGroupChatMessage,
  sendGroupPin,
  acceptGroupInvite,
  declineGroupInviteFlow,
} from './groups-wire.js';
import { getPendingGroupInvites } from './group-invites.js';
import {
  leaveVoiceChannel,
  getActiveVoiceChannel,
} from './voice-channel.js';
import { getVoiceChannels } from './groups.js';
import { getVoiceChannelRoster } from './voice-channel-roster.js';
import { logPeerEvent, logDiscoveryEmit } from './network-log.js';
import { createMessageId } from './message-id.js';
import { showSignalLost } from './call.js';
import {
  createAvatarElement,
  regenerateAvatar,
  loadSelfAvatarFromMain,
  setSelfAvatarCache,
  setPeerAvatarDataUrl,
  getSelfAvatarCache,
} from './avatar.js';
import { createTrustedAvatarElement } from './trust-ui.js';
import { isDeveloperMode } from './dev-mode.js';
import { buildSettingsAboutPanel as buildAboutPanelView } from './settings-panels/about.js';
import { buildSettingsDeveloperPanel as buildDeveloperPanelView } from './settings-panels/developer.js';
import { openAvatarCropDialog } from './avatar-crop-dialog.js';
import {
  sounds,
  setSoundPrefs,
} from './audio.js';
import {
  sendChatFile,
  fileToDataUrl,
  handleFileTransferTcp,
  abortFileTransfer,
} from './file-transfer.js';
import {
  sendGroupChatFile,
  completeIncomingGroupFile,
  applyStashedGroupFile,
} from './group-file-transfer.js';
import {
  trackTransferStart,
  trackTransferProgress,
  trackTransferEnd,
  refreshTransferHubI18n,
} from './file-transfer-hub.js';
import {
  buildThemedSelect,
  fillSettingsDropdown,
  buildSettingsField,
  buildSettingsFieldWithHint,
  buildPanelTitleRow,
  buildSectionSubtitleRow,
  buildSettingsLabelRow,
  createPixelToggle,
  createPixelHintIcon,
  copyTextToClipboard,
  createSettingsListPanel,
} from './settings-ui.js';
import { appendMeshPlusBadgeToNameRow } from './mesh-plus.js';
import { buildSettingsMeshPlusPanel } from './mesh-plus-settings.js';
import { recordCallStarted, recordFileSent, recordPeersOnline, setAchievementConfigProvider } from './session-stats.js';
import { buildSettingsAchievementsPanel } from './achievements-settings-panel.js';
import { syncAchievements } from './achievements-tracker.js';
import { buildAppearanceSection } from './settings-panels/appearance.js';
import { buildSettingsLanguagePanel as buildLanguagePanelView } from './settings-panels/language.js';
import { buildSettingsNotificationsPanel as buildNotificationsPanelView } from './settings-panels/notifications.js';
import { buildSettingsTransferPanel as buildTransferPanelView } from './settings-panels/transfer.js';
import { buildSettingsPrivacyPanel as buildPrivacyPanelView } from './settings-panels/privacy.js';
import { buildSettingsSoundPanel as buildSoundPanelView } from './settings-panels/sound.js';
import { buildSettingsCallPanel as buildCallPanelView } from './settings-panels/call.js';
import { buildSettingsSystemPanel as buildSystemPanelView } from './settings-panels/system.js';
import { buildSettingsNetworkPanel as buildNetworkPanelView } from './settings-panels/network.js';
import { buildSettingsShortcutsPanel as buildShortcutsPanelView } from './settings-panels/shortcuts.js';
import { buildSettingsUpdatesPanel as buildUpdatesPanelView } from './settings-panels/updates.js';
import {
  startClipboardSync,
  stopClipboardSync,
  handleClipboardPush,
  formatClipboardToast,
} from './clipboard-sync.js';
import { formatPeerDisplayName } from './peer-labels.js';
import { openMeshLabelDialog } from './mesh-label-dialog.js';
import { showAppToast } from './toasts.js';
import { formatBlipErrorToast } from './blip-error-hints.js';
import { swapMainView, swapPanelContent, isUiMotionEnabled } from './ui-motion.js';
import { createContextMenus } from './context-menus.js';
import { createUpdateChecker } from './update-checker.js';
import { initBeaconMesh, refreshBeaconMesh, handleBeaconTcp } from './beacon-mesh.js';
import { initIdleAway } from './idle-away.js';
import { renderBeaconView } from './beacon-ui.js';
import { setDefaultToastDurationMs } from './toast-config.js';
import {
  clearRendererLocalStorage,
  resetRendererMemoryStores,
} from './factory-reset-local.js';
import { createPeerProfileView } from './peer-profile-view.js';
import { buildSettingsProfilePanel as buildSettingsProfilePanelView } from './settings-profile-panel.js';
import { renderSettingsNavAside as renderSettingsNavGroups } from './settings-nav.js';
import {
  ingestPeerProfileGifDataUrl,
  getPeerProfileGifDisplayUrl,
  isPeerProfileGifIngesting,
  peerHasCachedProfileGif,
} from './peer-gif-cache.js';
import {
  initPeerTrust,
  applyTrustFromConfig,
  isBlocked,
  blockPeer,
  unblockPeer,
  getBlockedPeerIds,
} from './peer-trust.js';
import {
  applyAppearance,
  listenReducedMotion,
} from './appearance.js';
import { initReactiveWallpaper, applyReactiveWallpaperConfig } from './reactive-wallpaper.js';
import { createViewRouter } from './view-router.js';
import { createPeersView } from './peers-view.js';
import { createMeshPulse } from './mesh-pulse.js';
import { createChatHubView } from './chat-hub-view.js';

async function broadcastCustomAvatar() {
  const dataUrl = getSelfAvatarCache();
  if (!dataUrl || !state.config?.blipId) return;
  const targets = state.peers.filter((p) => p.online && !isBlocked(p.blipId));
  for (const p of targets) {
    try {
      await api.sendTcpMessage({
        type: 'avatar-share',
        to: p.blipId,
        from: state.config.blipId,
        dataUrl,
      });
    } catch {

    }
  }
}

async function broadcastProfileGif() {
  const dataUrl = await window.blip?.getProfileGifShareUrl?.();
  if (!dataUrl || !state.config?.blipId) return;
  const targets = state.peers.filter((p) => p.online && !isBlocked(p.blipId));
  for (const p of targets) {
    try {
      await api.sendTcpMessage({
        type: 'profile-gif-share',
        to: p.blipId,
        from: state.config.blipId,
        dataUrl,
      });
    } catch {

    }
  }
}

async function requestPeerProfileGif(blipId) {
  if (!state.config?.blipId || !blipId) return;
  try {
    await api.sendTcpMessage({
      type: 'profile-gif-request',
      to: blipId,
      from: state.config.blipId,
    });
  } catch {

  }
}

function restartClipboardSync() {
  stopClipboardSync();
  startClipboardSync({
    getConfig: () => state.config,
    getPeers: () => state.peers,
    getActivePeer: () => state.activePeer,
    sendTcpMessage: (payload) => api.sendTcpMessage(payload),
  });
}

let state = {
  config: null,
  peers: [],
  occupiedIds: [],
  view: 'grid',
  activePeer: null,
  activeGroup: null,
  chatViews: new Map(),
  groupChatViews: new Map(),

  settingsSection: null,

  profilePeerId: null,

  profileReturn: null,
};

let lastUpdateStatus = null;

let rootEl = null;
let mainContent = null;
let gridComponent = null;
let api = null;
let appearanceListenerDispose = null;
let openPeerProfileFromUiForMenus = () => {};
const runPeerPingForMenusRef = { fn: async () => {} };
const closeGroupChatUiRef = { fn: (_groupId) => {} };
let peerForContextMenu = () => ({ blipId: 0 });
let showGroupContextMenu = () => {};
let showPeerContextMenu = () => {};

const viewRouter = createViewRouter({
  getState: () => state,
  getApi: () => api,
  getMainContent: () => mainContent,
  setMainContent: (el) => {
    mainContent = el;
  },
  runSettingsPanelCleanup: () => runSettingsPanelCleanup(),
  renderView: (view, opts) => renderView(view, opts),
  peerBlipIdEquals,
});

const {
  unreadByPeer,
  unreadByGroup,
  resolveMainContent,
  mountMainPanel,
  bumpInviteUnread,
  clearInviteUnread,
  bumpUnread,
  clearUnread,
  updateNavUnreadBadge,
  updateNavActive,
  createNav,
} = viewRouter;

/** @type {ReturnType<typeof createPeerProfileView>} */
let peerProfileView;

const peersTyping = new Set();

const meshPulse = createMeshPulse({
  getState: () => state,
  getMainContent: () => mainContent,
  t,
  isBlocked,
  showAppToast,
  sounds,
});
runPeerPingForMenusRef.fn = meshPulse.runPeerPing;

async function openCallOutgoing(peerId, video = false) {
  if (!window.blip?.openCallOutgoing) return;
  const id = Number(peerId);
  const peer = state.peers.find((p) => Number(p.blipId) === id);
  if (!peer?.online) {
    const toast = formatBlipErrorToast(202);
    showAppToast({
      title: toast.title,
      body: toast.body,
      durationMs: 4500,
    });
    return;
  }
  recordCallStarted();
  try {
    const result = await window.blip.openCallOutgoing({ peerId: id, video });
    if (!result?.ok) {
      const code = result?.errorCode ?? result?.error ?? 999;
      const blocked = Number(code) === 111 || /unencrypted_mesh_disabled/i.test(String(result?.error || ''));
      if (blocked) {
        showAppToast({
          title: t('peers.unencrypted_blocked'),
          body: formatBlipErrorToast(111).hint,
          variant: 'danger',
          durationMs: 5000,
        });
        return;
      }
      const toast = formatBlipErrorToast(code);
      showAppToast({
        title: toast.title,
        body: toast.body,
        variant: 'danger',
        durationMs: 5000,
      });
    }
  } catch (e) {
    console.error('[BLIP] openCallOutgoing', e);
    const blocked =
      Number(e?.blipCode) === 111 || /unencrypted_mesh_disabled/i.test(e?.message || '');
    if (blocked) {
      showAppToast({
        title: t('peers.unencrypted_blocked'),
        body: formatBlipErrorToast(111).hint,
        variant: 'danger',
        durationMs: 5000,
      });
      return;
    }
    const toast = formatBlipErrorToast(e);
    showAppToast({
      title: toast.title,
      body: toast.body,
      variant: 'danger',
      durationMs: 5000,
    });
  }
}

function showMessageToast(peerId, preview) {
  const peer = state.peers.find((p) => p.blipId === peerId);
  const label = formatPeerDisplayName(peer, peerId);
  if (!state.config?.doNotDisturb) sounds.notify();

  showAppToast({
    title: `${t('toast.new_message')} · ${label}`,
    body: preview || '',
    durationMs: 9000,
    actions: [
      {
        label: t('toast.open_chat'),
        primary: true,
        onClick: () => openChat(peerId),
      },
    ],
  });
  tryShowDesktopMessageNotification(peerId, preview);
}

function tryShowDesktopMessageNotification(peerId, preview) {
  if (state.config?.doNotDisturb) return;
  if (state.config?.desktopNotifications === false) return;
  if (!window.blip?.showMessageNotification) return;
  const peer = state.peers.find((p) => p.blipId === peerId);
  const label = formatPeerDisplayName(peer, peerId);
  const title = `${t('toast.new_message')} · ${label}`;
  void window.blip.showMessageNotification({
    peerId,
    title,
    body: typeof preview === 'string' ? preview : '',
  });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function createTitleBar() {
  const bar = document.createElement('div');
  bar.className = 'title-bar';
  bar.innerHTML = `
    <span class="title-logo" data-i18n="app.title">${t('app.title')}</span>
    <span class="title-spacer"></span>
    <button type="button" class="win-btn" id="btn-min" aria-label="Minimize">—</button>
    <button type="button" class="win-btn" id="btn-max" aria-label="Maximize">□</button>
    <button type="button" class="win-btn win-close" id="btn-close" aria-label="Close">×</button>
  `;
  bar.querySelector('#btn-min')?.addEventListener('click', () => window.blip.windowMinimize());
  bar.querySelector('#btn-max')?.addEventListener('click', () => window.blip.windowMaximize());
  bar.querySelector('#btn-close')?.addEventListener('click', () => window.blip.windowClose());
  return bar;
}

function peerPresenceClass(peer) {
  if (!peer?.online) return 'offline';
  if (peer.presence === 'away') return 'away';
  if (peer.presence === 'busy') return 'busy';
  return 'online';
}

function peerStatusTooltip(peer) {
  const base =
    peerPresenceClass(peer) === 'away'
      ? t('peers.away')
      : peerPresenceClass(peer) === 'busy'
        ? t('peers.busy')
        : peer.online
          ? t('peers.online')
          : t('peers.offline');
  const custom = (peer?.presenceText || '').trim();
  return custom && peer.online ? `${base} · ${custom}` : base;
}

function ensureGroupChatView(groupId) {
  if (!state.groupChatViews.has(groupId)) {
    const group = getGroup(groupId);
    if (!group) return null;
    const view = createGroupCommunityView(
      group,
      state.config,
      (gid, msg) => sendGroupChatMessage(api, state.config, gid, msg),
      () => {
        state.activeGroup = null;
        void leaveVoiceChannel();
        renderView('chat');
      },
      (e) => {
        const fresh = getGroup(groupId);
        if (fresh) showGroupContextMenu(e, fresh);
      },
      async (gid, file, onUiProgress) => {
        const g = getGroup(gid);
        if (!g) return;
        const broadcast = (msg) => sendGroupChatMessage(api, state.config, gid, msg);
        await sendGroupChatFile(api, state.config, g, file, broadcast, {
          onPeerStart: (to, transferId) => {
            trackTransferStart(to, transferId, {
              name: file.name,
              size: file.size,
              direction: 'out',
              cancellable: true,
              onCancel: () => void abortFileTransfer(api, state.config, to, transferId),
            });
          },
          onPeerEnd: (to, transferId) => trackTransferEnd(to, transferId),
          onProgress: (pct, to, transferId) => {
            onUiProgress?.();
            trackTransferProgress(to, transferId, pct, {
              name: file.name,
              size: file.size,
              direction: 'out',
              cancellable: true,
              onCancel: () => void abortFileTransfer(api, state.config, to, transferId),
            });
          },
        });
      },
      api,
      {
        onPin: (gid, payload) => sendGroupPin(api, state.config, gid, payload),
        getForwardTargets: () =>
          state.peers
            .filter((p) => p.online && !isBlocked(p.blipId))
            .map((p) => ({
              id: p.blipId,
              label: formatPeerDisplayName(p, p.blipId),
            })),
        onForwardToPeer: async (targetId, { forwardFrom }) => {
          ensureChatView(targetId);
          const outMsg = {
            id: createMessageId(),
            from: state.config.blipId,
            to: targetId,
            text: '',
            timestamp: Date.now(),
            outgoing: true,
            forwardFrom,
          };
          addMessage(targetId, outMsg);
          await api.sendTcpMessage({
            to: targetId,
            type: 'message',
            text: outMsg.text,
            id: outMsg.id,
            timestamp: outMsg.timestamp,
            forwardFrom: outMsg.forwardFrom,
          });
          state.chatViews.get(targetId)?.renderMessages?.();
        },
      }
    );
    state.groupChatViews.set(groupId, view);
  }
  return state.groupChatViews.get(groupId);
}

function openGroupChat(groupId) {
  const group = getGroup(groupId);
  if (!group || !isGroupMember(group, state.config.blipId)) return;
  state.activeGroup = groupId;
  state.activePeer = null;
  state.view = 'chat';
  unreadByGroup.delete(groupId);
  ensureGroupChatView(groupId);
  void requestGroupAvatarsFromMembers(groupId, api, state.config.blipId);
  if (mainContent?.isConnected) renderView('chat');
  else render();
}

let projectsViewInstance = null;

let settingsPanelCleanup = null;

function ensureProjectsView() {
  if (!projectsViewInstance || !projectsViewInstance.el?.parentElement) {
    projectsViewInstance?.destroy?.();
    projectsViewInstance = createProjectsView(
      () => state.config,
      api,
      () =>
        state.peers
          .filter((p) => p.online && !isBlocked(p.blipId))
          .map((p) => p.blipId),
      {
        onOpenMeshPlus: () => {
          state.settingsSection = 'mesh_plus';
          renderView('settings');
        },
      }
    );
  }
  return projectsViewInstance;
}

function normalizeBlipId(id) {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

function peerBlipIdEquals(a, b) {
  const na = normalizeBlipId(a);
  const nb = normalizeBlipId(b);
  return na != null && nb != null && na === nb;
}

function findPeerByBlipId(id) {
  const nid = normalizeBlipId(id);
  if (nid == null) return undefined;
  return state.peers.find((p) => normalizeBlipId(p.blipId) === nid);
}

function refreshLiveChat(peerId) {
  const id = normalizeBlipId(peerId);
  if (id == null) return;
  const chat = state.chatViews.get(id);
  if (!chat?.el?.isConnected) return;
  if (state.view !== 'chat' || state.activePeer !== id) return;
  chat.renderMessages?.();
  chat.scrollToBottom?.();
}

const CHAT_VIEW_API_VERSION = 3;

function ensureChatView(peerId) {
  const id = normalizeBlipId(peerId);
  if (id == null) return null;
  const stale = state.chatViews.get(id);
  if (stale && stale.apiVersion !== CHAT_VIEW_API_VERSION) {
    stale.destroy?.();
    state.chatViews.delete(id);
  }
  if (!state.chatViews.has(id)) {
    const peer = findPeerByBlipId(id);
    let chat;
    try {
      chat = createChatView(
      id,
      () => state.config,
      (to, msg) =>
        api.sendTcpMessage({
          to,
          type: 'message',
          text: msg.text,
          id: msg.id,
          timestamp: msg.timestamp,
          attachment: msg.attachment,
          replyTo: msg.replyTo,
          forwardFrom: msg.forwardFrom,
        }),
      () => {
        state.activePeer = null;
        renderView('chat');
      },
      (to, active) =>
        api.sendTcpMessage({
          type: 'typing',
          to,
          active,
        }),
      (to, payload) =>
        api.sendTcpMessage({
          type: 'reaction',
          to,
          messageId: payload.messageId,
          emoji: payload.emoji,
          add: payload.add,
        }),
      async (to, file, onProgress) => {
        const xfer = { transferId: createMessageId() };
        const abortXfer = () =>
          void abortFileTransfer(api, state.config, to, xfer.transferId);
        trackTransferStart(to, xfer.transferId, {
          name: file.name,
          size: file.size,
          direction: 'out',
          cancellable: true,
          onCancel: abortXfer,
        });
        try {
          const result = await sendChatFile(
            api,
            state.config,
            to,
            file,
            (pct, extra) => {
              trackTransferProgress(to, xfer.transferId, pct, {
                name: file.name,
                size: file.size,
                direction: 'out',
                speedBps: extra?.speedBps,
                cancellable: true,
                onCancel: abortXfer,
              });
              onProgress?.(pct, extra);
            },
            { transferId: xfer.transferId }
          );
          if (result.transferId) xfer.transferId = result.transferId;
          if (result?.ok !== false) recordFileSent();
          if (result.chunked) {
            const dataUrl = await fileToDataUrl(file);
            result.attachment = { ...result.attachment, dataUrl };
          }
          return result;
        } catch (err) {
          if (err?.message === 'cancelled') throw err;
          throw err;
        } finally {
          trackTransferEnd(to, xfer.transferId);
        }
      },
      (e, peerId) => showPeerContextMenu(e, peerId, { hideMessage: true }),
      (to, payload) =>
        api.sendTcpMessage({
          type: 'message-pin',
          to,
          messageId: payload.messageId,
          pinned: payload.pinned !== false,
        }),
      (to, payload) =>
        api.sendTcpMessage({
          type: 'message-edit',
          to,
          messageId: payload.messageId,
          text: payload.text,
          editedAt: payload.editedAt,
        }),
      (profilePeerId) => openPeerProfileFromUi(profilePeerId),
      () => findPeerByBlipId(id),
      () =>
        state.peers
          .filter((p) => p.online && !isBlocked(p.blipId) && p.blipId !== id)
          .map((p) => ({
            id: p.blipId,
            label: formatPeerDisplayName(p, p.blipId),
          }))
    );
    } catch (err) {
      console.error('[BLIP] createChatView', id, err);
      return null;
    }
    if (peer) chat.setPeerName(formatPeerDisplayName(peer, id));
    state.chatViews.set(id, chat);
  }
  return state.chatViews.get(id);
}

function renderDialView() {
  const wrap = document.createElement('div');
  wrap.className = 'view dial-view';

  const center = document.createElement('div');
  center.className = 'dial-center';

  const title = document.createElement('h2');
  title.className = 'section-title dial-title';
  title.dataset.i18n = 'dial.title';
  title.textContent = t('dial.title');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input dial-input';
  input.maxLength = 2;
  input.placeholder = t('dial.placeholder');
  input.dataset.i18nPlaceholder = 'dial.placeholder';
  input.inputMode = 'numeric';

  const actions = document.createElement('div');
  actions.className = 'dial-actions';

  const msgBtn = document.createElement('button');
  msgBtn.type = 'button';
  msgBtn.className = 'btn btn-accent';
  msgBtn.dataset.i18n = 'dial.message';
  msgBtn.textContent = t('dial.message');

  const callBtn = document.createElement('button');
  callBtn.type = 'button';
  callBtn.className = 'btn btn-accent';
  callBtn.dataset.i18n = 'dial.call';
  callBtn.textContent = t('dial.call');

  const dialError = document.createElement('p');
  dialError.className = 'hint dial-error hidden';
  dialError.dataset.i18n = 'dial.invalid_id';
  dialError.textContent = t('dial.invalid_id');

  function resolvePeerId() {
    const raw = input.value.trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 64) return 'invalid';
    return n;
  }

  function showDialError() {
    dialError.classList.remove('hidden');
  }

  function hideDialError() {
    dialError.classList.add('hidden');
  }

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 2);
    if (input.value.length >= 2) {
      const r = resolvePeerId();
      if (r === 'invalid') showDialError();
      else hideDialError();
    } else {
      hideDialError();
    }
  });

  function findPeer(id) {
    return state.peers.find((p) => p.blipId === id && p.online);
  }

  msgBtn.addEventListener('click', () => {
    const id = resolvePeerId();
    if (id === 'invalid') {
      showDialError();
      return;
    }
    if (!id) return;
    hideDialError();
    if (!findPeer(id)) {
      showSignalLost(wrap);
      return;
    }
    openChat(id);
  });

  callBtn.addEventListener('click', () => {
    const id = resolvePeerId();
    if (id === 'invalid') {
      showDialError();
      return;
    }
    if (!id) return;
    hideDialError();
    if (!findPeer(id)) {
      showSignalLost(wrap);
      return;
    }
    openCallOutgoing(id, false);
  });

  actions.appendChild(msgBtn);
  actions.appendChild(callBtn);
  const dialBody = document.createElement('div');
  dialBody.className = 'dial-body';
  dialBody.appendChild(input);
  dialBody.appendChild(dialError);
  dialBody.appendChild(actions);

  center.appendChild(title);
  center.appendChild(dialBody);
  wrap.appendChild(center);
  return wrap;
}

async function promptMeshLabel(peer) {
  const fallback = peer?.displayName || `BLIP-${peer.blipId}`;
  const saved = await openMeshLabelDialog(peer.blipId, fallback);
  if (saved === null) return;

  const chat = state.chatViews.get(peer.blipId);
  if (chat) chat.setPeerName(formatPeerDisplayName(peer));
  if (state.view === 'peers') renderView('peers');
  if (state.view === 'profile') peerProfileView.syncPeerProfilePage();
  if (state.view === 'chat' && !state.activePeer) renderView('chat');

  showAppToast({
    title: t('peers.mesh_label_saved'),
    body: saved ? saved : t('peers.mesh_label_removed'),
    durationMs: 4000,
  });
}

function getPeerProfileHooks(peer) {
  return {
    selfBlipId: state.config?.blipId ?? null,
    allowUnencryptedMesh: state.config?.allowUnencryptedMesh !== false,
    isBlocked: (id) => isBlocked(id),
    presenceClass: peerPresenceClass,
    statusTooltip: peerStatusTooltip,
    onMessage: () => openChatFromProfile(peer.blipId),
    onCall: () => {
      if (peer.online) openCallOutgoing(peer.blipId, false);
    },
    onBlock: () => {
      if (isBlocked(peer.blipId)) {
        unblockPeer(peer.blipId);
        showAppToast({ title: t('peers.unblock_done'), durationMs: 3000 });
      } else {
        blockPeer(peer.blipId);
        showAppToast({ title: t('peers.block_done'), durationMs: 3000 });
      }
      if (state.view === 'profile' && peerBlipIdEquals(state.profilePeerId, peer.blipId)) {
        peerProfileView.syncPeerProfilePage();
      }
      if (state.view === 'peers') renderView('peers');
      if (state.view === 'chat' && state.activePeer === peer.blipId) {
        state.activePeer = null;
        renderView('chat');
      }
    },
    onPing: () => meshPulse.runPeerPing(peer),
  };
}

({
  peerForContextMenu,
  showGroupContextMenu,
  showPeerContextMenu,
} = createContextMenus({
  getState: () => state,
  getApi: () => api,
  findPeerByBlipId,
  normalizeBlipId,
  renderView,
  openGroupChat,
  closeGroupChatUi: (groupId) => closeGroupChatUiRef.fn(groupId),
  openPeerProfileFromUi: (peer) => openPeerProfileFromUiForMenus(peer),
  openChat,
  openCallOutgoing,
  promptMeshLabel,
  runPeerPing: (peer) => runPeerPingForMenusRef.fn(peer),
  createGroupFromUi,
}));

peerProfileView = createPeerProfileView({
  getState: () => state,
  findPeerByBlipId,
  normalizeBlipId,
  peerBlipIdEquals,
  resolvePeerStub: peerForContextMenu,
  getPeerProfileHooks,
  resolveMainContent,
  mountMainPanel,
  renderView,
  render,
  requestPeerProfileGif,
  runMeshPulseRound: meshPulse.runMeshPulseRound,
});

const {
  openPeerProfileFromUi,
  leavePeerProfilePage,
  renderPeerProfileView,
  clearProfileNavigationState,
  disposeProfilePageIfMounted,
  notifyProfilePeerUpdated,
  refreshOpenProfilePageIfNeeded,
} = peerProfileView;

openPeerProfileFromUiForMenus = openPeerProfileFromUi;

const peersView = createPeersView({
  getState: () => state,
  getMainContent: () => mainContent,
  getPeersTyping: () => peersTyping,
  t, isBlocked, isFavorite, comparePeersFavoriteFirst, createTrustedAvatarElement,
  createPixelHintIcon, formatPeerDisplayName, appendMeshPlusBadgeToNameRow,
  peerPresenceClass, peerStatusTooltip,
  formatPeerSubline: (peer) => meshPulse.formatPeerSubline(peer),
  getPeerLatency: (id) => meshPulse.peerLatencyMs.get(id),
  openPeerProfile: (peer) => openPeerProfileFromUi(peer),
  showPeerContextMenu: (event, peer) => showPeerContextMenu(event, peer),
  openChat,
});

const chatHubView = createChatHubView({
  getState: () => state,
  getMainContent: () => mainContent,
  t, isBlocked, isFavorite, getPendingGroupInvites,
  acceptGroupInvite: (invite) => acceptGroupInvite(api, state.config, invite),
  declineGroupInvite: (invite) => declineGroupInviteFlow(api, state.config, invite),
  clearInviteUnread, getGroupsFor, getGroupMessages, groupDisplayName, getVoiceChannels,
  getVoiceChannelRoster, createGroupAvatarElement, createAvatarElement, getMessages,
  formatPeerDisplayName, findPeerByBlipId, normalizeBlipId, peerPresenceClass,
  peerStatusTooltip,
  formatPeerSubline: (peer) => meshPulse.formatPeerSubline(peer),
  getPeerLatency: (id) => meshPulse.peerLatencyMs.get(id),
  peerHasCachedProfileGif,
  getUnreadByGroup: (id) => unreadByGroup.get(id) || 0,
  getUnreadByPeer: (id) => unreadByPeer.get(id) || 0,
  openGroupChat, openChat,
  openPeerProfile: (peer) => openPeerProfileFromUi(peer),
  showGroupContextMenu: (event, group) => showGroupContextMenu(event, group),
  showPeerContextMenu: (event, peer) => showPeerContextMenu(event, peer),
  renderView,
});

function openSettingsToSection(sectionId, scrollSelector = null) {
  clearProfileNavigationState();
  state.activePeer = null;
  state.activeGroup = null;
  const allowed = getSettingsSectionIds();
  state.settingsSection = allowed.includes(sectionId) ? sectionId : null;
  state.view = 'settings';
  if (mainContent?.isConnected) {
    renderView('settings');
  } else {
    render();
  }
  if (!scrollSelector || !mainContent) return;
  requestAnimationFrame(() => {
    mainContent
      .querySelector(scrollSelector)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function openChatFromProfile(peerId) {
  void openChat(peerId);
}

function closeGroupChatUi(groupId) {
  const active = getActiveVoiceChannel();
  if (active?.groupId === groupId) void leaveVoiceChannel();
  state.groupChatViews.get(groupId)?.destroy?.();
  state.groupChatViews.delete(groupId);
  if (state.activeGroup === groupId) {
    state.activeGroup = null;
    if (state.view === 'chat') renderView('chat');
  }
}

closeGroupChatUiRef.fn = closeGroupChatUi;

function buildAvatarSettingsSection() {
  const block = document.createElement('div');
  block.className = 'settings-avatar-wrap';
  if (!state.config?.blipId) return block;

  const head = buildSettingsLabelRow('settings.avatar_title', 'settings.avatar_hint');
  head.classList.add('settings-avatar-head');
  block.appendChild(head);

  const row = document.createElement('div');
  row.className = 'settings-avatar-row';

  const preview = document.createElement('div');
  preview.className = 'settings-avatar-preview';

  function refreshPreview() {
    preview.innerHTML = '';
    preview.appendChild(
      createAvatarElement(state.config.blipId, 4, { selfBlipId: state.config.blipId })
    );
  }
  refreshPreview();
  row.appendChild(preview);

  const col = document.createElement('div');
  col.className = 'settings-avatar-actions';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
  fileInput.className = 'settings-avatar-file-input';
  fileInput.id = 'settings-avatar-file';

  const uploadLabel = document.createElement('label');
  uploadLabel.htmlFor = fileInput.id;
  uploadLabel.className = 'btn btn-accent settings-avatar-upload-label';
  uploadLabel.dataset.i18n = 'settings.avatar_upload';
  uploadLabel.textContent = t('settings.avatar_upload');

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const dataUrl = await openAvatarCropDialog(file);
      if (!dataUrl) return;
      const r = await window.blip.saveAvatar?.(dataUrl);
      if (!r?.ok) throw new Error(r?.error || 'save_failed');
      setSelfAvatarCache(dataUrl);
      state.config.customAvatar = true;
      refreshPreview();
      window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
      void broadcastCustomAvatar();
      showAppToast({ title: t('settings.avatar_saved'), durationMs: 3000 });
    } catch (e) {
      showAppToast({
        title: t('settings.avatar_failed'),
        body: e?.message || '',
        variant: 'danger',
        durationMs: 4500,
      });
    }
  });

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn btn-lang';
  removeBtn.dataset.i18n = 'settings.avatar_remove';
  removeBtn.textContent = t('settings.avatar_remove');
  removeBtn.addEventListener('click', async () => {
    await window.blip.clearAvatar?.();
    setSelfAvatarCache(null);
    state.config.customAvatar = false;
    refreshPreview();
    window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
    void broadcastCustomAvatar();
  });

  const regenBtn = document.createElement('button');
  regenBtn.type = 'button';
  regenBtn.className = 'btn btn-lang';
  regenBtn.dataset.i18n = 'settings.avatar_regenerate';
  regenBtn.textContent = t('settings.avatar_regenerate');
  regenBtn.addEventListener('click', async () => {
    if (state.config.customAvatar) await window.blip.clearAvatar?.();
    setSelfAvatarCache(null);
    state.config.customAvatar = false;
    regenerateAvatar(state.config.blipId);
    refreshPreview();
    window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
  });

  col.appendChild(fileInput);
  col.appendChild(uploadLabel);
  col.appendChild(removeBtn);
  col.appendChild(regenBtn);
  row.appendChild(col);
  block.appendChild(row);

  return block;
}

function buildAppearancePanelWithTitle() {
  const wrap = document.createElement('div');
  wrap.className = 'settings-panel';
  appendSettingsPanelHeader(wrap, 'settings.section_appearance');
  wrap.appendChild(
    buildAppearanceSection({
      getState: () => state,
      saveConfig: (patch) => api.saveConfig(patch),
    }),
  );
  return wrap;
}

function applySoundPrefsFromConfig(cfg = state.config) {
  setSoundPrefs({
    enabled: cfg?.uiSoundsEnabled !== false && cfg?.doNotDisturb !== true,
    volume: typeof cfg?.uiSoundsVolume === 'number' ? cfg.uiSoundsVolume : 1,
    soundPack: cfg?.uiSoundPack,
    melodyPack: cfg?.uiMelodyPack,
  });
}

const {
  showUpdateStatusToast,
  checkUpdatesViaGithub,
  runStartupUpdateCheck,
} = createUpdateChecker({
  getState: () => state,
  renderView,
  t,
  showAppToast,
});

export function navigateToView(view) {
  viewRouter.navigateToView(view);
}

export async function toggleDoNotDisturb() {
  if (!state.config?.blipId) return;
  const next = !state.config.doNotDisturb;
  state.config = await api.saveConfig({ doNotDisturb: next });
  applySoundPrefsFromConfig(state.config);
  if (state.view === 'settings') renderView('settings');
  showAppToast({
    title: next ? t('settings.notifications_dnd') : t('toast.dnd_off_title'),
    body: next ? t('settings.notifications_dnd_hint') : t('toast.dnd_off_body'),
    durationMs: 3500,
  });
}

function setupGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (!state.config?.blipId) return;
    const tag = e.target?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.altKey && !e.ctrlKey && !e.metaKey && !typing) {
      const views = { 1: 'dial', 2: 'peers', 3: 'chat', 4: 'settings' };
      const next = views[e.key];
      if (next) {
        e.preventDefault();
        if (next === 'settings') {
          state.settingsSection = null;
        }
        if (next === 'chat' && state.view === 'chat' && state.activePeer) {
          state.activePeer = null;
        }
        renderView(next);
        return;
      }
    }

    if (e.ctrlKey && e.key === ',' && !e.altKey && !e.metaKey) {
      e.preventDefault();
      state.settingsSection = null;
      renderView('settings');
      return;
    }

    if (e.ctrlKey && (e.key === 'f' || e.key === 'F') && !e.altKey && !e.metaKey) {
      if (state.view === 'chat' && state.activePeer != null) {
        const search = mainContent?.querySelector('.chat-search-input');
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
      }
    }

    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !typing) {
      if (state.view === 'profile' && state.profilePeerId != null) {
        e.preventDefault();
        leavePeerProfilePage();
        return;
      }
      if (state.view === 'chat' && (state.activePeer || state.activeGroup)) {
        e.preventDefault();
        state.activePeer = null;
        state.activeGroup = null;
        renderView('chat');
      }
    }
  });
}

function getSettingsSectionIds() {
  const ids = [
    'profile',
    'achievements',
    'mesh_plus',
    'language',
    'notifications',
    'privacy',
    'sound',
    'shortcuts',
    'call',
    'transfer',
    'appearance',
    'network',
    'system',
    'updates',
    'developer',
    'about',
  ];
  let out = ids;
  if (!isDeveloperMode(state.config)) {
    out = out.filter((id) => id !== 'developer');
  }
  return out;
}

function refreshSettingsAfterDeveloperUnlock() {
  if (state.settingsSection === 'developer' && !isDeveloperMode(state.config)) {
    state.settingsSection = 'about';
  }
  if (state.view === 'settings') renderView('settings');
}

function buildSettingsProfilePanel() {
  return buildSettingsProfilePanelView(state, api, {
    broadcastCustomAvatar,
    broadcastProfileGif,
    onChangeId: () => showGridView(true),
  });
}

function buildSettingsLanguagePanel() {
  return buildLanguagePanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
    renderSettings: () => renderView('settings'),
  });
}

function buildSettingsNotificationsPanel() {
  return buildNotificationsPanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
    applySoundPrefs: applySoundPrefsFromConfig,
  });
}

function buildSettingsPrivacyPanel() {
  return buildPrivacyPanelView({
    getState: () => state,
    renderPeersIfOpen: () => {
      if (state.view === 'peers') renderView('peers');
    },
  });
}

function buildSettingsSoundPanel() {
  return buildSoundPanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
    applySoundPrefs: applySoundPrefsFromConfig,
  });
}

function buildSettingsTransferPanel() {
  return buildTransferPanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
  });
}

function buildSettingsCallPanel() {
  return buildCallPanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
  });
}

function buildSettingsNetworkPanel() {
  return buildNetworkPanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
    restartClipboardSync,
    renderProjectsIfOpen: () => {
      if (state.view === 'projects') renderView('projects');
    },
  });
}

function buildSettingsShortcutsPanel() {
  return buildShortcutsPanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
  });
}

function buildSettingsDeveloperPanel() {
  return buildDeveloperPanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
    syncAchievements,
    refreshBeaconMesh,
    onBeaconChanged: (enabled) => {
      if (!enabled && state.view === 'beacon') {
        state.view = 'peers';
      }
      render();
    },
    onProjectsChanged: (enabled) => {
      if (!enabled) {
        projectsViewInstance?.destroy?.();
        projectsViewInstance = null;
      }
      render();
    },
    onFactoryReset: () => applyFactoryReset(),
    onDeveloperHidden: (cfg) => {
      state.config = cfg;
      if (state.settingsSection === 'developer') state.settingsSection = 'about';
      refreshSettingsAfterDeveloperUnlock();
    },
    renderSettingsIfOpen: () => {
      if (state.view === 'settings') renderView('settings');
    },
    renderPeersIfOpen: () => {
      if (state.view === 'peers') renderView('peers');
    },
  });
}

async function applyFactoryReset() {
  for (const chat of state.chatViews.values()) {
    chat?.destroy?.();
  }
  state.chatViews.clear();
  for (const gc of state.groupChatViews.values()) {
    gc?.destroy?.();
  }
  state.groupChatViews.clear();
  projectsViewInstance?.destroy?.();
  projectsViewInstance = null;
  clearProfileNavigationState();
  stopClipboardSync();
  clearRendererLocalStorage();
  resetRendererMemoryStores();

  const res = await window.blip.factoryReset?.();
  if (!res?.ok) throw new Error(t('settings.dev_factory_reset_fail'));

  state.config = res.config || (await window.blip.getConfig());
  state.peers = [];
  state.occupiedIds = [];
  state.activePeer = null;
  state.activeGroup = null;
  state.settingsSection = null;
  state.view = 'grid';
  viewRouter.clearUnreadMaps();
  lastUpdateStatus = null;

  initPeerTrust(state.config, api);
  purgeGroupsFor(state.config.blipId);
  applySoundPrefsFromConfig(state.config);
  applyAppearance(state.config);
  applyReactiveWallpaperConfig(state.config);
  setAchievementConfigProvider(() => state.config);
  void loadSelfAvatarFromMain();
  restartClipboardSync();
  render();
}

function buildSettingsAboutPanel() {
  return buildAboutPanelView({
    getConfig: () => state.config,
    saveConfig: async (patch) => {
      state.config = await api.saveConfig(patch);
      return state.config;
    },
    openAppearanceIcons: () => openSettingsToSection('appearance', '.settings-app-icon-grid'),
    onDeveloperUnlocked: (cfg) => {
      state.config = cfg;
      refreshSettingsAfterDeveloperUnlock();
    },
  });
}

function buildSettingsSystemPanel() {
  return buildSystemPanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
  });
}

function formatUpdateStatusText() {
  const u = lastUpdateStatus;
  if (!u) return t('settings.updates_status_idle');
  switch (u.state) {
    case 'checking':
      return t('settings.updates_status_checking');
    case 'none':
      return t('settings.updates_status_latest');
    case 'available':
      return t('settings.updates_status_available').replace('{v}', u.version || '—');
    case 'progress':
      return t('settings.updates_status_progress').replace('{p}', String(u.percent ?? 0));
    case 'downloaded':
      return t('settings.updates_status_downloaded').replace('{v}', u.version || '—');
    case 'error':
      if (u.code === 'stale_release') {
        return t('settings.updates_status_stale_release');
      }
      if (u.code === 'unsigned_installer') {
        return t('settings.updates_status_unsigned');
      }
      return t('settings.updates_status_error').replace('{m}', u.message || '');
    default:
      return t('settings.updates_status_idle');
  }
}

function buildSettingsUpdatesPanel() {
  return buildUpdatesPanelView({
    getState: () => state,
    saveConfig: (patch) => api.saveConfig(patch),
    getLastUpdateStatus: () => lastUpdateStatus,
    setLastUpdateStatus: (v) => {
      lastUpdateStatus = v;
    },
    formatUpdateStatusText,
    checkUpdatesViaGithub,
  });
}

function buildSettingsPlaceholderPanel() {
  const wrap = document.createElement('div');
  wrap.className = 'settings-panel settings-panel--empty';

  const sym = document.createElement('p');
  sym.className = 'settings-empty-symbol';
  sym.setAttribute('aria-hidden', 'true');
  sym.textContent = '◎';

  const h = document.createElement('h2');
  h.className = 'section-title';
  h.dataset.i18n = 'settings.title';
  h.textContent = t('settings.title');

  const p = document.createElement('p');
  p.className = 'hint';
  p.dataset.i18n = 'settings.pick_section_hint';
  p.textContent = t('settings.pick_section_hint');

  wrap.appendChild(sym);
  wrap.appendChild(h);
  wrap.appendChild(p);
  return wrap;
}

function runSettingsPanelCleanup() {
  settingsPanelCleanup?.();
  settingsPanelCleanup = null;
}

function attachSettingsPanelCleanup(frag) {
  const cleanups = [];
  if (typeof frag._profileCleanup === 'function') cleanups.push(frag._profileCleanup);
  if (typeof frag._meshPlusCleanup === 'function') cleanups.push(frag._meshPlusCleanup);
  if (typeof frag._networkCleanup === 'function') cleanups.push(frag._networkCleanup);
  if (cleanups.length) {
    frag._settingsCleanup = () => cleanups.forEach((fn) => fn());
  }
  return frag;
}

function appendSettingsPanelHeader(frag, labelKey, hintKey) {
  frag.appendChild(hintKey ? buildPanelTitleRow(labelKey, hintKey) : buildPanelTitleRow(labelKey));
}

function renderSettingsMainPanel() {
  runSettingsPanelCleanup();
  if (state.settingsSection == null) {
    settingsPanelCleanup = null;
    return buildSettingsPlaceholderPanel();
  }
  let section = state.settingsSection;
  const allowed = getSettingsSectionIds();
  if (section != null && !allowed.includes(section)) {
    state.settingsSection = null;
    settingsPanelCleanup = null;
    return buildSettingsPlaceholderPanel();
  }
  let frag;
  switch (section) {
    case 'profile':
      frag = buildSettingsProfilePanel();
      break;
    case 'achievements':
      frag = buildSettingsAchievementsPanel(state, api);
      break;
    case 'mesh_plus':
      frag = buildSettingsMeshPlusPanel(state, () => {
        applyAppearance(state.config);
        applySoundPrefsFromConfig(state.config);
        ensureProjectsView().refreshMeshPlus?.();
        syncAchievements(state.config);
        if (state.view === 'peers') renderView('peers');
        if (state.view === 'settings') renderView('settings');
      });
      break;
    case 'language':
      frag = buildSettingsLanguagePanel();
      break;
    case 'notifications':
      frag = buildSettingsNotificationsPanel();
      break;
    case 'privacy':
      frag = buildSettingsPrivacyPanel();
      break;
    case 'sound':
      frag = buildSettingsSoundPanel();
      break;
    case 'shortcuts':
      frag = buildSettingsShortcutsPanel();
      break;
    case 'call':
      frag = buildSettingsCallPanel();
      break;
    case 'transfer':
      frag = buildSettingsTransferPanel();
      break;
    case 'appearance':
      frag = buildAppearancePanelWithTitle();
      break;
    case 'network':
      frag = buildSettingsNetworkPanel();
      break;
    case 'system':
      frag = buildSettingsSystemPanel();
      break;
    case 'updates':
      frag = buildSettingsUpdatesPanel();
      break;
    case 'developer':
      frag = buildSettingsDeveloperPanel();
      break;
    case 'about':
      frag = buildSettingsAboutPanel();
      break;
    default:
      return buildSettingsPlaceholderPanel();
  }
  attachSettingsPanelCleanup(frag);
  settingsPanelCleanup = frag._settingsCleanup || null;
  return frag;
}

function renderSettingsNavAside() {
  return renderSettingsNavGroups(
    state,
    (id) => {
      if (id === state.settingsSection) return;
      state.settingsSection = id;
      const host = mainContent?.querySelector('.settings-shell__main');
      if (state.view === 'settings' && host) {
        const panel = renderSettingsMainPanel();
        mainContent.querySelectorAll('.settings-nav-btn').forEach((btn) => {
          const key = btn.dataset.i18n || '';
          const sid = key.replace(/^settings\.section_/, '');
          btn.classList.toggle('selected', sid === id);
        });
        void swapPanelContent(host, panel, {
          enabled: isUiMotionEnabled(state.config),
        }).then(() => {
          applyI18n(host);
          updateNavActive();
        });
        return;
      }
      renderView('settings');
    },
    getSettingsSectionIds
  );
}

function renderSettingsView() {
  const wrap = document.createElement('div');
  wrap.className = 'view settings-view';

  const shell = document.createElement('div');
  shell.className = 'settings-shell';

  const aside = renderSettingsNavAside();
  const main = document.createElement('div');
  main.className = 'settings-shell__main';
  main.appendChild(renderSettingsMainPanel());

  shell.appendChild(aside);
  shell.appendChild(main);
  wrap.appendChild(shell);
  return wrap;
}

function ensureMainContent(gridOnly = false) {
  if (mainContent?.isConnected) return;

  rootEl.querySelector('.app-body')?.remove();
  const body = document.createElement('div');
  body.className = gridOnly ? 'app-body app-body--grid' : 'app-body';
  mainContent = document.createElement('main');
  mainContent.className = 'main-content';
  body.appendChild(mainContent);
  rootEl.appendChild(body);
}

function showGridView(isChange = false) {
  ensureMainContent(true);
  mainContent.innerHTML = '';
  const prevId = state.config.blipId;

  gridComponent = createIdGrid({
    occupiedIds: state.occupiedIds.filter((id) => id !== prevId),
    selectedId: prevId,
    onSelect: async (id, confirmed) => {
      if (!confirmed) {
        gridComponent.setSelected(id);
        return;
      }

      const conflict = await window.blip.checkIdConflict(id);
      if (conflict.taken) {
        showError(t('error.id_taken'), t('error.id_taken_hint'));
        return;
      }

      state.config.blipId = id;
      await api.saveConfig({ blipId: id });
      gridComponent.setSelected(id);

      setTimeout(() => {
        if (isChange) {
          state.settingsSection = 'profile';
          renderView('settings');
        } else {
          render();
        }
      }, 400);
    },
  });

  mainContent.appendChild(gridComponent.el);
  applyI18n(mainContent);
}

function showError(title, hint) {
  const box = document.createElement('div');
  box.className = 'error-toast glass';
  box.innerHTML = `<strong>${title}</strong><p>${hint}</p>`;
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

function mountMainContentView(el, { cleanupProfile = false } = {}) {
  if (!mainContent || !el) return;
  const current = mainContent.firstElementChild;
  if (current === el && el.isConnected) return;
  if (state.view === 'settings') runSettingsPanelCleanup();
  if (cleanupProfile) clearProfileNavigationState();
  mainContent.replaceChildren(el);
  applyI18n(mainContent);
  updateNavActive();
}

async function openChat(peerId) {
  const id = normalizeBlipId(peerId);
  if (id == null) return;

  if (isBlocked(id)) {
    showAppToast({ title: t('peers.blocked_chat'), durationMs: 5000 });
    return;
  }

  const prevView = state.view;
  clearProfileNavigationState();
  state.activePeer = id;
  state.activeGroup = null;
  state.view = 'chat';
  clearUnread(id);

  let chat;
  try {
    chat = ensureChatView(id);
  } catch (err) {
    console.error('[BLIP] openChat ensureChatView', id, err);
    showAppToast({ title: t('chat.open_failed'), durationMs: 5000 });
    return;
  }
  if (!chat?.el) {
    showAppToast({ title: t('chat.open_failed'), durationMs: 5000 });
    return;
  }

  if (!resolveMainContent()?.isConnected) {
    render();
    chat.markRead?.();
    chat.renderMessages?.();
    chat.scrollToBottom?.();
    return;
  }

  try {
    if (mountMainPanel(chat.el, { prevView })) {
      chat.markRead?.();
      chat.renderMessages?.();
      chat.scrollToBottom?.();
    } else {
      render();
    }
  } catch (err) {
    console.error('[BLIP] openChat mount', id, err);
    showAppToast({ title: t('chat.open_failed'), durationMs: 5000 });
  }
}

function renderProjectsView() {
  const view = ensureProjectsView().el;
  view.classList.add('view', 'projects-workspace-view');
  return view;
}

function renderView(viewName, options = {}) {
  if (!resolveMainContent()) return;
  const force = !!options.force;
  if (viewName === 'profile' && state.profilePeerId == null) {
    viewName = 'peers';
  }
  const prevView = state.view;
  state.view = viewName;

  let view;
  switch (viewName) {
    case 'dial':
      view = renderDialView();
      break;
    case 'peers':
      view = peersView.renderPeersView();
      break;
    case 'settings':
      view = renderSettingsView();
      break;
    case 'projects':
      view = renderProjectsView();
      break;
    case 'beacon':
      view = renderBeaconView(state.config);
      break;
    case 'profile': {
      view = renderPeerProfileView();
      break;
    }
    case 'chat': {
      if (state.activeGroup) {
        const gchat = ensureGroupChatView(state.activeGroup);
        gchat?.renderMessages?.();
        view = gchat?.el ?? chatHubView.renderChatHubView();
      } else if (state.activePeer) {
        const chat = ensureChatView(state.activePeer);
        if (!chat?.el) {
          view = chatHubView.renderChatHubView();
          break;
        }
        chat.markRead?.();
        chat.renderMessages?.();
        view = chat.el;
      } else {
        view = chatHubView.renderChatHubView();
      }
      break;
    }
    default:
      view = renderDialView();
  }

  if (prevView === 'settings' && viewName !== 'settings') {
    runSettingsPanelCleanup();
  }

  const current = mainContent.firstElementChild;
  if (!force && current === view && view.isConnected) {
    if (viewName === 'chat') {
      if (state.activePeer != null) {
        state.chatViews.get(state.activePeer)?.renderMessages?.();
      } else if (state.activeGroup != null) {
        state.groupChatViews.get(state.activeGroup)?.renderMessages?.();
      }
    }
    applyI18n(mainContent);
    updateNavActive();
    if (viewName === 'peers' || viewName === 'profile') {
      void meshPulse.runMeshPulseRound();
    }
    return;
  }

  if (prevView === 'profile' && viewName !== 'profile') {
    disposeProfilePageIfMounted();
  }

  void swapMainView(mainContent, view, {
    enabled: options.instant ? false : isUiMotionEnabled(state.config),
  }).then(() => {
    applyI18n(mainContent);
    updateNavActive();
    if (viewName === 'peers' || viewName === 'profile') {
      void meshPulse.runMeshPulseRound();
    }
  });
}

function render() {
  if (!state.config.blipId) {
    meshPulse.stopMeshPulse();
    showGridView();
    return;
  }

  meshPulse.startMeshPulse();

  const layout = document.createElement('div');
  layout.className = 'app-layout';

  const nav = createNav((view) => {
    clearProfileNavigationState();
    if (view === 'chat' && (state.view === 'chat' || state.view === 'profile')) {
      state.activePeer = null;
      state.activeGroup = null;
    }
    if (view === 'settings') {
      state.settingsSection = null;
    }
    if (view === 'projects') {
      state.activePeer = null;
      state.activeGroup = null;
    }
    renderView(view);
  });

  mainContent = document.createElement('main');
  mainContent.className = 'main-content';

  layout.appendChild(nav);
  layout.appendChild(mainContent);

  rootEl.querySelector('.app-body')?.remove();
  const body = document.createElement('div');
  body.className = 'app-body';
  body.appendChild(layout);
  rootEl.appendChild(body);

  renderView(state.view || 'dial');
}

export function initUI(config, blipApi) {
  state.config = config;
  api = {
    ...blipApi,
    get config() {
      return state.config;
    },
  };
  initPeerTrust(config, blipApi);
  purgeGroupsFor(config.blipId);
  setLang(config.language || localStorage.getItem('blip_lang') || 'en');
  setDefaultToastDurationMs((Number(config.toastDurationSec) || 9) * 1000);
  applySoundPrefsFromConfig(config);
  applyAppearance(state.config);
  applyReactiveWallpaperConfig(state.config);
  setAchievementConfigProvider(() => state.config);
  initReactiveWallpaper(() => state.config);
  if (state.config?.achievementsEnabled) syncAchievements(state.config);
  void loadSelfAvatarFromMain();
  appearanceListenerDispose?.();
  appearanceListenerDispose = listenReducedMotion(
    () => applyAppearance(state.config),
    () => state.config
  );

  rootEl = document.getElementById('app');
  if (!rootEl) {
    throw new Error('#app element not found');
  }
  rootEl.innerHTML = '';
  mainContent = null;
  window.__blipShowToast = showAppToast;

  initBeaconMesh({
    api: {
      ...blipApi,
      onSeedUdp: (cb) => window.blip?.onSeedUdp?.(cb),
      beaconSendUdp: (payload) => window.blip?.beaconSendUdp?.(payload),
      beaconWriteMeta: (payload) => window.blip?.beaconWriteMeta?.(payload),
      beaconReadMeta: (payload) => window.blip?.beaconReadMeta?.(payload),
      beaconReadPreview: (payload) => window.blip?.beaconReadPreview?.(payload),
      beaconWritePreview: (payload) => window.blip?.beaconWritePreview?.(payload),
      setTrayTransferProgress: (info) => window.blip?.setTrayTransferProgress?.(info),
      beaconWriteChunk: (payload) => window.blip?.beaconWriteChunk?.(payload),
      beaconWriteChunksBatch: (payload) => window.blip?.beaconWriteChunksBatch?.(payload),
      beaconReadChunk: (payload) => window.blip?.beaconReadChunk?.(payload),
      beaconReadChunksBatch: (payload) => window.blip?.beaconReadChunksBatch?.(payload),
      beaconHaveBitmap: (payload) => window.blip?.beaconHaveBitmap?.(payload),
      beaconChunkExists: (payload) => window.blip?.beaconChunkExists?.(payload),
      beaconCountChunks: (payload) => window.blip?.beaconCountChunks?.(payload),
      beaconListLocal: () => window.blip?.beaconListLocal?.(),
      beaconSaveAssembled: (payload) => window.blip?.beaconSaveAssembled?.(payload),
      beaconDeleteSeed: (payload) => window.blip?.beaconDeleteSeed?.(payload),
      beaconPickPublishFile: () => window.blip?.beaconPickPublishFile?.(),
      getPathForFile: (file) => window.blip?.getPathForFile?.(file) || '',
      beaconPublishFromPath: (payload) => window.blip?.beaconPublishFromPath?.(payload),
      onBeaconIngestProgress: (cb) => window.blip?.onBeaconIngestProgress?.(cb),
      beaconServeChunksTcp: (payload) => window.blip?.beaconServeChunksTcp?.(payload),
    },
    getConfig: () => state.config,
    getPeers: () => state.peers,
    getPeerLatency: (id) => meshPulse.peerLatencyMs.get(id) ?? 9999,
  });

  initIdleAway({
    getConfig: () => state.config,
    saveConfig: (patch) => api.saveConfig(patch),
  });

  window.addEventListener('blip-open-beacon-seed', (ev) => {
    if (!state.config?.devBeaconEnabled) {
      showAppToast({ title: t('settings.dev_beacon_off'), durationMs: 3500 });
      return;
    }
    const seedId = String(ev.detail?.seedId || '').trim();
    if (!seedId) return;
    state.view = 'beacon';
    renderView('beacon');
    void import('./beacon-mesh.js').then(({ downloadBeaconSeed }) =>
      downloadBeaconSeed(seedId).catch(() => {})
    );
  });

  window.blip?.onBeaconOpenSeed?.((data) => {
    const seedId = String(data?.seedId || '').trim();
    if (!seedId) return;
    window.dispatchEvent(
      new CustomEvent('blip-open-beacon-seed', { detail: { seedId } })
    );
  });

  window.blip?.onBeaconOpenBlipFile?.((data) => {
    if (!state.config?.devBeaconEnabled) {
      showAppToast({ title: t('settings.dev_beacon_off'), durationMs: 3500 });
      return;
    }
    const doc = data?.doc;
    const seedId = String(doc?.seedId || '').trim();
    if (!seedId) {
      showAppToast({
        title: t('beacon.blip_invalid'),
        variant: 'danger',
        durationMs: 5000,
      });
      return;
    }
    void import('./beacon-mesh.js').then(({ registerBlipSeedDescriptor }) => {
      registerBlipSeedDescriptor(doc);
      state.view = 'beacon';
      renderView('beacon');
      window.dispatchEvent(
        new CustomEvent('blip-open-beacon-seed', { detail: { seedId } })
      );
    });
  });

  window.addEventListener('blip-beacon-share-chat', (ev) => {
    const seedId = String(ev.detail?.seedId || '').trim();
    if (!seedId) return;
    const targets = state.peers
      .filter((p) => p.online && !isBlocked(p.blipId))
      .map((p) => ({ id: p.blipId, label: formatPeerDisplayName(p, p.blipId) }));
    void import('./chat-forward-picker.js').then(async ({ openForwardPeerPicker }) => {
      const peerId = await openForwardPeerPicker(targets);
      if (peerId == null) return;
      const { buildBeaconSeedLink, buildBeaconAttachment } = await import('./beacon-mesh.js');
      const { addMessage } = await import('./chat.js');
      const { createMessageId } = await import('./message-id.js');
      const link = buildBeaconSeedLink(seedId);
      const outMsg = {
        id: createMessageId(),
        from: state.config.blipId,
        to: peerId,
        text: link,
        timestamp: Date.now(),
        outgoing: true,
        attachment: buildBeaconAttachment({
          seedId,
          filename: ev.detail?.filename,
          size: ev.detail?.size,
        }),
      };
      ensureChatView(peerId);
      addMessage(peerId, outMsg);
      state.chatViews.get(peerId)?.renderMessages?.();
      await api.sendTcpMessage({
        to: peerId,
        type: 'message',
        text: outMsg.text,
        id: outMsg.id,
        timestamp: outMsg.timestamp,
        attachment: outMsg.attachment,
      });
      openChat(peerId);
    });
  });

  const titleBar = createTitleBar();
  rootEl.appendChild(titleBar);

  setupGlobalShortcuts();

  onLangChange(() => {
    refreshTransferHubI18n();
    applyI18n(rootEl);
    if (state.config.blipId) {
      renderView(state.view || 'dial');
    } else if (mainContent) {
      applyI18n(mainContent);
    }
  });

  if (typeof window.blip.onNotificationOpenChat === 'function') {
    window.blip.onNotificationOpenChat((peerId) => {
      const id = Number(peerId);
      if (!Number.isFinite(id)) return;
      openChat(id);
    });
  }

  if (typeof window.blip.onConfigUpdated === 'function') {
    window.blip.onConfigUpdated((cfg) => {
      state.config = cfg;
      refreshBeaconMesh();
      applyTrustFromConfig(cfg);
      restartClipboardSync();
      void import('./mesh-plus-verify.js').then(({ syncPremiumTierWithHost }) =>
        syncPremiumTierWithHost(state)
      );
    });
  }

  restartClipboardSync();

  if (typeof window.blip.onUpdateStatus === 'function') {
    window.blip.onUpdateStatus((payload) => {
      lastUpdateStatus = payload;
      showUpdateStatusToast(payload);
      if (state.view === 'settings' && state.settingsSection === 'updates') {
        renderView('settings');
      }
    });
  }

  setTimeout(() => {
    void runStartupUpdateCheck();
  }, 1200);

  window.addEventListener('blip-peer-block-changed', () => {
    if (state.view === 'peers') renderView('peers');
    if (state.view === 'chat' && !state.activePeer) renderView('chat');
  });

  window.addEventListener('blip-mesh-labels-changed', () => {
    if (state.view === 'peers') renderView('peers');
    if (state.view === 'chat' && !state.activePeer) renderView('chat');
    if (state.activePeer != null) {
      const peer = state.peers.find((p) => p.blipId === state.activePeer);
      state.chatViews.get(state.activePeer)?.setPeerName?.(formatPeerDisplayName(peer, state.activePeer));
    }
  });

  window.addEventListener('blip-favorites-changed', () => {
    if (state.view === 'peers') renderView('peers');
    if (state.view === 'chat' && !state.activePeer) renderView('chat');
  });

  window.addEventListener('blip-group-invites-changed', () => {
    if (state.view === 'chat' && !state.activePeer && !state.activeGroup && mainContent) {
      renderView('chat');
    }
    updateNavUnreadBadge();
  });

  window.addEventListener('blip-voice-channel-state', () => {
    if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
      renderView('chat');
    }
    if (state.activeGroup) {
      state.groupChatViews.get(state.activeGroup)?.refreshChannels?.();
    }
  });

  window.addEventListener('blip-groups-changed', () => {
    if (state.activeGroup) {
      const g = getGroup(state.activeGroup);
      if (!g || !isGroupMember(g, state.config.blipId)) {
        closeGroupChatUi(state.activeGroup);
      }
    }
    if (state.view === 'chat') {
      if (!state.activePeer && !state.activeGroup) {
        renderView('chat');
      } else if (state.activeGroup) {
        const g = getGroup(state.activeGroup);
        if (g) ensureGroupChatView(state.activeGroup)?.updateGroup?.(g);
      }
    }
  });

  window.addEventListener('blip-avatar-changed', () => {
    if (!mainContent?.isConnected) return;
    if (state.view === 'peers') renderView('peers');
    else if (state.view === 'chat' && !state.activePeer) renderView('chat');
    if (state.view === 'chat' && state.activePeer != null) {
      state.chatViews.get(state.activePeer)?.refreshHeaderAvatar?.();
    }
  });

  render();
}

export function updatePeers({ peers, occupiedIds, meta }) {
  if (state.config?.devMeshTrace && meta?.reason) {
    logDiscoveryEmit(meta);
  }

  if (meta?.sublineOnly) {
    state.peers = peers;
    state.occupiedIds = occupiedIds;
    if (state.view === 'chat' && (state.activePeer || state.activeGroup) && mainContent) {
      return;
    }
    meshPulse.refreshPeerPulseDom();
    peersView.refreshPeersListDom();
    chatHubView.refreshChatHubPeerDom();
    return;
  }

  const prevPeersById = new Map(state.peers.map((p) => [Number(p.blipId), p]));
  const nextPeersById = new Map(peers.map((p) => [Number(p.blipId), p]));
  const prevOnline = new Set(state.peers.filter((p) => p.online).map((p) => p.blipId));
  const nextOnline = new Set(peers.filter((p) => p.online).map((p) => p.blipId));
  const hasVisualChange = (() => {
    if (prevPeersById.size !== nextPeersById.size) return true;
    for (const [id, next] of nextPeersById) {
      const prev = prevPeersById.get(id);
      if (!prev) return true;
      if (
        prev.online !== next.online ||
        prev.displayName !== next.displayName ||
        prev.presence !== next.presence ||
        prev.meshTcpEncrypted !== next.meshTcpEncrypted ||
        prev.meshLegacy !== next.meshLegacy ||
        prev.meshCompat !== next.meshCompat ||
        prev.meshPlus !== next.meshPlus ||
        prev.hasProfileGif !== next.hasProfileGif ||
        prev.buildTrust !== next.buildTrust ||
        prev.buildVerified !== next.buildVerified ||
        prev.meshPlusTrust !== next.meshPlusTrust
      ) {
        return true;
      }
    }
    return false;
  })();
  state.peers = peers;
  state.occupiedIds = occupiedIds;
  recordPeersOnline(peers.filter((p) => p.online).length);

  peers.forEach((p) => {
    if (p.online && !prevOnline.has(p.blipId)) {
      logPeerEvent(p.blipId, 'online');
      if (!state.config?.doNotDisturb) sounds.peerOnline();
      if (getSelfAvatarCache()) void broadcastCustomAvatar();
      if (p.hasProfileGif) void requestPeerProfileGif(p.blipId);
      void broadcastProfileGif();
    } else if (!p.online && prevOnline.has(p.blipId)) {
      logPeerEvent(p.blipId, 'offline');
      if (!state.config?.doNotDisturb) sounds.peerOffline();
      migrateGroupsHostOnPeerOffline(p.blipId, nextOnline, api, state.config);
    }
    const chat = state.chatViews.get(p.blipId);
    if (chat) chat.setPeerName(formatPeerDisplayName(p));
  });

  if (gridComponent) {
    gridComponent.updateOccupied(occupiedIds.filter((id) => id !== state.config.blipId));
  }

  if (state.view === 'chat' && (state.activePeer || state.activeGroup) && mainContent) {
    return;
  }

  if (state.view === 'peers' && mainContent && hasVisualChange) {
    renderView('peers', { instant: true });
  } else if (state.view === 'peers' && mainContent) {
    peersView.refreshPeersTypingDom();
    meshPulse.refreshPeerPulseDom();
    peersView.refreshPeersListDom();
  }
  if (state.view === 'profile' && mainContent && state.profilePeerId != null) {
    if (hasVisualChange) refreshOpenProfilePageIfNeeded(mainContent);
  }
  if (state.view === 'chat' && !state.activePeer && mainContent) {
    if (hasVisualChange) renderView('chat', { instant: true });
    else {
      meshPulse.refreshPeerPulseDom();
      chatHubView.refreshChatHubPeerDom();
    }
  }
  if (state.view === 'projects') {
    projectsViewInstance?.refreshPeers?.();
  }
}

function handleTypingTcp(msg) {
  const peerId = Number(msg.from);
  if (!Number.isFinite(peerId) || isBlocked(peerId)) return;
  if (Number(msg.to) !== Number(state.config.blipId)) return;

  if (msg.active) {
    peersTyping.add(peerId);
  } else {
    peersTyping.delete(peerId);
  }

  ensureChatView(peerId);
  const peer = state.peers.find((p) => p.blipId === peerId);
  const label = formatPeerDisplayName(peer, peerId);
  state.chatViews.get(peerId)?.setTyping?.(!!msg.active, label);
  peersView.refreshPeersTypingDom();
}

export function handleMissedCall(payload) {
  const peerId = Number(payload?.peerId);
  if (!Number.isFinite(peerId)) return;
  addMissedCallMessage(peerId, {
    reason: payload?.reason,
    video: !!payload?.video,
    at: payload?.at,
  });
  bumpUnread(peerId);
  ensureChatView(peerId);
  state.chatViews.get(peerId)?.render?.();
  if (state.view === 'chat' && !state.activePeer && mainContent) {
    renderView('chat');
  } else if (state.view === 'chat' && state.activePeer === peerId) {
    state.chatViews.get(peerId)?.render?.();
  }
}

export function handleTcpMessage(msg) {
  if (state.config?.devMeshTrace && msg.type) {
    const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
    if (Number.isFinite(peerId)) logPeerEvent(peerId, `tcp:${msg.type}`);
  }
  if (handleBeaconTcp(msg, { api, config: state.config })) return;
  if (msg.type === 'profile-gif-request') {
    const from = Number(msg.from);
    if (!Number.isFinite(from) || isBlocked(from)) return;
    void (async () => {
      const dataUrl = await window.blip?.getProfileGifShareUrl?.();
      if (!dataUrl) return;
      await api.sendTcpMessage({
        type: 'profile-gif-share',
        to: from,
        from: state.config.blipId,
        dataUrl,
      });
    })();
    return;
  }

  if (msg.type === 'profile-gif-share') {
    const from = Number(msg.from);
    if (!Number.isFinite(from) || isBlocked(from)) return;
    const raw = msg.dataUrl ? String(msg.dataUrl) : '';
    if (raw.length > 4_500_000) {
      console.warn('[BLIP] profile-gif-share too large, ignored');
      return;
    }
    void (async () => {
      const ok = await ingestPeerProfileGifDataUrl(from, raw || null);
      const peer = findPeerByBlipId(from);
      if (peer) peer.hasProfileGif = true;
      if (!ok) {
        console.warn('[BLIP] profile GIF not cached for peer', from);
      }
      if (state.view === 'profile' && peerBlipIdEquals(state.profilePeerId, from)) {
        notifyProfilePeerUpdated(from);
      }
    })();
    return;
  }

  if (msg.type === 'avatar-share') {
    const from = Number(msg.from);
    if (!Number.isFinite(from) || isBlocked(from)) return;
    if (msg.dataUrl) setPeerAvatarDataUrl(from, String(msg.dataUrl));
    else setPeerAvatarDataUrl(from, null);
    const mine = getSelfAvatarCache();
    if (mine) {
      void api.sendTcpMessage({
        type: 'avatar-share',
        to: from,
        from: state.config.blipId,
        dataUrl: mine,
      });
    }
    void broadcastProfileGif();
    window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
    if (state.view === 'peers') {
      renderView('peers');
    } else if (state.view === 'profile') {
      renderView('profile', { force: true });
    } else if (state.view === 'chat') {
      if (state.activePeer != null) {
        state.chatViews.get(state.activePeer)?.refreshHeaderAvatar?.();
      } else if (state.activeGroup != null) {
        state.groupChatViews.get(state.activeGroup)?.refreshHeaderAvatar?.();
      } else {
        renderView('chat');
      }
    }
    return;
  }

  if (handleMeshProjectTcp(msg, state.config, api)) return;

  if (msg.type === 'clipboard-push') {
    if (isBlocked(Number(msg.from))) return;
    void handleClipboardPush(msg, {
      getConfig: () => state.config,
      getActivePeer: () => state.activePeer,
      onApplied: (from) => {
        showAppToast({
          title: formatClipboardToast(from),
          durationMs: 3200,
        });
      },
    });
    return;
  }

  if (msg.type?.startsWith?.('file-')) {
    if (isBlocked(Number(msg.from))) return;
    if (msg.type === 'file-offer') {
      trackTransferStart(Number(msg.from), msg.transferId, {
        name: msg.name,
        size: msg.size,
        direction: 'in',
      });
    }
    handleFileTransferTcp(msg, {
      config: state.config,
      onProgress: (peerId, transferId, pct) => {
        trackTransferProgress(peerId, transferId, pct, { direction: 'in' });
      },
      onComplete: (peerId, payload) => {
        if (payload?.transferId) trackTransferEnd(peerId, payload.transferId);
        if (payload.groupId && payload.msgId) {
          completeIncomingGroupFile(payload.groupId, payload.msgId, payload.attachment);
          state.groupChatViews.get(payload.groupId)?.renderMessages?.();
          if (state.view === 'chat' && state.activeGroup !== payload.groupId) {
            unreadByGroup.set(
              payload.groupId,
              (unreadByGroup.get(payload.groupId) || 0) + 1
            );
            if (!state.activePeer && !state.activeGroup) renderView('chat');
          }
          return;
        }
        const incoming = {
          type: 'message',
          from: peerId,
          to: state.config.blipId,
          id: createMessageId(),
          text: t('chat.file_received'),
          timestamp: Date.now(),
          attachment: payload.attachment,
        };
        routePeerMessage(incoming);
      },
      onAbort: (peerId, transferId) => trackTransferEnd(peerId, transferId),
    });
    return;
  }

  if (msg.type === 'group-avatar-share') {
    const groupId = msg.groupId;
    if (!groupId) return;
    if (msg.dataUrl) setGroupAvatarDataUrl(groupId, String(msg.dataUrl));
    window.dispatchEvent(
      new CustomEvent('blip-group-avatar-changed', { detail: { groupId } })
    );
    if (state.view === 'chat') renderView('chat');
    return;
  }

  if (msg.type === 'group-avatar-request') {
    const groupId = msg.groupId;
    const from = Number(msg.from);
    if (!groupId || !Number.isFinite(from)) return;
    void broadcastGroupAvatarToMembers(groupId, api, state.config.blipId);
    return;
  }

  if (
    msg.type === 'voice-ch-roster' ||
    msg.type === 'voice-ch-signal' ||
    msg.type?.startsWith?.('group-')
  ) {
    void handleGroupTcpMessage(msg, {
      api,
      config: state.config,
      statePeers: state.peers,
      getGroupChatView: (id) => state.groupChatViews.get(id),
      openGroupChat,
      bumpGroupUnread: (groupId) => {
        if (state.view === 'chat' && state.activeGroup === groupId) return;
        unreadByGroup.set(groupId, (unreadByGroup.get(groupId) || 0) + 1);
        updateNavUnreadBadge();
        if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
          renderView('chat');
        }
      },
      bumpInviteUnread,
      onGroupRemoved: (groupId) => {
        closeGroupChatUi(groupId);
        unreadByGroup.delete(groupId);
        if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
          renderView('chat');
        }
      },
      onMemberLeft: (groupId) => {
        if (state.view === 'chat' && state.activeGroup === groupId) {
          ensureGroupChatView(groupId)?.updateGroup?.(getGroup(groupId));
        } else if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
          renderView('chat');
        }
      },
    });
    return;
  }

  if (msg.type === 'typing') {
    handleTypingTcp(msg);
    return;
  }

  const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
  if (!Number.isFinite(peerId) || isBlocked(peerId)) return;

  if (msg.type === 'reaction') {
    state.chatViews.get(peerId)?.handleReaction?.(msg);
    return;
  }

  if (msg.type === 'message-pin') {
    const pinPeer = Number(msg.from === state.config.blipId ? msg.to : msg.from);
    if (Number.isFinite(pinPeer) && !isBlocked(pinPeer)) {
      ensureChatView(pinPeer);
      state.chatViews.get(pinPeer)?.handlePin?.(msg);
    }
    return;
  }

  if (msg.type === 'message-edit') {
    const editPeer = Number(msg.from === state.config.blipId ? msg.to : msg.from);
    if (Number.isFinite(editPeer) && !isBlocked(editPeer)) {
      ensureChatView(editPeer);
      state.chatViews.get(editPeer)?.handleEdit?.(msg);
    }
    return;
  }

  if (msg.type !== 'message') return;

  routePeerMessage(msg);
}

function routePeerMessage(msg) {
  const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
  if (!Number.isFinite(peerId) || isBlocked(peerId)) return;

  const id = normalizeBlipId(peerId);
  if (id == null) return;

  ensureChatView(id);
  const chat = state.chatViews.get(id);
  chat?.handleIncoming(msg);
  refreshLiveChat(id);

  if (state.view === 'chat' && state.activePeer === id) {
    return;
  }

  bumpUnread(id);

  let preview = typeof msg.text === 'string' ? msg.text.slice(0, 120) : '';
  if (msg.attachment?.kind === 'file') {
    preview = t('chat.file_preview').replace('{name}', msg.attachment.name || 'file');
  } else if (msg.attachment?.kind === 'image') {
    preview = t('chat.image_preview');
  }
  showMessageToast(id, preview);

  const typingOther =
    state.view === 'chat' &&
    state.activePeer &&
    state.activePeer !== id &&
    document.activeElement?.closest?.('.chat-input-row');

  if (typingOther) {
    return;
  }

  state.view = 'chat';
  state.activePeer = id;
  clearUnread(id);
  if (mainContent?.isConnected) renderView('chat');
}

export function getCallUI() {
  return null;
}
