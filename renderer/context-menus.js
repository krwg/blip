/**
 * Peer and group right-click context menus.
 * @see https://github.com/krwg/blip/issues/58
 */

import { t } from './i18n.js';
import { groupDisplayName, getGroup, saveGroup, getVoiceChannels } from './groups.js';
import { leaveGroup } from './groups-wire.js';
import { joinVoiceChannel } from './voice-channel.js';
import { isFavorite, toggleFavorite } from './peer-favorites.js';
import { isBlocked, blockPeer, unblockPeer } from './peer-trust.js';
import { formatPeerDisplayName } from './peer-labels.js';
import { openGroupCreateDialog } from './group-create-dialog.js';
import { openConfirmDialog } from './confirm-dialog.js';
import { showAppToast } from './toasts.js';

/**
 * @param {object} deps
 * @param {() => object} deps.getState
 * @param {() => object} deps.getApi
 * @param {(id: unknown) => object|undefined} deps.findPeerByBlipId
 * @param {(id: unknown) => number|null} deps.normalizeBlipId
 * @param {(view: string, opts?: object) => void} deps.renderView
 * @param {(groupId: number) => void} deps.openGroupChat
 * @param {(groupId: number) => void} deps.closeGroupChatUi
 * @param {(peerOrId: unknown) => void|Promise<void>} deps.openPeerProfileFromUi
 * @param {(peerId: number) => void|Promise<void>} deps.openChat
 * @param {(peerId: number, video?: boolean) => void} deps.openCallOutgoing
 * @param {(peer: object) => void|Promise<void>} deps.promptMeshLabel
 * @param {(peer: object) => void|Promise<void>} deps.runPeerPing
 * @param {(memberIds: number[], name?: string) => Promise<object|null>} deps.createGroupFromUi
 */
