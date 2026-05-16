import { t } from './i18n.js';
import { getGroup, saveGroup, amHost, isGroupMember, normalizeMemberIds } from './groups.js';
import { sounds } from './audio.js';
import { showAppToast } from './toasts.js';

const ICE = [];
/** @type {Map<number, RTCPeerConnection>} */
const peers = new Map();
/** @type {Map<number, RTCIceCandidateInit[]>} */
const pendingCandidates = new Map();
let localStream = null;
let activeGroupId = null;
let panelEl = null;
let apiRef = null;

function normalizeSdp(sdp) {
  if (!sdp) return null;
  if (typeof sdp === 'string') return { type: 'offer', sdp };
  if (typeof sdp.type === 'string' && typeof sdp.sdp === 'string') return sdp;
  return null;
}

function peerNum(id) {
  return Number(id);
}

async function getMic() {
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
}

function ensurePanel() {
  if (panelEl?.isConnected) return panelEl;
  panelEl = document.createElement('div');
  panelEl.className = 'group-call-panel glass hidden';
  panelEl.innerHTML = `
    <div class="group-call-head">
      <span class="group-call-title" data-i18n="group.call_active">${t('group.call_active')}</span>
      <button type="button" class="btn btn-danger group-call-leave">${t('group.leave_call')}</button>
    </div>
    <div class="group-call-roster"></div>
  `;
  panelEl.querySelector('.group-call-leave')?.addEventListener('click', () => {
    void leaveGroupCall();
  });
  document.body.appendChild(panelEl);
  return panelEl;
}

function refreshRoster(group) {
  const roster = panelEl?.querySelector('.group-call-roster');
  if (!roster || !group) return;
  roster.innerHTML = '';
  group.members.forEach((id) => {
    const row = document.createElement('div');
    row.className = 'group-call-peer';
    const n = peerNum(id);
    const connected = n === peerNum(apiRef?.config?.blipId) || peers.has(n);
    row.textContent = `#${n}${connected ? ' · ON' : ''}`;
    roster.appendChild(row);
  });
}

async function sendSignal(groupId, targetId, payload) {
  const group = getGroup(groupId);
  if (!group || !apiRef) return;
  const myId = peerNum(apiRef.config?.blipId);
  const hostId = peerNum(group.hostId);
  const target = peerNum(targetId);
  const to = amHost(group, myId) ? target : hostId;
  try {
    const res = await apiRef.sendTcpMessage({
      type: 'group-call-signal',
      to,
      groupId,
      host: hostId,
      target,
      from: myId,
      ...payload,
    });
    if (res?.ok === false) {
      console.warn('[group-call] signal send failed:', res.error);
    }
  } catch (err) {
    console.warn('[group-call] signal send:', err?.message || err);
  }
}

async function flushCandidates(remoteId, pc) {
  const pending = pendingCandidates.get(remoteId);
  if (!pending?.length || !pc?.remoteDescription) return;
  for (const c of pending) {
    try {
      await pc.addIceCandidate(c);
    } catch {
      /* ignore */
    }
  }
  pendingCandidates.delete(remoteId);
}

async function createPc(remoteId, groupId, initiator) {
  const rid = peerNum(remoteId);
  if (peers.has(rid)) return peers.get(rid);
  const pc = new RTCPeerConnection({ iceServers: ICE });
  peers.set(rid, pc);
  pendingCandidates.set(rid, []);

  if (localStream) {
    localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
  }

  pc.ontrack = (ev) => {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.srcObject = ev.streams[0] || new MediaStream([ev.track]);
    audio.dataset.peer = String(rid);
    panelEl?.appendChild(audio);
  };

  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    void sendSignal(groupId, rid, {
      signalKind: 'candidate',
      candidate: ev.candidate.toJSON(),
    });
  };

  if (initiator) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal(groupId, rid, {
      signalKind: 'offer',
      sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
    });
  }

  return pc;
}

function shouldInitiate(myId, remoteId) {
  return peerNum(myId) < peerNum(remoteId);
}

export function isInGroupCall() {
  return !!activeGroupId;
}

export async function joinGroupCall(groupId, api) {
  if (activeGroupId === groupId) {
    apiRef = api;
    refreshRoster(getGroup(groupId));
    return;
  }
  if (activeGroupId) await leaveGroupCall();
  const group = getGroup(groupId);
  if (!group) return;
  apiRef = api;
  activeGroupId = groupId;
  try {
    localStream = await getMic();
  } catch (err) {
    console.error('[group-call] mic:', err);
    showAppToast({
      title: t('group.call_mic_failed'),
      variant: 'danger',
      durationMs: 5000,
    });
    activeGroupId = null;
    return;
  }
  ensurePanel();
  panelEl.classList.remove('hidden');
  refreshRoster(group);

  const myId = peerNum(api.config.blipId);
  const hostId = peerNum(group.hostId);

  for (const m of group.members) {
    const mid = peerNum(m);
    if (mid === myId) continue;
    if (shouldInitiate(myId, mid)) void createPc(mid, groupId, true);
  }

  for (const m of group.members) {
    const mid = peerNum(m);
    if (mid === myId) continue;
    try {
      const res = await api.sendTcpMessage({
        type: 'group-call-start',
        to: mid,
        groupId,
        host: hostId,
        from: myId,
        members: group.members,
      });
      if (res?.ok === false) {
        console.warn('[group-call] invite failed for', mid, res.error);
      }
    } catch (err) {
      console.warn('[group-call] invite failed for', mid, err?.message || err);
    }
  }
}

