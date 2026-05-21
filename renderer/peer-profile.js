import { buildProfileCard } from './profile-card.js';
import { getPeerProfileGifDataUrl } from './peer-gif-cache.js';

/**
 * @param {object} peer
 * @param {object} hooks
 */
export function buildPeerProfilePage(peer, hooks = {}) {
  return buildProfileCard(peer, {
    ...hooks,
    showPrivateNote: true,
    showActions: true,
    showBanner: true,
    getProfileGifUrl: async (p) => {
      if (hooks.getProfileGifUrl) return hooks.getProfileGifUrl(p);
      return getPeerProfileGifDataUrl(p.blipId);
    },
  });
}
