/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createViewRouter } from '../renderer/view-router.js';

describe('view-router', () => {
  let state;
  let mainContent;

  beforeEach(() => {
    state = {
      config: { blipId: 1, devBeaconEnabled: false, devProjectsEnabled: false },
      view: 'dial',
      activePeer: null,
      activeGroup: null,
      settingsSection: 'about',
    };
    mainContent = null;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  function makeRouter(overrides = {}) {
    return createViewRouter({
      getState: () => state,
      getApi: () => ({ overlayPushStats: vi.fn() }),
      getMainContent: () => mainContent,
      setMainContent: (el) => {
        mainContent = el;
      },
      runSettingsPanelCleanup: vi.fn(),
      renderView: vi.fn(),
      peerBlipIdEquals: (a, b) => a === b,
      ...overrides,
    });
  }

  it('lists default nav keys and optional beacon/projects', () => {
    const router = makeRouter();
    expect(router.getNavKeys()).toEqual(['dial', 'peers', 'chat', 'settings']);
    state.config.devBeaconEnabled = true;
    state.config.devProjectsEnabled = true;
    expect(router.getNavKeys()).toEqual([
      'dial',
      'peers',
      'chat',
      'beacon',
      'projects',
      'settings',
    ]);
  });

  it('sums peer, group, and invite unread for the nav badge', () => {
    const router = makeRouter();
    document.body.innerHTML = `<button class="nav-btn" data-view="chat"></button>`;
    router.bumpUnread(7);
    router.unreadByGroup.set('g1', 2);
    router.bumpInviteUnread();
    expect(router.getUnreadTotal()).toBe(4);
    const badge = document.querySelector('.nav-unread-badge');
    expect(badge?.textContent).toBe('4');
  });

  it('skips bump when that peer chat is already open', () => {
    state.view = 'chat';
    state.activePeer = 3;
    const router = makeRouter();
    router.bumpUnread(3);
    expect(router.getUnreadTotal()).toBe(0);
    router.bumpUnread(4);
    expect(router.getUnreadTotal()).toBe(1);
  });

  it('navigateToView clears settings section when entering settings', () => {
    const renderView = vi.fn();
    const router = makeRouter({ renderView });
    router.navigateToView('settings');
    expect(state.settingsSection).toBe(null);
    expect(renderView).toHaveBeenCalledWith('settings');
  });
});
