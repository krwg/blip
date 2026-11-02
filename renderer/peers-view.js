export function createPeersView({
  getState,
  getMainContent,
  getPeersTyping,
  t,
  isBlocked,
  isFavorite,
  comparePeersFavoriteFirst,
  createTrustedAvatarElement,
  createPixelHintIcon,
  formatPeerDisplayName,
  appendMeshPlusBadgeToNameRow,
  peerPresenceClass,
  peerStatusTooltip,
  formatPeerSubline,
  getPeerLatency,
  openPeerProfile,
  showPeerContextMenu,
  openChat,
}) {
  function renderPeersView() {
    const state = getState();
    const peersTyping = getPeersTyping();
    const wrap = document.createElement('div');
    wrap.className = 'view peers-view';

    const title = document.createElement('h2');
    title.className = 'section-title';
    title.dataset.i18n = 'peers.title';
    title.textContent = t('peers.title');

    const titleRow = document.createElement('div');
    titleRow.className = 'section-title-row';
    titleRow.appendChild(title);
    titleRow.appendChild(createPixelHintIcon('peers.subtitle_hint'));

    const list = document.createElement('div');
    list.className = 'peers-list';
    const online = state.peers.filter((p) => p.online);
    if (online.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.dataset.i18n = 'peers.none';
      empty.textContent = t('peers.none');
      list.appendChild(empty);
    } else {
      const visiblePeers = state.peers.filter((p) => !isBlocked(p.blipId));
      if (visiblePeers.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.dataset.i18n = 'peers.all_blocked';
        empty.textContent = t('peers.all_blocked');
        list.appendChild(empty);
      }
      visiblePeers.sort(comparePeersFavoriteFirst).forEach((peer) => {
        const row = document.createElement('div');
        row.className = `peer-row glass ${peer.online ? 'online' : 'offline'} ${
          isFavorite(peer.blipId) ? 'peer-row--favorite' : ''
        }`;
        row.dataset.peerRow = String(peer.blipId);
        const avatar = createTrustedAvatarElement(peer.blipId, 2, { selfBlipId: state.config.blipId });
        avatar.classList.add('peer-row-avatar');
        avatar.style.cursor = 'pointer';
        avatar.title = t('peers.profile_open');
        avatar.addEventListener('click', (e) => {
          e.stopPropagation();
          openPeerProfile(peer);
        });
        const info = document.createElement('div');
        info.className = 'peer-info';
        const name = document.createElement('span');
        name.className = 'peer-name';
        if (isFavorite(peer.blipId)) {
          const star = document.createElement('span');
          star.className = 'peer-fav-star';
          star.textContent = '★';
          star.title = t('peers.favorite');
          name.appendChild(star);
        }
        name.appendChild(document.createTextNode(formatPeerDisplayName(peer)));
        appendMeshPlusBadgeToNameRow(name, peer);
        if (peer.meshLegacy) {
          const leg = document.createElement('span');
          leg.className = 'peer-handshake-badge peer-handshake-badge--legacy';
          leg.title = t('peers.handshake_legacy');
          leg.textContent = '!';
          name.appendChild(leg);
        } else if (peer.meshTcpEncrypted) {
          const lock = document.createElement('span');
          lock.className = 'peer-handshake-badge peer-handshake-badge--encrypted';
          lock.title = t('peers.channel_encrypted');
          lock.textContent = '▣';
          name.appendChild(lock);
        }
        const idSpan = document.createElement('span');
        idSpan.className = 'peer-id';
        idSpan.textContent = `#${peer.blipId}`;
        const pulseLine = document.createElement('span');
        pulseLine.className = 'peer-pulse';
        pulseLine.dataset.peerPulse = String(peer.blipId);
        pulseLine.textContent = formatPeerSubline(peer);
        pulseLine.classList.toggle('peer-pulse--status', !!(peer.online && (peer.presenceText || '').trim()));
        const lat = getPeerLatency(peer.blipId);
        pulseLine.classList.toggle('peer-pulse--live', peer.online && lat != null);
        pulseLine.classList.toggle('peer-pulse--offline', !peer.online);
        const typingLine = document.createElement('span');
        typingLine.className = 'peer-typing hidden';
        typingLine.dataset.peerTyping = String(peer.blipId);
        if (peersTyping.has(peer.blipId)) {
          typingLine.textContent = t('peers.typing');
          typingLine.classList.remove('hidden');
        }
        info.append(name, pulseLine, typingLine, idSpan);
        const dot = document.createElement('span');
        dot.className = `status-dot ${peerPresenceClass(peer)}`;
        dot.dataset.peerStatusDot = String(peer.blipId);
        dot.title = peerStatusTooltip(peer);
        row.append(avatar, info, dot);
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          showPeerContextMenu(e, peer);
        });
        const openPeerChat = () => void openChat(peer.blipId);
        row.addEventListener('click', openPeerChat);
        row.addEventListener('auxclick', (e) => {
          if (e.button === 1) openPeerChat();
        });
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            void openChat(peer.blipId);
          }
        });
        row.setAttribute('tabindex', '0');
        row.setAttribute('role', 'button');
        row.style.cursor = 'pointer';
        list.appendChild(row);
      });
    }
    wrap.append(titleRow, list);
    return wrap;
  }

  function refreshPeersListDom() {
    const state = getState();
    const mainContent = getMainContent();
    if (state.view !== 'peers' || !mainContent?.isConnected) return;
    mainContent.querySelectorAll('[data-peer-row]').forEach((row) => {
      const id = Number(row.dataset.peerRow);
      const peer = state.peers.find((p) => p.blipId === id);
      if (!peer) return;
      row.classList.toggle('online', !!peer.online);
      row.classList.toggle('offline', !peer.online);
      const dot = row.querySelector('[data-peer-status-dot]');
      if (dot) {
        dot.className = `status-dot ${peerPresenceClass(peer)}`;
        dot.title = peerStatusTooltip(peer);
      }
    });
  }

  function refreshPeersTypingDom() {
    const state = getState();
    const mainContent = getMainContent();
    if (state.view !== 'peers' || !mainContent?.isConnected) return;
    mainContent.querySelectorAll('[data-peer-typing]').forEach((el) => {
      const id = Number(el.dataset.peerTyping);
      const show = getPeersTyping().has(id);
      el.classList.toggle('hidden', !show);
      if (show) el.textContent = t('peers.typing');
    });
  }

  return { renderPeersView, refreshPeersTypingDom, refreshPeersListDom };
}
