import {
  BUILD_TRUST,
  MESH_TRUST,
  OFFICIAL_BUILD_ISSUER,
} from '../shared/trust-levels.js';
import { verifyBuildAtStartup } from './verify-build.js';
import { resolveEntitlementState } from './mesh-plus-license.js';

let appTrustState = {
  buildTrust: BUILD_TRUST.UNVERIFIED_BUILD,
  meshPlusTrust: MESH_TRUST.UNVERIFIED_MESH_PLUS,
  buildIssuer: '',
  buildVersion: '',
};

export function initAppTrustState(config) {
  const build = verifyBuildAtStartup();
  // Build signature is still verified for signed releases, but the product no longer
  // treats "official vs unofficial client" as a user-facing trust tier.
  const buildTrust = build.verified
    ? BUILD_TRUST.VERIFIED_OFFICIAL
    : BUILD_TRUST.UNVERIFIED_BUILD;

  const licenseOk = resolveEntitlementState(config);
  const meshPlusTrust = licenseOk
    ? MESH_TRUST.OFFICIAL_MESH_PLUS
    : MESH_TRUST.UNVERIFIED_MESH_PLUS;

  appTrustState = {
    buildTrust,
    meshPlusTrust,
    buildIssuer: build.issuer || '',
    buildVersion: build.version || '',
  };
  return getAppTrustState();
}

export function getAppTrustState() {
  return {
    buildTrust: appTrustState.buildTrust,
    meshPlusTrust: appTrustState.meshPlusTrust,
  };
}

export function getBuildAnnounceTrust() {
  return {
    buildVerified: false,
    buildIssuer: '',
    buildVersion: appTrustState.buildVersion || '',
    meshPlusTrust: appTrustState.meshPlusTrust,
  };
}

export function peerBuildTrustFromAnnounce() {
  return BUILD_TRUST.UNVERIFIED_BUILD;
}

export function peerMeshPlusTrustFromAnnounce(data) {
  if (!data?.meshPlus) return null;
  return MESH_TRUST.OFFICIAL_MESH_PLUS;
}

export function refreshMeshPlusTrust(config) {
  const licenseOk = resolveEntitlementState(config);
  appTrustState.meshPlusTrust = licenseOk
    ? MESH_TRUST.OFFICIAL_MESH_PLUS
    : MESH_TRUST.UNVERIFIED_MESH_PLUS;
  return getAppTrustState();
}

// Re-export for callers that still import issuer constant via this module path.
export { OFFICIAL_BUILD_ISSUER };
