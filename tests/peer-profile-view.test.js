/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPeerProfileView } from '../renderer/peer-profile-view.js';

vi.mock('../renderer/peer-profile.js', () => ({
  buildPeerProfilePage: vi.fn(() => ({
    el: document.createElement('div'),
    refresh: vi.fn(),
    setPeer: vi.fn(),
    destroy: vi.fn(),
  })),
}));

describe('peer-profile-view', () => {
  let state;
  let renderView;

  beforeEach(() => {
    state = {
      view: 'peers',
      activePeer: null,
      activeGroup: null,
      profilePeerId: null,
      profileReturn: null,
      config: { blipId: 1 },
    };
    renderView = vi.fn((view) => {
      state.view = view;
    });
  });

  function makeView(overrides = {}) {
    return createPeerProfileView({
      getState: () => state,
      findPeerByBlipId: (id) =>
        state.peers?.find((p) => p.blipId === id) ?? undefined,
      normalizeBlipId: (id) => {
        const n = Number(id);
        return Number.isFinite(n) ? n : null;
      },
      peerBlipIdEquals: (a, b) => Number(a) === Number(b),
      resolvePeerStub: (peerOrId) =>
        typeof peerOrId === 'object' && peerOrId?.blipId != null
          ? peerOrId
          : { blipId: peerOrId, displayName: '?', online: false, hasProfileGif: false },
      getPeerProfileHooks: () => ({}),
      resolveMainContent: () => null,
      mountMainPanel: vi.fn(() => false),
      renderView,
      render: vi.fn(),
      requestPeerProfileGif: vi.fn(),
      runMeshPulseRound: vi.fn(),
      ...overrides,
    });
  }

  it('enrichPeerForProfile merges live peer row', () => {
    state.peers = [{ blipId: 7, displayName: 'Live', online: true }];
    const view = makeView();
    const peer = view.enrichPeerForProfile({ blipId: 7, displayName: 'Stub' });
    expect(peer.displayName).toBe('Stub');
    expect(peer.online).toBe(true);
  });

  it('leavePeerProfilePage restores navigation state', () => {
    state.view = 'profile';
    state.profilePeerId = 3;
    state.profileReturn = { view: 'chat', activePeer: 3, activeGroup: null };
    const view = makeView();
    view.leavePeerProfilePage();
    expect(state.profilePeerId).toBe(null);
    expect(state.profileReturn).toBe(null);
    expect(state.view).toBe('chat');
    expect(state.activePeer).toBe(3);
    expect(renderView).toHaveBeenCalledWith('chat');
  });

  it('clearProfileNavigationState drops profile ids', () => {
    state.profilePeerId = 2;
    state.profileReturn = { view: 'peers' };
    const view = makeView();
    view.clearProfileNavigationState();
    expect(state.profilePeerId).toBe(null);
    expect(state.profileReturn).toBe(null);
  });
});
