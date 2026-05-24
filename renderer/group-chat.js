import { t } from './i18n.js';
import { sounds } from './audio.js';
import { attachEmojiPicker } from './emoji-picker.js';
import {
  encodeChatImageAttachment,
  encodeInlineFileAttachment,
  isImageFile,
  validateChatFile,
  registerMediaPlaceholder,
  INLINE_FILE_BYTES,
} from './chat-attachments.js';
import {
  appendChatMessageBody,
  buildReplyPreview,
  buildForwardSnapshot,
} from './chat-message-content.js';
import { getMaxFileBytes } from './file-transfer-limits.js';
import { createMessageId } from './message-id.js';
import {
  addGroupMessage,
  findGroupMessage,
  getGroupMessages,
  groupDisplayName,
  amHost,
} from './groups.js';
import { getOngoingGroupCall } from './group-call-roster.js';
import { isInGroupCall, getActiveGroupCallId } from './group-call-client.js';
import { openAlertDialog } from './confirm-dialog.js';
import { attachTypingSound } from './typing-sound.js';
import { getGroupPinnedMessageId, setGroupPinnedMessageId } from './chat-pins.js';
import { openForwardPeerPicker } from './chat-forward-picker.js';
import { showAppToast } from './toasts.js';

function formatChatTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatGroupFileLimit(config) {
  const gb = getMaxFileBytes(config) / (1024 * 1024 * 1024);
  return `${gb} GB`;
}

function memberLabel(from, config) {
  const mine = Number(from) === Number(config.blipId);
  return mine ? t('group.you') : `#${from}`;
}

