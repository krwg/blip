import { t } from './i18n.js';
import { createAvatarElement } from './avatar.js';
import { MESH_TRUST } from '../shared/trust-levels.js';

let localTrustState = null;

export function setLocalTrustState(state) {
  if (!state) return;
  localTrustState = {
    meshPlusTrust: state.meshPlusTrust || MESH_TRUST.UNVERIFIED_MESH_PLUS,
  };
}

export function getLocalTrustState() {
  if (localTrustState) return localTrustState;
  const live = typeof window !== 'undefined' ? window.trustState : null;
  if (!live) return null;
  return {
    meshPlusTrust: live.meshPlusTrust || MESH_TRUST.UNVERIFIED_MESH_PLUS,
  };
}

/** @deprecated Build official/unofficial tiers removed from product UX. */
export function isOfficialBuildTrust() {
  return false;
}

export function resolvePeerMeshPlusTrust(peer) {
  if (!peer?.meshPlus) return null;
  return MESH_TRUST.OFFICIAL_MESH_PLUS;
}

export function applyMeshPlusTrustClass(el, meshPlusTrust, active = true) {
  if (!el) return;
  el.classList.remove('meshplus-official', 'meshplus-unverified');
  if (!active) return;
  if (meshPlusTrust) {
    el.classList.add('meshplus-official');
    el.removeAttribute('title');
    el.removeAttribute('data-i18n-title');
  }
}

/** Official/unofficial build notices removed — no-op for call sites. */
export function appendAboutBuildTrustNotice() {
  return null;
}

export function createTrustedAvatarElement(blipId, scale, opts) {
  return createAvatarElement(blipId, scale, opts);
}

export function applyPeerMeshPlusBadgeTrust(badge, peer) {
  if (!badge) return;
  badge.classList.remove(
    'mesh-plus-badge--trust-official',
    'mesh-plus-badge--trust-unverified',
  );
  if (!peer?.meshPlus) return;
  badge.classList.add('mesh-plus-badge--trust-official');
  badge.removeAttribute('title');
  badge.removeAttribute('data-i18n-title');
}
