import { t } from './i18n.js';
import {
  getGroup,
  saveGroup,
  deleteGroup,
  getAllGroups,
  amHost,
  pickNextHost,
  addGroupMessage,
  generateGroupId,
  groupDisplayName,
  removeMemberFromGroup,
} from './groups.js';
import { showAppToast } from './toasts.js';
import { sounds } from './audio.js';
import { openConfirmDialog } from './confirm-dialog.js';
import {
  joinGroupCall,
  leaveGroupCall,
  handleGroupCallSignal,
  handleGroupCallStart,
  handleGroupCallEnd,
  relayGroupCallSignal,
  isInGroupCall,
} from './group-call.js';

function onlineMemberIds(statePeers) {
  return new Set(
    (statePeers || [])
      .filter((p) => p.online)
      .map((p) => Number(p.blipId))
      .filter(Number.isFinite)
  );
}

/** Leave group locally and notify mesh. */
export async function leaveGroup(api, config, groupId, statePeers) {
  const group = getGroup(groupId);
  if (!group) return;
  const myId = config.blipId;
  if (!group.members.includes(myId)) return;

  if (isInGroupCall()) await leaveGroupCall();

  const wasHost = amHost(group, myId);
  const online = onlineMemberIds(statePeers);

  for (const m of group.members) {
    if (m === myId) continue;
    await api.sendTcpMessage({
      type: 'group-leave',
      to: m,
      groupId,
      host: group.hostId,
      from: myId,
    });
  }

  const updated = removeMemberFromGroup(groupId, myId);
  if (updated && wasHost) {
    const next = pickNextHost(myId, updated.members, online) ?? updated.members[0];
    updated.hostId = next;
    saveGroup(updated);
    for (const m of updated.members) {
      await api.sendTcpMessage({
        type: 'group-host',
        to: m,
        groupId,
        host: next,
        members: updated.members,
      });
    }
  }
}

/** Dissolve group (host only). */
export async function dissolveGroup(api, config, groupId) {
  const group = getGroup(groupId);
  if (!group) return;
  const myId = config.blipId;
  if (!amHost(group, myId)) return;

  if (isInGroupCall()) await leaveGroupCall();

  for (const m of group.members) {
    if (m === myId) continue;
    await api.sendTcpMessage({
      type: 'group-disband',
      to: m,
      groupId,
      host: myId,
      from: myId,
    });
  }
  deleteGroup(groupId);
}

export async function createGroupFromUi(api, config, memberIds, name, seedPeerId) {
  const myId = config.blipId;
  const groupId = generateGroupId();
  const members = [myId, ...memberIds.filter((id) => id !== myId)];
  const group = {
    id: groupId,
    name: name || t('group.unnamed'),
    hostId: myId,
    members,
    messages: [],
    creatorId: myId,
  };
  saveGroup(group);

  for (const m of members) {
    if (m === myId) continue;
    await api.sendTcpMessage({
      type: 'group-invite',
      to: m,
      groupId,
      host: myId,
      name: group.name,
      members,
    });
  }

  showAppToast({
    title: t('group.created'),
    body: groupDisplayName(group),
    durationMs: 4000,
  });

  return group;
}

export function migrateGroupsHost(groups, onlineIds, api, config) {
  const myId = config.blipId;
  for (const group of groups) {
    if (!group.members.includes(myId)) continue;
    if (onlineIds.has(group.hostId)) continue;
    const next = pickNextHost(group.hostId, group.members, onlineIds);
    if (!next) continue;
    group.hostId = next;
    saveGroup(group);
    if (next === myId) {
      for (const m of group.members) {
        if (m === myId) continue;
        void api.sendTcpMessage({
          type: 'group-host',
          to: m,
          groupId: group.id,
          host: next,
          members: group.members,
        });
      }
    }
  }
}

export async function sendGroupChatMessage(api, config, groupId, msg) {
  const group = getGroup(groupId);
  if (!group) return { ok: false };
  const hostId = group.hostId;
  const myId = config.blipId;

  if (amHost(group, myId)) {
    for (const m of group.members) {
      if (m === myId) continue;
      await api.sendTcpMessage({
        type: 'group-msg',
        to: m,
        groupId,
        host: hostId,
        from: myId,
        text: msg.text,
        id: msg.id,
        timestamp: msg.timestamp,
        attachment: msg.attachment,
      });
    }
    return { ok: true };
  }

  return api.sendTcpMessage({
    type: 'group-msg',
    to: hostId,
    groupId,
    host: hostId,
    from: myId,
    text: msg.text,
    id: msg.id,
    timestamp: msg.timestamp,
    attachment: msg.attachment,
  });
}

