/**
 * Peer profile page: open, leave, render, and live sync.
 * @see https://github.com/krwg/blip/issues/58
 */

import { t } from './i18n.js';
import { showAppToast } from './toasts.js';
import { buildPeerProfilePage } from './peer-profile.js';
import {
  getPeerProfileGifDisplayUrl,
  isPeerProfileGifIngesting,
  peerHasCachedProfileGif,
} from './peer-gif-cache.js';

/**
 * @param {object} deps
 * @param {() => object} deps.getState
 * @param {(id: unknown) => object|undefined} deps.findPeerByBlipId
 * @param {(id: unknown) => number|null} deps.normalizeBlipId
 * @param {(a: unknown, b: unknown) => boolean} deps.peerBlipIdEquals
 * @param {(peerOrId: unknown) => object} deps.resolvePeerStub
 * @param {(peer: object) => object} deps.getPeerProfileHooks
 * @param {() => HTMLElement|null} deps.resolveMainContent
 * @param {(el: HTMLElement, opts?: object) => boolean} deps.mountMainPanel
 * @param {(view: string, opts?: object) => void} deps.renderView
 * @param {() => void} deps.render
 * @param {(blipId: number) => void|Promise<void>} deps.requestPeerProfileGif
 * @param {() => void|Promise<void>} deps.runMeshPulseRound
 */
