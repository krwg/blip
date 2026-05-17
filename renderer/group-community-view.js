import { t } from './i18n.js';
import {
  groupDisplayName,
  amHost,
  getTextChannels,
  getVoiceChannels,
  formatChannelLabel,
} from './groups.js';
import { getVoiceChannelRoster } from './voice-channel-roster.js';
import {
  isInVoiceChannel,
  getActiveVoiceChannel,
  joinVoiceChannel,
  leaveVoiceChannel,
} from './voice-channel.js';
import { createVoiceStage } from './voice-channel-ui.js';
import { createGroupChatView } from './group-chat.js';

/**
 * Group layout: channel sidebar (left) + text chat + voice stage.
 */
export function createGroupCommunityView(
  group,
  config,
  onSend,
  onBack,
  onGroupMenu,
  onSendFile,
  api
) {
  const root = document.createElement('div');
  root.className = 'group-community';

  const sidebar = document.createElement('aside');
  sidebar.className = 'group-sidebar glass';

  const sideHead = document.createElement('div');
  sideHead.className = 'group-sidebar-head';
  if (onBack) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn-accent group-sidebar-back';
    backBtn.textContent = '←';
    backBtn.addEventListener('click', onBack);
    sideHead.appendChild(backBtn);
  }
  const sideTitle = document.createElement('span');
  sideTitle.className = 'group-sidebar-title';
  sideTitle.textContent = groupDisplayName(group);
  const sideMeta = document.createElement('span');
  sideMeta.className = 'group-sidebar-meta';
  sideMeta.textContent = amHost(group, config.blipId)
    ? t('group.you_host')
    : t('group.host_line').replace('{id}', String(group.hostId));
  sideHead.appendChild(sideTitle);
  sideHead.appendChild(sideMeta);
  sidebar.appendChild(sideHead);

  const textLabel = document.createElement('div');
  textLabel.className = 'group-sidebar-section';
  textLabel.dataset.i18n = 'voice.text_channels';
  textLabel.textContent = t('voice.text_channels');
  sidebar.appendChild(textLabel);

  const textList = document.createElement('div');
  textList.className = 'group-channel-list';
  sidebar.appendChild(textList);

  const voiceLabel = document.createElement('div');
  voiceLabel.className = 'group-sidebar-section';
  voiceLabel.dataset.i18n = 'voice.voice_channels';
  voiceLabel.textContent = t('voice.voice_channels');
  sidebar.appendChild(voiceLabel);

  const voiceList = document.createElement('div');
  voiceList.className = 'group-channel-list';
  sidebar.appendChild(voiceList);

  const body = document.createElement('div');
  body.className = 'group-community-body';

  let activeTextId = getTextChannels(group)[0]?.id || 'text-general';
  let joinedVoiceId = null;
  const voiceStages = new Map();

  const chat = createGroupChatView(
    group,
    config,
    onSend,
    null,
    null,
    onGroupMenu,
    null,
    onSendFile
  );
  chat.el.classList.add('group-community-chat');
  if (chat.el.querySelector('.group-call-ongoing')) {
    chat.el.querySelector('.group-call-ongoing')?.remove();
  }
  const callBtn = chat.el.querySelector('.chat-header .btn-accent');
  callBtn?.remove();

  body.appendChild(chat.el);
  root.appendChild(sidebar);
  root.appendChild(body);

  function ensureVoiceStage(channelId) {
    if (!voiceStages.has(channelId)) {
      const stage = createVoiceStage(config, group.id, channelId);
      voiceStages.set(channelId, stage);
      body.insertBefore(stage.el, chat.el);
    }
    return voiceStages.get(channelId);
  }

  function refreshSidebar() {
    textList.innerHTML = '';
    voiceList.innerHTML = '';

    getTextChannels(group).forEach((ch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'group-channel-btn';
      if (ch.id === activeTextId) btn.classList.add('group-channel-btn--active');
      btn.innerHTML = `<span class="group-channel-icon">#</span><span class="group-channel-name">${formatChannelLabel(ch)}</span>`;
      btn.addEventListener('click', () => {
        activeTextId = ch.id;
        refreshSidebar();
      });
      textList.appendChild(btn);
    });

    getVoiceChannels(group).forEach((ch) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = getActiveVoiceChannel();
      const inCh =
        active?.groupId === group.id && active?.channelId === ch.id && isInVoiceChannel();
      btn.className = 'group-channel-btn group-channel-btn--voice';
      if (inCh) btn.classList.add('group-channel-btn--live');
      const snap = getVoiceChannelRoster(group.id, ch.id);
      const count = snap.count || 0;
      btn.innerHTML = `<span class="group-channel-icon">◇</span><span class="group-channel-name">${formatChannelLabel(ch)}</span><span class="group-channel-badge">${count}</span>`;
      btn.addEventListener('click', () => {
        void toggleVoice(ch.id);
      });
      voiceList.appendChild(btn);
    });
  }

  async function toggleVoice(channelId) {
    const active = getActiveVoiceChannel();
    if (active?.groupId === group.id && active?.channelId === channelId && isInVoiceChannel()) {
      await leaveVoiceChannel();
      joinedVoiceId = null;
      voiceStages.forEach((s) => s.refresh());
      refreshSidebar();
      return;
    }
    await joinVoiceChannel(group.id, channelId, api, config);
    joinedVoiceId = channelId;
    const stage = ensureVoiceStage(channelId);
    stage.refresh();
    refreshSidebar();
  }

  const onVoiceState = () => refreshSidebar();
  window.addEventListener('blip-voice-channel-state', onVoiceState);

  refreshSidebar();

  return {
    el: root,
    renderMessages: () => chat.renderMessages(),
    handleIncoming: (msg) => chat.handleIncoming(msg),
    updateGroup(next) {
      group.hostId = next.hostId;
      group.members = next.members;
      if (next.channels) group.channels = next.channels;
      chat.updateGroup(next);
      refreshSidebar();
    },
    refreshChannels: refreshSidebar,
    destroy() {
      window.removeEventListener('blip-voice-channel-state', onVoiceState);
      chat.destroy?.();
      voiceStages.forEach((s) => s.destroy());
      voiceStages.clear();
    },
  };
}