export function createContextMenus(deps) {
  const {
    getState,
    getApi,
    findPeerByBlipId,
    normalizeBlipId,
    renderView,
    openGroupChat,
    closeGroupChatUi,
    openPeerProfileFromUi,
    openChat,
    openCallOutgoing,
    promptMeshLabel,
    runPeerPing,
    createGroupFromUi,
  } = deps;

  function peerForContextMenu(peerOrId) {
    if (peerOrId && typeof peerOrId === 'object' && peerOrId.blipId != null) {
      const live = findPeerByBlipId(peerOrId.blipId);
      return live
        ? { ...live, ...peerOrId, blipId: normalizeBlipId(peerOrId.blipId) }
        : peerOrId;
    }
    const id = normalizeBlipId(peerOrId);
    if (id == null) {
      return {
        blipId: 0,
        displayName: '?',
        online: false,
        presence: 'offline',
        presenceText: '',
        hasProfileGif: false,
      };
    }
    const found = findPeerByBlipId(id);
    if (found) return found;
    return {
      blipId: id,
      displayName: formatPeerDisplayName(null, id),
      online: false,
      presence: 'offline',
      presenceText: '',
      hasProfileGif: false,
    };
  }

  function showGroupContextMenu(e, group) {
    const state = getState();
    const api = getApi();
    const menu = document.createElement('div');
    menu.className = 'context-menu glass';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    function bindItem(btn, handler) {
      btn.addEventListener('mousedown', (ev) => ev.stopPropagation());
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        handler();
      });
    }

    const openItem = document.createElement('button');
    openItem.type = 'button';
    openItem.textContent = t('group.menu_open');
    bindItem(openItem, () => openGroupChat(group.id));

    const renameItem = document.createElement('button');
    renameItem.type = 'button';
    renameItem.textContent = t('group.menu_rename');
    bindItem(renameItem, () => {
      const val = prompt(t('group.rename_prompt'), group.name || groupDisplayName(group));
      if (val === null) return;
      const trimmed = val.trim();
      group.name = trimmed || undefined;
      saveGroup(group);
      state.groupChatViews.get(group.id)?.updateGroup?.(getGroup(group.id));
      if (state.view === 'chat') renderView('chat');
      showAppToast({ title: t('group.rename_done'), durationMs: 2800 });
    });

    const callItem = document.createElement('button');
    callItem.type = 'button';
    callItem.textContent = t('group.call');
    bindItem(callItem, () => {
      openGroupChat(group.id);
      const vch = getVoiceChannels(group)[0];
      if (vch) void joinVoiceChannel(group.id, vch.id, api, state.config);
    });

    const leaveItem = document.createElement('button');
    leaveItem.type = 'button';
    leaveItem.textContent = t('group.menu_leave');
    bindItem(leaveItem, async () => {
      const ok = await openConfirmDialog({
        title: t('group.leave_confirm_title'),
        body: t('group.leave_confirm_body').replace('{name}', groupDisplayName(group)),
        confirmLabel: t('group.menu_leave'),
      });
      if (!ok) return;
      try {
        const res = await leaveGroup(api, state.config, group.id, state.peers);
        if (!res?.ok) {
          showAppToast({
            title: t('group.leave_failed'),
            body: t(`group.err_${res?.error || 'unknown'}`),
            variant: 'danger',
            durationMs: 5000,
          });
          return;
        }
        closeGroupChatUi(group.id);
        if (state.view === 'chat') renderView('chat');
      } catch (err) {
        console.error('[group] leave:', err);
        showAppToast({
          title: t('group.leave_failed'),
          body: err?.message || String(err),
          variant: 'danger',
          durationMs: 5000,
        });
      }
    });

    menu.appendChild(openItem);
    menu.appendChild(renameItem);
    menu.appendChild(callItem);
    menu.appendChild(leaveItem);
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  }

  function showPeerContextMenu(e, peerOrId, options = {}) {
    const state = getState();
    const api = getApi();
    const peer = peerForContextMenu(peerOrId);
    const menu = document.createElement('div');
    menu.className = 'context-menu glass';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    function bindItem(btn, handler) {
      btn.addEventListener('mousedown', (ev) => ev.stopPropagation());
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        menu.remove();
        handler();
      });
    }

    const profileItem = document.createElement('button');
    profileItem.type = 'button';
    profileItem.dataset.i18n = 'peers.profile';
    profileItem.textContent = t('peers.profile');
    bindItem(profileItem, () => openPeerProfileFromUi(peer));

    const msgItem = document.createElement('button');
    msgItem.type = 'button';
    msgItem.textContent = t('dial.message');
    bindItem(msgItem, () => openChat(peer.blipId));

    const callItem = document.createElement('button');
    callItem.type = 'button';
    callItem.textContent = t('dial.call');
    bindItem(callItem, () => {
      if (peer.online) openCallOutgoing(peer.blipId, false);
    });

    const labelItem = document.createElement('button');
    labelItem.type = 'button';
    labelItem.textContent = t('peers.mesh_label');
    bindItem(labelItem, () => {
      void promptMeshLabel(peer);
    });

    const pingItem = document.createElement('button');
    pingItem.type = 'button';
    pingItem.textContent = t('peers.ping');
    bindItem(pingItem, () => {
      void runPeerPing(peer);
    });

    const copyIdItem = document.createElement('button');
    copyIdItem.type = 'button';
    copyIdItem.textContent = t('peers.copy_id');
    bindItem(copyIdItem, () => {
      void navigator.clipboard.writeText(String(peer.blipId));
      showAppToast({ title: t('peers.copy_id_done'), durationMs: 2500 });
    });

    const groupItem = document.createElement('button');
    groupItem.type = 'button';
    groupItem.textContent = t('group.create_menu');
    bindItem(groupItem, () => {
      void (async () => {
        const result = await openGroupCreateDialog({
          selfId: state.config.blipId,
          peers: state.peers,
          seedPeerId: peer.blipId,
        });
        if (!result) return;
        const g = await createGroupFromUi(api, state.config, result.memberIds, result.name);
        if (!g) return;
        openGroupChat(g.id);
      })();
    });

    const favItem = document.createElement('button');
    favItem.type = 'button';
    favItem.textContent = isFavorite(peer.blipId) ? t('peers.unfavorite') : t('peers.favorite');
    bindItem(favItem, () => {
      const nowFav = toggleFavorite(peer.blipId);
      showAppToast({
        title: nowFav ? t('peers.favorite_added') : t('peers.favorite_removed'),
        durationMs: 2500,
      });
      if (state.view === 'peers') renderView('peers');
      if (state.view === 'chat' && !state.activePeer) renderView('chat');
    });

    const blockItem = document.createElement('button');
    blockItem.type = 'button';
    blockItem.textContent = isBlocked(peer.blipId) ? t('peers.unblock') : t('peers.block');
    bindItem(blockItem, () => {
      if (isBlocked(peer.blipId)) {
        unblockPeer(peer.blipId);
        showAppToast({ title: t('peers.unblock_done'), durationMs: 3000 });
      } else {
        blockPeer(peer.blipId);
        showAppToast({ title: t('peers.block_done'), durationMs: 3000 });
      }
      if (state.view === 'peers') renderView('peers');
    });

    menu.addEventListener('mousedown', (ev) => ev.stopPropagation());
    menu.addEventListener('click', (ev) => ev.stopPropagation());

    menu.appendChild(profileItem);
    if (!options.hideMessage) menu.appendChild(msgItem);
    menu.appendChild(callItem);
    menu.appendChild(labelItem);
    menu.appendChild(pingItem);
    menu.appendChild(copyIdItem);
    menu.appendChild(groupItem);
    menu.appendChild(favItem);
    menu.appendChild(blockItem);
    document.body.appendChild(menu);

    const close = () => menu.remove();
    setTimeout(() => {
      document.addEventListener('click', close, { once: true });
    }, 0);
  }

  return {
    peerForContextMenu,
    showGroupContextMenu,
    showPeerContextMenu,
  };
}