export async function leaveGroupCall() {
  const gid = activeGroupId;
  const api = apiRef;
  if (gid && api) {
    const group = getGroup(gid);
    const myId = peerNum(api.config.blipId);
    if (group) {
      for (const m of group.members) {
        const mid = peerNum(m);
        if (mid === myId) continue;
        void api.sendTcpMessage({
          type: 'group-call-end',
          to: mid,
          groupId: gid,
          host: group.hostId,
          from: myId,
        });
      }
    }
  }
  for (const pc of peers.values()) pc.close();
  peers.clear();
  pendingCandidates.clear();
  localStream?.getTracks().forEach((tr) => tr.stop());
  localStream = null;
  activeGroupId = null;
  panelEl?.querySelectorAll('audio').forEach((a) => a.remove());
  panelEl?.classList.add('hidden');
}

export async function handleGroupCallSignal(msg, api) {
  const groupId = msg.groupId;
  const group = getGroup(groupId);
  if (!group) return;
  apiRef = api;

  const target = peerNum(msg.target);
  const from = peerNum(msg.from);
  const myId = peerNum(api.config.blipId);

  if (target !== myId && from !== myId) return;

  const remoteId = from === myId ? target : from;
  if (!isGroupMember(group, remoteId) || !isGroupMember(group, myId)) return;

  if (msg.signalKind === 'offer') {
    if (!localStream) {
      activeGroupId = groupId;
      try {
        localStream = await getMic();
      } catch (err) {
        console.error('[group-call] mic on offer:', err);
        showAppToast({
          title: t('group.call_mic_failed'),
          variant: 'danger',
          durationMs: 5000,
        });
        return;
      }
      ensurePanel();
      panelEl.classList.remove('hidden');
    }
    const pc = await createPc(remoteId, groupId, false);
    const offer = normalizeSdp(msg.sdp);
    if (!offer) return;
    await pc.setRemoteDescription(offer);
    await flushCandidates(remoteId, pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendSignal(groupId, remoteId, {
      signalKind: 'answer',
      sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
    });
    refreshRoster(group);
    for (const m of group.members) {
      const mid = peerNum(m);
      if (mid === myId || mid === remoteId) continue;
      if (shouldInitiate(myId, mid)) void createPc(mid, groupId, true);
    }
    return;
  }

  if (msg.signalKind === 'answer') {
    const pc = peers.get(remoteId);
    const answer = normalizeSdp(msg.sdp);
    if (pc && answer) {
      await pc.setRemoteDescription(answer);
      await flushCandidates(remoteId, pc);
    }
    refreshRoster(group);
    return;
  }

  if (msg.signalKind === 'candidate') {
    const pc = peers.get(remoteId);
    if (!pc || !msg.candidate) return;
    if (!pc.remoteDescription) {
      const q = pendingCandidates.get(remoteId) || [];
      q.push(msg.candidate);
      pendingCandidates.set(remoteId, q);
      return;
    }
    try {
      await pc.addIceCandidate(msg.candidate);
    } catch {
      /* ignore */
    }
  }
}

export async function handleGroupCallStart(msg, api) {
  let group = getGroup(msg.groupId);
  if (!group && Array.isArray(msg.members) && msg.members.length) {
    group = {
      id: msg.groupId,
      name: t('group.unnamed'),
      hostId: Number(msg.host),
      members: normalizeMemberIds(msg.members),
      messages: [],
    };
    saveGroup(group);
  }
  if (!group || !isGroupMember(group, api.config.blipId)) return;
  if (activeGroupId === msg.groupId) {
    refreshRoster(group);
    return;
  }
  showAppToastInvite(msg, api);
}

function showAppToastInvite(msg, api) {
  sounds.groupCallInvite();
  showAppToast({
    title: t('group.call_invite'),
    body: t('group.call_invite_body').replace('{id}', String(msg.from)),
    actions: [
      {
        label: t('group.join_call'),
        primary: true,
        onClick: () => void joinGroupCall(msg.groupId, api),
      },
    ],
    durationMs: 12000,
  });
}

export async function handleGroupCallEnd(msg) {
  if (msg.groupId !== activeGroupId) return;
  const remoteId = peerNum(msg.from);
  const pc = peers.get(remoteId);
  if (pc) {
    pc.close();
    peers.delete(remoteId);
  }
  panelEl?.querySelector(`audio[data-peer="${remoteId}"]`)?.remove();
}

/** Host relays WebRTC signals between members. */
export async function relayGroupCallSignal(msg, api) {
  const myId = peerNum(api.config.blipId);
  const group = getGroup(msg.groupId);
  if (!group || !amHost(group, myId)) return;
  const target = peerNum(msg.target);
  const from = peerNum(msg.from);
  if (!target || target === myId) return;
  if (!isGroupMember(group, target) || !isGroupMember(group, from)) return;
  try {
    await api.sendTcpMessage({
      type: 'group-call-signal',
      to: target,
      groupId: msg.groupId,
      host: group.hostId,
      target,
      from,
      signalKind: msg.signalKind,
      sdp: msg.sdp,
      candidate: msg.candidate,
    });
  } catch (err) {
    console.warn('[group-call] relay failed:', err?.message || err);
  }
}