export function createPeerProfileView(deps) {
  const {
    getState,
    findPeerByBlipId,
    normalizeBlipId,
    peerBlipIdEquals,
    resolvePeerStub,
    getPeerProfileHooks,
    resolveMainContent,
    mountMainPanel,
    renderView,
    render,
    requestPeerProfileGif,
    runMeshPulseRound,
  } = deps;

  let profilePageCleanup = null;
  let profilePageApi = null;

  function resolvePeerForProfile(peerOrId) {
    if (peerOrId && typeof peerOrId === 'object' && peerOrId.blipId != null) {
      const id = normalizeBlipId(peerOrId.blipId);
      if (id == null) return peerOrId;
      const live = findPeerByBlipId(id);
      const merged = live ? { ...live, ...peerOrId, blipId: id } : { ...peerOrId, blipId: id };
      if (peerHasCachedProfileGif(id) || merged.hasProfileGif) {
        merged.hasProfileGif = true;
      }
      return merged;
    }
    const stub = resolvePeerStub(peerOrId);
    const id = normalizeBlipId(stub?.blipId);
    if (id != null && (peerHasCachedProfileGif(id) || stub.hasProfileGif)) {
      stub.hasProfileGif = true;
    }
    return stub;
  }

  function enrichPeerForProfile(peerOrId) {
    const resolved = resolvePeerForProfile(peerOrId);
    if (!resolved?.blipId) return resolved;
    const id = normalizeBlipId(resolved.blipId);
    if (id == null) return resolved;
    const live = findPeerByBlipId(id);
    const base = live
      ? { ...live, ...resolved, blipId: id }
      : { ...resolved, blipId: id };
    if (peerHasCachedProfileGif(id) || base.hasProfileGif) {
      base.hasProfileGif = true;
    }
    return base;
  }

  function peerWantsProfileGif(peer) {
    const id = normalizeBlipId(peer?.blipId);
    if (id == null) return false;
    return !!peer?.hasProfileGif || peerHasCachedProfileGif(id);
  }

  function maybeRequestProfileGif(peer) {
    const id = normalizeBlipId(peer?.blipId);
    if (id == null) return;
    if (
      peerWantsProfileGif(peer) &&
      !getPeerProfileGifDisplayUrl(id) &&
      !isPeerProfileGifIngesting(id)
    ) {
      void requestPeerProfileGif(id);
    }
  }

  function renderPeerProfileViewInner() {
    profilePageCleanup?.();
    profilePageCleanup = null;
    profilePageApi = null;

    const state = getState();
    const peer = resolvePeerForProfile(state.profilePeerId);
    if (!peer?.blipId) {
      const errWrap = document.createElement('div');
      errWrap.className = 'view peer-profile-view';
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = t('peers.profile_open_failed');
      errWrap.appendChild(p);
      return errWrap;
    }
    maybeRequestProfileGif(peer);
    let built;
    try {
      built = buildPeerProfilePage(peer, getPeerProfileHooks(peer));
    } catch (err) {
      console.error('[BLIP] profile render', err);
      const errWrap = document.createElement('div');
      errWrap.className = 'view peer-profile-view';
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = t('peers.profile_open_failed');
      errWrap.appendChild(p);
      return errWrap;
    }
    profilePageApi = {
      peerId: Number(peer.blipId),
      refresh: built.refresh,
      setPeer: built.setPeer,
      destroy: built.destroy,
    };
    profilePageCleanup = () => {
      profilePageApi?.destroy?.();
      profilePageApi = null;
    };

    const wrap = document.createElement('div');
    wrap.className = 'view peer-profile-view';

    const toolbar = document.createElement('div');
    toolbar.className = 'peer-profile-toolbar';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn btn-lang peer-profile-back';
    backBtn.dataset.i18n = 'peers.profile_back';
    backBtn.textContent = `← ${t('peers.profile_back')}`;
    backBtn.addEventListener('click', () => leavePeerProfilePage());

    const title = document.createElement('h2');
    title.className = 'section-title peer-profile-toolbar-title';
    title.dataset.i18n = 'peers.profile_title';
    title.textContent = t('peers.profile_title');

    toolbar.appendChild(backBtn);
    toolbar.appendChild(title);
    wrap.appendChild(toolbar);
    wrap.appendChild(built.el);

    return wrap;
  }

  function openPeerProfileFromUi(peerOrId) {
    const state = getState();
    const peer = enrichPeerForProfile(peerOrId);
    if (!peer?.blipId) return;
    const id = normalizeBlipId(peer.blipId);
    if (id == null) return;

    const prevView = state.view;
    if (!peerBlipIdEquals(state.profilePeerId, id) && prevView !== 'profile') {
      state.profileReturn = {
        view: prevView,
        activePeer: state.activePeer,
        activeGroup: state.activeGroup,
      };
    }
    state.profilePeerId = id;
    state.view = 'profile';

    maybeRequestProfileGif(peer);

    if (!resolveMainContent()?.isConnected) {
      render();
      return;
    }

    let wrap;
    try {
      wrap = renderPeerProfileViewInner();
    } catch (err) {
      console.error('[BLIP] openPeerProfile', err);
      showAppToast({ title: t('peers.profile_open_failed'), durationMs: 5000 });
      return;
    }
    if (!wrap) return;
    if (mountMainPanel(wrap, { prevView })) {
      void runMeshPulseRound();
    } else {
      render();
    }
  }

  function leavePeerProfilePage() {
    const state = getState();
    const ret = state.profileReturn ?? { view: 'peers', activePeer: null, activeGroup: null };
    profilePageCleanup?.();
    profilePageCleanup = null;
    profilePageApi = null;
    state.profilePeerId = null;
    state.profileReturn = null;
    state.activePeer = ret.activePeer ?? null;
    state.activeGroup = ret.activeGroup ?? null;
    renderView(ret.view);
  }

  function syncPeerProfilePage() {
    const state = getState();
    const peer = enrichPeerForProfile(state.profilePeerId);
    if (!peer?.blipId) return;
    maybeRequestProfileGif(peer);
    if (
      profilePageApi?.refresh &&
      peerBlipIdEquals(profilePageApi.peerId, peer.blipId)
    ) {
      profilePageApi.setPeer?.(peer);
      profilePageApi.refresh();
    }
  }

  function renderPeerProfileView() {
    return renderPeerProfileViewInner();
  }

  function clearProfileNavigationState() {
    profilePageCleanup?.();
    profilePageCleanup = null;
    profilePageApi = null;
    const state = getState();
    state.profilePeerId = null;
    state.profileReturn = null;
  }

  function disposeProfilePageIfMounted() {
    if (!profilePageCleanup) return;
    profilePageCleanup();
    profilePageCleanup = null;
    profilePageApi = null;
  }

  function notifyProfilePeerUpdated(peerOrId) {
    const state = getState();
    const id = normalizeBlipId(
      peerOrId && typeof peerOrId === 'object' ? peerOrId.blipId : peerOrId,
    );
    if (state.view !== 'profile' || !peerBlipIdEquals(state.profilePeerId, id)) return;
    if (profilePageApi?.refresh) {
      const peer = enrichPeerForProfile(peerOrId);
      profilePageApi.setPeer?.(peer);
      profilePageApi.refresh();
    } else {
      renderView('profile', { force: true });
    }
  }

  function refreshOpenProfilePageIfNeeded(mainContent) {
    const state = getState();
    if (state.view !== 'profile' || !mainContent || state.profilePeerId == null) return;
    if (profilePageApi?.refresh) {
      syncPeerProfilePage();
    } else {
      renderView('profile', { force: true });
    }
  }

  return {
    openPeerProfileFromUi,
    leavePeerProfilePage,
    syncPeerProfilePage,
    renderPeerProfileView,
    enrichPeerForProfile,
    clearProfileNavigationState,
    disposeProfilePageIfMounted,
    notifyProfilePeerUpdated,
    refreshOpenProfilePageIfNeeded,
  };
}