export async function handleGroupTcpMessage(msg, ctx) {
  const { api, config, getGroupChatView, openGroupChat, bumpGroupUnread } = ctx;
  const myId = config.blipId;
  const type = msg.type;

  if (type === 'group-invite') {
    if (!config.doNotDisturb) sounds.groupInvite();
    const ok = await openConfirmDialog({
      title: t('group.invite_title'),
      body: t('group.invite_body')
        .replace('{name}', msg.name || t('group.unnamed'))
        .replace('{host}', String(msg.host)),
      confirmLabel: t('group.invite_join'),
    });
    if (ok) {
      const group = {
        id: msg.groupId,
        name: msg.name || t('group.unnamed'),
        hostId: Number(msg.host),
        members: [...(msg.members || [])],
        messages: [],
      };
      saveGroup(group);
      await api.sendTcpMessage({
        type: 'group-invite-ack',
        to: msg.host,
        groupId: msg.groupId,
        host: msg.host,
        accept: true,
        from: myId,
      });
      showAppToast({ title: t('group.joined'), body: group.name, durationMs: 4000 });
    } else {
      await api.sendTcpMessage({
        type: 'group-invite-ack',
        to: msg.host,
        groupId: msg.groupId,
        host: msg.host,
        accept: false,
        from: myId,
      });
    }
    return true;
  }

  if (type === 'group-invite-ack') {
    if (!msg.accept) return true;
    return true;
  }

  if (type === 'group-host' || type === 'group-sync') {
    const group = getGroup(msg.groupId);
    if (!group) return true;
    group.hostId = Number(msg.host);
    if (msg.members) group.members = msg.members;
    saveGroup(group);
    getGroupChatView(msg.groupId)?.updateGroup?.(group);
    return true;
  }

  if (type === 'group-msg') {
    const group = getGroup(msg.groupId);
    if (!group || !group.members.includes(myId)) return true;

    const incoming = {
      id: msg.id,
      from: msg.from,
      text: msg.text,
      timestamp: msg.timestamp || Date.now(),
      attachment: msg.attachment,
    };

    if (amHost(group, myId)) {
      if (Number(msg.from) !== myId) {
        addGroupMessage(msg.groupId, { ...incoming, outgoing: false });
        getGroupChatView(msg.groupId)?.handleIncoming?.(incoming);
        for (const m of group.members) {
          if (m === myId || m === Number(msg.from)) continue;
          await api.sendTcpMessage({
            type: 'group-msg',
            to: m,
            groupId: msg.groupId,
            host: group.hostId,
            from: msg.from,
            text: msg.text,
            id: msg.id,
            timestamp: msg.timestamp,
            attachment: msg.attachment,
          });
        }
      }
    } else {
      addGroupMessage(msg.groupId, { ...incoming, outgoing: Number(msg.from) === myId });
      getGroupChatView(msg.groupId)?.handleIncoming?.(incoming);
      bumpGroupUnread?.(msg.groupId);
    }
    return true;
  }

  if (type === 'group-leave') {
    const group = getGroup(msg.groupId);
    if (!group) return true;
    const leaverId = Number(msg.from);
    if (!group.members.includes(leaverId)) return true;
    const wasHost = Number(group.hostId) === leaverId;
    removeMemberFromGroup(msg.groupId, leaverId);
    const updated = getGroup(msg.groupId);
    if (!updated) {
      ctx.onGroupRemoved?.(msg.groupId);
      return true;
    }
    getGroupChatView(msg.groupId)?.updateGroup?.(updated);
    if (wasHost) {
      const online = onlineMemberIds(ctx.statePeers);
      const next = pickNextHost(leaverId, updated.members, online) ?? updated.members[0];
      updated.hostId = next;
      saveGroup(updated);
      if (amHost(updated, myId)) {
        for (const m of updated.members) {
          if (m === myId) continue;
          await api.sendTcpMessage({
            type: 'group-host',
            to: m,
            groupId: msg.groupId,
            host: next,
            members: updated.members,
          });
        }
      }
    }
    ctx.onMemberLeft?.(msg.groupId, leaverId);
    return true;
  }

  if (type === 'group-disband') {
    deleteGroup(msg.groupId);
    ctx.onGroupRemoved?.(msg.groupId);
    showAppToast({ title: t('group.disbanded'), durationMs: 4000 });
    return true;
  }

  if (type === 'group-call-signal') {
    const group = getGroup(msg.groupId);
    const target = Number(msg.target);
    if (group && amHost(group, myId) && target && target !== myId) {
      await relayGroupCallSignal(msg, api);
    } else {
      await handleGroupCallSignal(msg, api);
    }
    return true;
  }

  if (type === 'group-call-start') {
    await handleGroupCallStart(msg, api);
    return true;
  }

  if (type === 'group-call-end') {
    await handleGroupCallEnd(msg);
    return true;
  }

  return false;
}

export { isInGroupCall, joinGroupCall, leaveGroupCall } from './group-call.js';
