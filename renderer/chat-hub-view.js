export function createChatHubView({
  getState,
  t,
  isBlocked,
  isFavorite,
  getPendingGroupInvites,
  acceptGroupInvite,
  declineGroupInvite,
  clearInviteUnread,
  getGroupsFor,
  getGroupMessages,
  groupDisplayName,
  getVoiceChannels,
  getVoiceChannelRoster,
  createGroupAvatarElement,
  createAvatarElement,
  getMessages,
  formatPeerDisplayName,
  findPeerByBlipId,
  normalizeBlipId,
  peerPresenceClass,
  peerHasCachedProfileGif,
  getUnreadByGroup,
  getUnreadByPeer,
  openGroupChat,
  openChat,
  openPeerProfile,
  showGroupContextMenu,
  showPeerContextMenu,
  renderView,
}) {
  function renderChatHubView() {
    const state = getState();
    clearInviteUnread();
    const wrap = document.createElement('div');
    wrap.className = 'view chat-hub-view';
    const title = document.createElement('h2');
    title.className = 'section-title';
    title.dataset.i18n = 'chat.title';
    title.textContent = t('chat.title');
    const list = document.createElement('div');
    list.className = 'chat-hub-list';

    const pendingInvites = getPendingGroupInvites();
    if (pendingInvites.length) {
      const invSection = document.createElement('div');
      invSection.className = 'chat-hub-invites-section';
      const invTitle = document.createElement('h3');
      invTitle.className = 'chat-hub-invites-title';
      invTitle.dataset.i18n = 'group.invite_section';
      invTitle.textContent = t('group.invite_section');
      invSection.appendChild(invTitle);
      pendingInvites.forEach((inv) => {
        const card = document.createElement('div');
        card.className = 'chat-hub-invite glass';
        const body = document.createElement('div');
        body.className = 'chat-hub-invite-body';
        const line1 = document.createElement('span');
        line1.className = 'chat-hub-invite-name';
        line1.textContent = t('group.invite_card_title')
          .replace('{name}', inv.name || t('group.unnamed'))
          .replace('{host}', String(inv.hostId ?? inv.from));
        const line2 = document.createElement('span');
        line2.className = 'chat-hub-invite-meta';
        line2.textContent = t('group.invite_card_meta').replace('{n}', String(inv.members?.length || 0));
        body.append(line1, line2);
        const actions = document.createElement('div');
        actions.className = 'chat-hub-invite-actions';
        const joinBtn = document.createElement('button');
        joinBtn.type = 'button';
        joinBtn.className = 'btn btn-accent';
        joinBtn.textContent = t('group.invite_card_join');
        const declineBtn = document.createElement('button');
        declineBtn.type = 'button';
        declineBtn.className = 'btn btn-lang';
        declineBtn.textContent = t('group.invite_card_decline');
        joinBtn.addEventListener('click', async () => {
          try {
            const g = await acceptGroupInvite(inv);
            clearInviteUnread();
            openGroupChat(g.id);
          } catch (err) {
            console.error('[group invite] accept', err);
          }
        });
        declineBtn.addEventListener('click', async () => {
          await declineGroupInvite(inv);
          const current = getState();
          if (current.view === 'chat' && !current.activePeer && !current.activeGroup) {
            renderView('chat');
          }
        });
        actions.append(joinBtn, declineBtn);
        card.append(body, actions);
        invSection.appendChild(card);
      });
      list.appendChild(invSection);
    }

    const groups = getGroupsFor(state.config.blipId);
    groups.forEach((group) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'chat-hub-row glass chat-hub-row--group online';
      const avatar = createGroupAvatarElement(group.id, 2);
      avatar.classList.add('chat-hub-avatar');
      const info = document.createElement('div');
      info.className = 'chat-hub-info';
      const nameRow = document.createElement('div');
      nameRow.className = 'chat-hub-name-row';
      const name = document.createElement('span');
      name.className = 'peer-name';
      name.textContent = groupDisplayName(group);
      const grpTag = document.createElement('span');
      grpTag.className = 'chat-hub-group-tag';
      grpTag.dataset.i18n = 'group.badge_grp';
      grpTag.textContent = t('group.badge_grp');
      nameRow.append(name, grpTag);
      const sub = document.createElement('span');
      sub.className = 'peer-id';
      sub.textContent = t('group.hub_sub').replace('{n}', String(group.members.length));
      info.append(nameRow, sub);
      const msgs = getGroupMessages(group.id);
      const last = msgs[msgs.length - 1];
      if (last) {
        const preview = document.createElement('span');
        preview.className = 'chat-hub-preview';
        preview.textContent = (last.text || '').slice(0, 48);
        info.appendChild(preview);
      }
      let voiceCount = 0;
      for (const ch of getVoiceChannels(group)) {
        const snap = getVoiceChannelRoster(group.id, ch.id);
        if (snap.count > voiceCount) voiceCount = snap.count;
      }
      const dot = document.createElement('span');
      dot.className = voiceCount > 0 ? 'status-dot online' : 'status-dot offline';
      dot.title = voiceCount > 0 ? t('group.call_ongoing_hub') : '';
      if (voiceCount > 0) {
        const liveTag = document.createElement('span');
        liveTag.className = 'chat-hub-voice-live';
        liveTag.dataset.i18n = 'group.badge_voice';
        liveTag.textContent = t('group.badge_voice');
        info.appendChild(liveTag);
      }
      item.append(avatar, info, dot);
      const unread = getUnreadByGroup(group.id);
      if (unread > 0) {
        const ub = document.createElement('span');
        ub.className = 'chat-hub-unread';
        ub.textContent = unread > 99 ? '99+' : String(unread);
        item.appendChild(ub);
      }
      item.addEventListener('click', () => openGroupChat(group.id));
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showGroupContextMenu(e, group);
      });
      list.appendChild(item);
    });

    const peerIds = new Set(state.peers.map((p) => p.blipId));
    for (const id of state.chatViews.keys()) peerIds.add(id);
    const rows = [...peerIds]
      .filter((id) => !isBlocked(id))
      .map((id) => {
        const peer = state.peers.find((p) => p.blipId === id);
        const msgs = getMessages(id);
        return {
          blipId: id,
          displayName: formatPeerDisplayName(peer, id),
          online: peer?.online ?? false,
          lastMsg: msgs[msgs.length - 1],
        };
      })
      .sort((a, b) => {
        const af = isFavorite(a.blipId) ? 0 : 1;
        const bf = isFavorite(b.blipId) ? 0 : 1;
        if (af !== bf) return af - bf;
        const ta = a.lastMsg?.timestamp ?? 0;
        const tb = b.lastMsg?.timestamp ?? 0;
        if (tb !== ta) return tb - ta;
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.blipId - b.blipId;
      });
    if (rows.length === 0 && groups.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.dataset.i18n = 'chat.no_chats';
      empty.textContent = t('chat.no_chats');
      list.appendChild(empty);
    } else if (rows.length > 0) {
      rows.forEach((row) => {
        const peer = findPeerByBlipId(row.blipId);
        const rowId = normalizeBlipId(row.blipId);
        const peerForProfile = peer || {
          blipId: rowId, displayName: row.displayName, online: row.online, presence: 'offline',
          presenceText: '', hasProfileGif: rowId != null && peerHasCachedProfileGif(rowId),
        };
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `chat-hub-row glass ${row.online ? 'online' : 'offline'}`;
        const avatar = createAvatarElement(row.blipId, 2, { selfBlipId: state.config.blipId });
        avatar.classList.add('chat-hub-avatar');
        avatar.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          openPeerProfile(peerForProfile);
        });
        const info = document.createElement('div');
        info.className = 'chat-hub-info';
        const name = document.createElement('span');
        name.className = 'peer-name';
        name.textContent = row.displayName;
        const idSpan = document.createElement('span');
        idSpan.className = 'peer-id';
        idSpan.textContent = `#${row.blipId}`;
        info.append(name, idSpan);
        if (row.lastMsg) {
          const preview = document.createElement('span');
          preview.className = 'chat-hub-preview';
          preview.textContent = row.lastMsg.attachment?.kind === 'image'
            ? t('chat.image_preview')
            : row.lastMsg.attachment?.kind === 'file'
              ? t('chat.file_preview').replace('{name}', row.lastMsg.attachment.name || 'file')
              : (row.lastMsg.text || '').slice(0, 48);
          info.appendChild(preview);
        }
        const dot = document.createElement('span');
        dot.className = `status-dot ${peerPresenceClass(peerForProfile)}`;
        const unread = getUnreadByPeer(row.blipId);
        if (unread > 0) {
          const badge = document.createElement('span');
          badge.className = 'chat-hub-unread';
          badge.textContent = unread > 99 ? '99+' : String(unread);
          item.appendChild(badge);
        }
        item.append(avatar, info, dot);
        const openHubChat = () => void openChat(row.blipId);
        item.addEventListener('click', openHubChat);
        item.addEventListener('auxclick', (e) => {
          if (e.button === 1) openHubChat();
        });
        item.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showPeerContextMenu(e, peer || {
            blipId: row.blipId, displayName: row.displayName, online: row.online,
          });
        });
        list.appendChild(item);
      });
    }
    wrap.append(title, list);
    return wrap;
  }
  return { renderChatHubView };
}
