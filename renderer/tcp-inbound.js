/**
 * Inbound TCP demux (extracted from ui.js).
 * @see https://github.com/krwg/blip/issues/129
 */

import { t } from './i18n.js';
import { createMessageId } from './message-id.js';
import { handleMeshProjectTcp } from './projects-mesh-wire.js';
import { handleGroupProjectTcp, respondClipboardPull } from './group-projects-wire.js';
import { getGroup } from './groups.js';
import { handleGroupTcpMessage } from './groups-wire.js';
import { handleFileTransferTcp } from './file-transfer.js';
import { completeIncomingGroupFile } from './group-file-transfer.js';
import {
  trackTransferStart,
  trackTransferProgress,
  trackTransferEnd,
} from './file-transfer-hub.js';
import { handleBeaconTcp } from './beacon-mesh.js';
import { handleClipboardPush, formatClipboardToast } from './clipboard-sync.js';
import { showAppToast } from './toasts.js';
import { logPeerEvent } from './network-log.js';
import {
  setPeerAvatarDataUrl,
  getSelfAvatarCache,
} from './avatar.js';
import { setGroupAvatarDataUrl, broadcastGroupAvatarToMembers } from './group-avatar.js';
import { ingestPeerProfileGifDataUrl } from './peer-gif-cache.js';

/**
 * @param {{
 *   getState: () => object,
 *   getApi: () => object,
 *   getMainContent: () => HTMLElement | null,
 *   isBlocked: (id: number) => boolean,
 *   normalizeBlipId: (id: unknown) => number | null,
 *   peerBlipIdEquals: (a: unknown, b: unknown) => boolean,
 *   findPeerByBlipId: (id: number) => object | undefined,
 *   ensureChatView: (id: number) => unknown,
 *   ensureGroupChatView: (id: string) => { updateGroup?: Function } | null | undefined,
 *   openGroupChat: (groupId: string) => void,
 *   closeGroupChatUi: (groupId: string) => void,
 *   bumpUnread: (id: number) => void,
 *   clearUnread: (id: number) => void,
 *   bumpInviteUnread: () => void,
 *   bumpGroupUnread: (groupId: string) => void,
 *   updateNavUnreadBadge: () => void,
 *   getUnreadByGroup: () => Map<string, number>,
 *   refreshLiveChat: (peerId: number) => void,
 *   handleTypingTcp: (msg: object) => void,
 *   broadcastProfileGif: () => Promise<void> | void,
 *   notifyProfilePeerUpdated: (peerId: number) => void,
 *   renderView: (view: string, opts?: object) => void,
 *   showMessageToast: (peerId: number, preview: string) => void,
 * }} deps
 */
