/**
 * Choose LAN vs SteamLAN transport for a peer that may have both paths.
 * @see https://github.com/krwg/blip/issues/158
 */

import { isSteamLanEndpoint, peerDialIps } from './lan-ipv4.js';

/**
 * @param {object|null|undefined} peer
 * @param {{ mappedSteam?: boolean, preferLan?: boolean }} [opts]
 * @returns {'lan' | 'steam' | null}
 */
export function chooseMeshTransport(peer, opts = {}) {
  const preferLan = opts.preferLan !== false;
  const hasLan = peerDialIps(peer).length > 0;
  const hasSteam =
    !!opts.mappedSteam ||
    !!peer?.steamLan ||
    !!peer?.steamId64 ||
    isSteamLanEndpoint(peer?.ip) ||
    (Array.isArray(peer?.ips) && peer.ips.some((ip) => isSteamLanEndpoint(ip)));

  if (preferLan && hasLan) return 'lan';
  if (hasSteam) return 'steam';
  if (hasLan) return 'lan';
  return null;
}

/**
 * True when the peer is only reachable via SteamLAN (no LAN dial IPs).
 * @param {object|null|undefined} peer
 */
export function isSteamLanOnlyPeer(peer) {
  return chooseMeshTransport(peer, { preferLan: true }) === 'steam';
}