export function createGroupChatView(
  group,
  config,
  onSend,
  onBack,
  onGroupCall,
  onGroupMenu,
  onJoinOngoingCall,
  onSendFile,
  { onPin, getForwardTargets, onForwardToPeer } = {}
) {
  registerMediaPlaceholder(t('chat.image_sent'));
  registerMediaPlaceholder(t('chat.file_sent'));
  registerMediaPlaceholder(t('chat.file_received'));

  const wrap = document.createElement('div');
  wrap.className = 'chat-view group-chat-view';

  const header = document.createElement('div');
  header.className = 'chat-header glass';

  if (onBack) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn-accent chat-back-btn';
    backBtn.textContent = '←';
    backBtn.addEventListener('click', onBack);
    header.appendChild(backBtn);
  }

  const meta = document.createElement('div');
  meta.className = 'chat-peer-meta';
  const name = document.createElement('span');
  name.className = 'chat-peer-name';
  name.textContent = groupDisplayName(group);
  const sub = document.createElement('span');
  sub.className = 'chat-peer-id';
  const hostLabel = amHost(group, config.blipId)
    ? t('group.you_host')
    : t('group.host_line').replace('{id}', String(group.hostId));
  sub.textContent = `${t('group.members')}: ${group.members.length} · ${hostLabel}`;
  meta.appendChild(name);
  meta.appendChild(sub);
  header.appendChild(meta);

  if (onGroupMenu) {
    const openMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onGroupMenu(e, group);
    };
    header.addEventListener('contextmenu', openMenu);
    meta.addEventListener('contextmenu', openMenu);
    name.addEventListener('contextmenu', openMenu);
  }

  if (onGroupCall) {
    const callBtn = document.createElement('button');
    callBtn.type = 'button';
    callBtn.className = 'btn btn-accent';
    callBtn.dataset.i18n = 'group.call';
    callBtn.textContent = t('group.call');
    callBtn.addEventListener('click', () => onGroupCall(group.id));
    header.appendChild(callBtn);
  }

  const ongoingBar = document.createElement('div');
  ongoingBar.className = 'group-call-ongoing glass hidden';
  const ongoingPulse = document.createElement('span');
  ongoingPulse.className = 'group-call-ongoing-pulse';
  ongoingPulse.setAttribute('aria-hidden', 'true');
  const ongoingBody = document.createElement('div');
  ongoingBody.className = 'group-call-ongoing-body';
  const ongoingText = document.createElement('span');
  ongoingText.className = 'group-call-ongoing-text';
  const ongoingJoin = document.createElement('button');
  ongoingJoin.type = 'button';
  ongoingJoin.className = 'btn btn-accent group-call-ongoing-join';
  ongoingJoin.dataset.i18n = 'group.join_call';
  ongoingJoin.textContent = t('group.join_call');
  ongoingJoin.addEventListener('click', () => onJoinOngoingCall?.(group.id));
  ongoingBody.appendChild(ongoingText);
  ongoingBar.appendChild(ongoingPulse);
  ongoingBar.appendChild(ongoingBody);
  ongoingBar.appendChild(ongoingJoin);

  const pinBar = document.createElement('div');
  pinBar.className = 'chat-pin-bar glass hidden';
  const pinLabel = document.createElement('span');
  pinLabel.className = 'chat-pin-label';
  pinLabel.dataset.i18n = 'chat.pinned';
  pinLabel.textContent = t('chat.pinned');
  const pinPreview = document.createElement('button');
  pinPreview.type = 'button';
  pinPreview.className = 'chat-pin-preview btn btn-lang';
  const pinUnpin = document.createElement('button');
  pinUnpin.type = 'button';
  pinUnpin.className = 'chat-pin-unpin btn btn-lang chat-reply-btn--pixel';
  pinUnpin.title = t('chat.unpin');
  pinUnpin.textContent = '×';
  pinBar.appendChild(pinLabel);
  pinBar.appendChild(pinPreview);
  pinBar.appendChild(pinUnpin);

  const messagesEl = document.createElement('div');
  messagesEl.className = 'chat-messages glass';

  let stickToBottom = true;
  messagesEl.addEventListener('scroll', () => {
    const gap = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    stickToBottom = gap < 80;
  });

  const replyBar = document.createElement('div');
  replyBar.className = 'chat-reply-bar hidden';
  const replyLabel = document.createElement('span');
  replyLabel.className = 'chat-reply-label';
  replyLabel.dataset.i18n = 'chat.replying';
  replyLabel.textContent = t('chat.replying');
  const replyPreview = document.createElement('span');
  replyPreview.className = 'chat-reply-preview';
  const replyCancel = document.createElement('button');
  replyCancel.type = 'button';
  replyCancel.className = 'chat-reply-cancel btn btn-lang';
  replyCancel.textContent = '×';
  replyBar.appendChild(replyLabel);
  replyBar.appendChild(replyPreview);
  replyBar.appendChild(replyCancel);

  const inputRow = document.createElement('div');
  inputRow.className = 'chat-input-row';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'chat-attach-input';
  fileInput.hidden = true;

  const fileBtn = document.createElement('button');
  fileBtn.type = 'button';
  fileBtn.className = 'btn btn-accent chat-tool-btn chat-file-btn';
  fileBtn.title = t('chat.attach_file');
  fileBtn.dataset.i18n = 'chat.file_btn';
  fileBtn.textContent = t('chat.file_btn');
  fileBtn.addEventListener('click', () => fileInput.click());

  const emojiBtn = document.createElement('button');
  emojiBtn.type = 'button';
  emojiBtn.className = 'btn btn-lang chat-tool-btn';
  emojiBtn.textContent = t('chat.emoji_btn');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'input chat-text-input';
  input.maxLength = 2000;
  input.placeholder = t('chat.input_placeholder');
  attachEmojiPicker(emojiBtn, input);
  attachTypingSound(input, () => config);

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'btn btn-accent';
  sendBtn.textContent = t('chat.send');

  let pendingReply = null;

  function clearReplyTarget() {
    pendingReply = null;
    replyBar.classList.add('hidden');
  }

  function setReplyTarget(m) {
    if (!m?.id) return;
    const mine = Number(m.from) === Number(config.blipId);
    pendingReply = {
      id: m.id,
      from: m.from,
      fromLabel: memberLabel(m.from, config),
      preview: buildReplyPreview(m, m.from),
      text: m.text || '',
    };
    replyPreview.textContent = pendingReply.preview;
    replyBar.classList.remove('hidden');
    input.focus();
  }

  replyCancel.addEventListener('click', clearReplyTarget);

  function scrollToMessageId(messageId) {
    if (!messageId) return;
    const el = messagesEl.querySelector(`[data-message-id="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('chat-block--highlight');
    setTimeout(() => el.classList.remove('chat-block--highlight'), 1600);
  }

  function renderPinBar() {
    const pinId = getGroupPinnedMessageId(group.id);
    const pinned = pinId ? findGroupMessage(group.id, pinId) : null;
    if (!pinned) {
      pinBar.classList.add('hidden');
      return;
    }
    pinBar.classList.remove('hidden');
    const who = memberLabel(pinned.from, config);
    pinPreview.textContent = `${who}: ${buildReplyPreview(pinned, pinned.from).slice(0, 80)}`;
    pinPreview.onclick = () => scrollToMessageId(pinId);
  }

  pinUnpin.addEventListener('click', () => {
    setGroupPinnedMessageId(group.id, null);
    void onPin?.(group.id, { messageId: null, pinned: false });
    renderPinBar();
  });

  function setPinMessage(m) {
    if (!m?.id) return;
    setGroupPinnedMessageId(group.id, m.id);
    void onPin?.(group.id, { messageId: m.id, pinned: true });
    renderPinBar();
  }

  async function forwardMessage(m) {
    if (!m?.id || typeof onForwardToPeer !== 'function') return;
    const raw = typeof getForwardTargets === 'function' ? getForwardTargets() : [];
    if (!raw.length) {
      void openAlertDialog({ title: t('chat.forward_no_peers') });
      return;
    }
    const targetId = await openForwardPeerPicker(raw);
    if (targetId == null) return;
    const mine = Number(m.from) === Number(config.blipId);
    const fromLabel = memberLabel(m.from, config);
    const forwardFrom = buildForwardSnapshot(m.from, m, fromLabel, {
      groupId: group.id,
      groupName: groupDisplayName(group),
    });
    await onForwardToPeer(targetId, { forwardFrom, sourceMessage: m });
    showAppToast({ title: t('chat.forward_sent'), durationMs: 3200 });
  }

  function openMessageMenu(e, m) {
    e.preventDefault();
    const menuEl = document.createElement('div');
    menuEl.className = 'chat-msg-menu';
    const add = (key, fn) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-menu-item';
      btn.dataset.i18n = key;
      btn.textContent = t(key);
      btn.addEventListener('click', () => {
        menuEl.remove();
        fn();
      });
      menuEl.appendChild(btn);
    };
    if (m.id) {
      add('chat.reply', () => setReplyTarget(m));
      add('chat.pin', () => setPinMessage(m));
      if (onForwardToPeer) add('chat.forward', () => void forwardMessage(m));
      if (m.replyTo?.id) add('chat.jump_reply', () => scrollToMessageId(m.replyTo.id));
    }
    if (!menuEl.childElementCount) return;
    document.body.appendChild(menuEl);
    menuEl.style.position = 'fixed';
    menuEl.style.left = `${Math.min(e.clientX, window.innerWidth - 180)}px`;
    menuEl.style.top = `${Math.min(e.clientY, window.innerHeight - 120)}px`;
    menuEl.style.zIndex = '600';
    requestAnimationFrame(() => {
      document.addEventListener('click', () => menuEl.remove(), { once: true });
    });
  }

  async function publish(msg) {
    const payload = {
      ...msg,
      replyTo: pendingReply ? { ...pendingReply } : undefined,
    };
    clearReplyTarget();
    addGroupMessage(group.id, payload);
    renderMessages();
    sounds.messageSent();
    await onSend?.(group.id, payload);
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await publish({
      id: createMessageId(),
      from: config.blipId,
      text,
      timestamp: Date.now(),
      outgoing: true,
    });
  }

  async function sendAttachment(file) {
    if (!file) return;
    if (!isImageFile(file) && file.size > INLINE_FILE_BYTES && onSendFile) {
      try {
        await onSendFile(group.id, file, () => renderMessages());
      } catch (err) {
        if (err?.message === 'cancelled') return;
        const key =
          err?.message === 'file_too_big'
            ? 'chat.file_too_big_dynamic'
            : 'chat.attach_failed';
        void openAlertDialog({
          title:
            err?.message === 'file_too_big'
              ? t(key).replace('{limit}', formatGroupFileLimit(config))
              : t('chat.attach_failed'),
        });
      }
      return;
    }
    try {
      let attachment;
      let text;
      if (isImageFile(file)) {
        attachment = await encodeChatImageAttachment(file);
        text = '';
      } else {
        validateChatFile(file, config);
        attachment = await encodeInlineFileAttachment(file, config);
        text = t('chat.file_sent');
      }
      await publish({
        id: createMessageId(),
        from: config.blipId,
        text,
        timestamp: Date.now(),
        outgoing: true,
        attachment,
      });
    } catch (err) {
      const key =
        err?.message === 'file_too_big'
          ? 'chat.file_too_big_dynamic'
          : 'chat.attach_failed';
      void openAlertDialog({
        title:
          err?.message === 'file_too_big'
            ? t(key).replace('{limit}', formatGroupFileLimit(config))
            : t('chat.attach_failed'),
      });
    }
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    await sendAttachment(f);
  });

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  inputRow.appendChild(fileBtn);
  inputRow.appendChild(emojiBtn);
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  inputRow.appendChild(fileInput);

  function refreshOngoingBar() {
    const snap = getOngoingGroupCall(group.id);
    const inThisCall = isInGroupCall() && activeGroupMatches();
    if (!snap.active || snap.count === 0 || inThisCall) {
      ongoingBar.classList.add('hidden');
      return;
    }
    ongoingBar.classList.remove('hidden');
    ongoingText.textContent = t('group.call_ongoing_bar').replace('{n}', String(snap.count));
  }

  function activeGroupMatches() {
    return getActiveGroupCallId() === group.id;
  }

  const onCallState = (ev) => {
    if (ev.detail?.groupId === group.id) refreshOngoingBar();
  };
  const onGroupsChanged = (ev) => {
    if (ev.detail?.groupId === group.id) renderMessages();
  };
  window.addEventListener('blip-group-call-state', onCallState);
  window.addEventListener('blip-groups-changed', onGroupsChanged);
  refreshOngoingBar();

  let dragDepth = 0;
  const dropOverlay = document.createElement('div');
  dropOverlay.className = 'chat-drop-overlay hidden';
  dropOverlay.textContent = t('chat.drop_hint');
  dropOverlay.dataset.i18n = 'chat.drop_hint';

  function setDropActive(on) {
    dropOverlay.classList.toggle('hidden', !on);
    wrap.classList.toggle('chat-view--drag', on);
  }

  function hasDropFiles(dt) {
    return !!(dt?.files?.length);
  }

  function onDragEnter(e) {
    e.preventDefault();
    dragDepth += 1;
    if (hasDropFiles(e.dataTransfer)) setDropActive(true);
  }

  function onDragLeave(e) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDropActive(false);
  }

  function onDragOver(e) {
    e.preventDefault();
    if (hasDropFiles(e.dataTransfer)) e.dataTransfer.dropEffect = 'copy';
  }

  async function onDrop(e) {
    e.preventDefault();
    dragDepth = 0;
    setDropActive(false);
    const files = [...(e.dataTransfer?.files || [])];
    for (const file of files) {
      await sendAttachment(file);
    }
  }

  wrap.addEventListener('dragenter', onDragEnter);
  wrap.addEventListener('dragleave', onDragLeave);
  wrap.addEventListener('dragover', onDragOver);
  wrap.addEventListener('drop', onDrop);

  wrap.appendChild(header);
  wrap.appendChild(ongoingBar);
  wrap.appendChild(pinBar);
  wrap.appendChild(messagesEl);
  wrap.appendChild(dropOverlay);
  wrap.appendChild(replyBar);
  wrap.appendChild(inputRow);

  function renderMessages() {
    const msgs = getGroupMessages(group.id);
    const scrollPos = messagesEl.scrollTop;
    messagesEl.innerHTML = '';
    if (!msgs.length) {
      const p = document.createElement('p');
      p.className = 'chat-empty';
      p.textContent = t('chat.empty');
      messagesEl.appendChild(p);
      renderPinBar();
      return;
    }
    msgs.forEach((m) => {
      const block = document.createElement('div');
      const mine = Number(m.from) === Number(config.blipId);
      block.className = `chat-block ${mine ? 'outgoing' : 'incoming'}`;
      block.dataset.messageId = m.id || '';

      const who = document.createElement('span');
      who.className = 'group-msg-from';
      who.textContent = memberLabel(m.from, config);
      block.appendChild(who);

      appendChatMessageBody(block, m, { onQuoteClick: (id) => scrollToMessageId(id) });

      block.addEventListener('contextmenu', (e) => openMessageMenu(e, m));

      const actions = document.createElement('div');
      actions.className = 'chat-block-actions';
      if (m.id) {
        const replyBtn = document.createElement('button');
        replyBtn.type = 'button';
        replyBtn.className = 'btn btn-lang chat-reply-btn chat-reply-btn--pixel';
        replyBtn.title = t('chat.reply');
        replyBtn.innerHTML = '<span class="pixel-glyph pixel-glyph--reply"></span>';
        replyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          setReplyTarget(m);
        });
        actions.appendChild(replyBtn);
      }

      const metaRow = document.createElement('div');
      metaRow.className = 'chat-meta-row';
      if (m.timestamp) {
        const time = document.createElement('span');
        time.className = 'chat-time';
        time.textContent = formatChatTime(m.timestamp);
        metaRow.appendChild(time);
      }
      if (actions.childElementCount) block.appendChild(actions);
      block.appendChild(metaRow);

      messagesEl.appendChild(block);
    });

    if (stickToBottom) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      messagesEl.scrollTop = scrollPos;
    }
    renderPinBar();
  }

  renderMessages();

  return {
    el: wrap,
    renderMessages,
    handleIncoming(msg) {
      const stored = addGroupMessage(group.id, { ...msg, outgoing: false });
      if (!stored) return;
      stickToBottom = true;
      renderMessages();
      sounds.messageReceived();
    },
    handlePin(msg) {
      if (msg.pinned === false || !msg.messageId) {
        setGroupPinnedMessageId(group.id, null);
      } else {
        setGroupPinnedMessageId(group.id, String(msg.messageId));
      }
      renderPinBar();
      renderMessages();
    },
    updateGroup(next) {
      group.hostId = next.hostId;
      group.members = next.members;
      sub.textContent = `${t('group.members')}: ${group.members.length} · ${
        amHost(group, config.blipId)
          ? t('group.you_host')
          : t('group.host_line').replace('{id}', String(group.hostId))
      }`;
      refreshOngoingBar();
    },
    refreshOngoingCall: refreshOngoingBar,
    destroy() {
      window.removeEventListener('blip-group-call-state', onCallState);
      window.removeEventListener('blip-groups-changed', onGroupsChanged);
    },
  };
}