export function createTcpInboundRouter(deps) {
  function routePeerMessage(msg) {
    const state = deps.getState();
    const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
    if (!Number.isFinite(peerId) || deps.isBlocked(peerId)) return;

    const id = deps.normalizeBlipId(peerId);
    if (id == null) return;

    deps.ensureChatView(id);
    const chat = state.chatViews.get(id);
    chat?.handleIncoming(msg);
    deps.refreshLiveChat(id);

    if (state.view === 'chat' && state.activePeer === id) {
      return;
    }

    deps.bumpUnread(id);

    let preview = typeof msg.text === 'string' ? msg.text.slice(0, 120) : '';
    if (msg.attachment?.kind === 'file') {
      preview = t('chat.file_preview').replace('{name}', msg.attachment.name || 'file');
    } else if (msg.attachment?.kind === 'image') {
      preview = t('chat.image_preview');
    }
    deps.showMessageToast(id, preview);

    if (state.view !== 'chat') {
      return;
    }

    const typingOther =
      state.activePeer &&
      state.activePeer !== id &&
      document.activeElement?.closest?.('.chat-input-row');

    if (typingOther) {
      return;
    }

    state.activePeer = id;
    deps.clearUnread(id);
    if (deps.getMainContent()?.isConnected) deps.renderView('chat');
  }

  function handleTcpMessage(msg) {
    const state = deps.getState();
    const api = deps.getApi();
    if (state.config?.devMeshTrace && msg.type) {
      const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
      if (Number.isFinite(peerId)) logPeerEvent(peerId, `tcp:${msg.type}`);
    }
    if (handleBeaconTcp(msg, { api, config: state.config })) return;
    if (msg.type === 'profile-gif-request') {
      const from = Number(msg.from);
      if (!Number.isFinite(from) || deps.isBlocked(from)) return;
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
      if (!Number.isFinite(from) || deps.isBlocked(from)) return;
      const raw = msg.dataUrl ? String(msg.dataUrl) : '';
      if (raw.length > 4_500_000) {
        console.warn('[BLIP] profile-gif-share too large, ignored');
        return;
      }
      void (async () => {
        const ok = await ingestPeerProfileGifDataUrl(from, raw || null);
        const peer = deps.findPeerByBlipId(from);
        if (peer) peer.hasProfileGif = true;
        if (!ok) {
          console.warn('[BLIP] profile GIF not cached for peer', from);
        }
        if (state.view === 'profile' && deps.peerBlipIdEquals(state.profilePeerId, from)) {
          deps.notifyProfilePeerUpdated(from);
        }
      })();
      return;
    }

    if (msg.type === 'avatar-share') {
      const from = Number(msg.from);
      if (!Number.isFinite(from) || deps.isBlocked(from)) return;
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
      void deps.broadcastProfileGif();
      window.dispatchEvent(new CustomEvent('blip-avatar-changed'));
      if (state.view === 'peers') {
        deps.renderView('peers');
      } else if (state.view === 'profile') {
        deps.renderView('profile', { force: true });
      } else if (state.view === 'chat') {
        if (state.activePeer != null) {
          state.chatViews.get(state.activePeer)?.refreshHeaderAvatar?.();
        } else if (state.activeGroup != null) {
          state.groupChatViews.get(state.activeGroup)?.refreshHeaderAvatar?.();
        } else {
          deps.renderView('chat');
        }
      }
      return;
    }

    if (handleMeshProjectTcp(msg, state.config, api)) return;

    if (msg.type === 'group-proj-clipboard-pull') {
      const from = Number(msg.from);
      const group = getGroup(msg.groupId);
      if (group && Number.isFinite(from) && from !== Number(state.config.blipId)) {
        void respondClipboardPull(api, state.config, group, from);
      }
      return;
    }
    if (handleGroupProjectTcp(msg, state.config)) return;

    if (msg.type === 'clipboard-push') {
      if (deps.isBlocked(Number(msg.from))) return;
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
      if (deps.isBlocked(Number(msg.from))) return;
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
              const unreadByGroup = deps.getUnreadByGroup();
              unreadByGroup.set(
                payload.groupId,
                (unreadByGroup.get(payload.groupId) || 0) + 1
              );
              if (!state.activePeer && !state.activeGroup) deps.renderView('chat');
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
      if (state.view === 'chat') deps.renderView('chat');
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
        openGroupChat: deps.openGroupChat,
        bumpGroupUnread: deps.bumpGroupUnread,
        bumpInviteUnread: deps.bumpInviteUnread,
        onGroupRemoved: (groupId) => {
          deps.closeGroupChatUi(groupId);
          deps.getUnreadByGroup().delete(groupId);
          if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
            deps.renderView('chat');
          }
        },
        onMemberLeft: (groupId) => {
          if (state.view === 'chat' && state.activeGroup === groupId) {
            deps.ensureGroupChatView(groupId)?.updateGroup?.(getGroup(groupId));
          } else if (state.view === 'chat' && !state.activePeer && !state.activeGroup) {
            deps.renderView('chat');
          }
        },
      });
      return;
    }

    if (msg.type === 'typing') {
      deps.handleTypingTcp(msg);
      return;
    }

    const peerId = Number(msg.from === state.config.blipId ? msg.to : msg.from);
    if (!Number.isFinite(peerId) || deps.isBlocked(peerId)) return;

    if (msg.type === 'reaction') {
      state.chatViews.get(peerId)?.handleReaction?.(msg);
      return;
    }

    if (msg.type === 'message-pin') {
      const pinPeer = Number(msg.from === state.config.blipId ? msg.to : msg.from);
      if (Number.isFinite(pinPeer) && !deps.isBlocked(pinPeer)) {
        deps.ensureChatView(pinPeer);
        state.chatViews.get(pinPeer)?.handlePin?.(msg);
      }
      return;
    }

    if (msg.type === 'message-edit') {
      const editPeer = Number(msg.from === state.config.blipId ? msg.to : msg.from);
      if (Number.isFinite(editPeer) && !deps.isBlocked(editPeer)) {
        deps.ensureChatView(editPeer);
        state.chatViews.get(editPeer)?.handleEdit?.(msg);
      }
      return;
    }

    if (msg.type !== 'message') return;

    routePeerMessage(msg);
  }

  return { handleTcpMessage, routePeerMessage };
}
