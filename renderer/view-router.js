/**
 * Main shell navigation: content host, side nav, unread badges.
 * @see https://github.com/krwg/blip/issues/58
 */

import { t, applyI18n } from './i18n.js';
import { showAppToast } from './toasts.js';

/**
 * @param {object} deps
 * @param {() => object} deps.getState
 * @param {() => object|null} deps.getApi
 * @param {() => HTMLElement|null} deps.getMainContent
 * @param {(el: HTMLElement|null) => void} deps.setMainContent
 * @param {() => void} deps.runSettingsPanelCleanup
 * @param {(view: string, opts?: object) => void} deps.renderView
 * @param {(a: unknown, b: unknown) => boolean} [deps.peerBlipIdEquals]
 */
export function createViewRouter(deps) {
  const {
    getState,
    getApi,
    getMainContent,
    setMainContent,
    runSettingsPanelCleanup,
    renderView,
    peerBlipIdEquals = (a, b) => a === b,
  } = deps;

  const unreadByPeer = new Map();
  const unreadByGroup = new Map();
  let unreadInviteCount = 0;

  function resolveMainContent() {
    const current = getMainContent();
    if (current?.isConnected) return current;
    const found =
      document.querySelector('.app-layout > .main-content') ||
      document.querySelector('.app-body > .main-content');
    if (found) setMainContent(found);
    return getMainContent();
  }

  function mountMainPanel(el, { prevView = null } = {}) {
    const panel = resolveMainContent();
    if (!panel || !el) return false;
    const state = getState();
    const leaving = prevView ?? state.view;
    if (leaving === 'settings') runSettingsPanelCleanup();
    panel.replaceChildren(el);
    applyI18n(panel);
    updateNavActive();
    return true;
  }

  function getUnreadTotal() {
    let n = unreadInviteCount;
    for (const c of unreadByPeer.values()) n += c;
    for (const c of unreadByGroup.values()) n += c;
    return n;
  }

  function updateNavUnreadBadge() {
    const chatBtn = document.querySelector('.nav-btn[data-view="chat"]');
    if (!chatBtn) return;
    const total = getUnreadTotal();
    let badge = chatBtn.querySelector('.nav-unread-badge');
    if (total > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-unread-badge';
        chatBtn.appendChild(badge);
      }
      badge.textContent = total > 99 ? '99+' : String(total);
    } else {
      badge?.remove();
    }
    try {
      getApi()?.overlayPushStats?.({ unread: total });
    } catch {
      /* ignore */
    }
  }

  function bumpInviteUnread() {
    unreadInviteCount += 1;
    updateNavUnreadBadge();
    const state = getState();
    if (
      state.view === 'chat' &&
      !state.activePeer &&
      !state.activeGroup &&
      getMainContent()
    ) {
      renderView('chat');
    }
  }

  function clearInviteUnread() {
    if (unreadInviteCount <= 0) return;
    unreadInviteCount = 0;
    updateNavUnreadBadge();
  }

  function bumpUnread(peerId) {
    const state = getState();
    if (state.view === 'chat' && peerBlipIdEquals(state.activePeer, peerId)) return;
    unreadByPeer.set(peerId, (unreadByPeer.get(peerId) || 0) + 1);
    updateNavUnreadBadge();
  }

  function clearUnread(peerId) {
    if (!unreadByPeer.has(peerId)) return;
    unreadByPeer.delete(peerId);
    updateNavUnreadBadge();
  }

  function updateNavActive() {
    const state = getState();
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const view = btn.dataset.view;
      let active = view === state.view;
      if (view === 'chat' && state.view === 'chat') active = true;
      btn.classList.toggle('active', active);
    });
    updateNavUnreadBadge();
  }

  function getNavKeys() {
    const state = getState();
    const keys = ['dial', 'peers', 'chat'];
    if (state.config?.devBeaconEnabled) keys.push('beacon');
    if (state.config?.devProjectsEnabled) keys.push('projects');
    keys.push('settings');
    return keys;
  }

  function createNav(onNavigate) {
    const nav = document.createElement('nav');
    nav.className = 'side-nav glass';
    getNavKeys().forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'nav-btn';
      btn.dataset.view = key;
      btn.dataset.i18n = `nav.${key}`;
      btn.textContent = t(`nav.${key}`);
      btn.addEventListener('click', () => onNavigate(key));
      nav.appendChild(btn);
    });
    return nav;
  }

  function navigateToView(view) {
    const state = getState();
    if (!state.config?.blipId) return;
    if (view === 'beacon' && !state.config?.devBeaconEnabled) {
      showAppToast({
        title: t('settings.dev_beacon_off'),
        durationMs: 3500,
      });
      return;
    }
    if (view === 'settings' && state.view !== 'settings') {
      state.settingsSection = null;
    }
    if (view === 'chat' && state.view === 'chat' && state.activePeer) {
      state.activePeer = null;
    }
    renderView(view);
  }

  function clearUnreadMaps() {
    unreadByPeer.clear();
    unreadByGroup.clear();
    unreadInviteCount = 0;
  }

  return {
    unreadByPeer,
    unreadByGroup,
    resolveMainContent,
    mountMainPanel,
    getUnreadTotal,
    bumpInviteUnread,
    clearInviteUnread,
    bumpUnread,
    clearUnread,
    updateNavUnreadBadge,
    updateNavActive,
    getNavKeys,
    createNav,
    navigateToView,
    clearUnreadMaps,
  };
}
