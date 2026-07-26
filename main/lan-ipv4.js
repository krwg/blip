/** Pure LAN IPv4 helpers (no Electron). */

export function normalizePeerIp(ip) {
  if (!ip || typeof ip !== 'string') return '';
  return ip.replace(/^::ffff:/i, '');
}

/** Directed broadcast for an IPv4 address + netmask (e.g. 192.168.1.255). */
export function ipv4Broadcast(address, netmask) {
  const ip = String(address || '')
    .split('.')
    .map((n) => Number(n));
  const mask = String(netmask || '')
    .split('.')
    .map((n) => Number(n));
  if (ip.length !== 4 || mask.length !== 4) return '';
  if (ip.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return '';
  if (mask.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return '';
  return ip.map((octet, i) => (octet & mask[i]) | (~mask[i] & 255)).join('.');
}

/** Ordered dial candidates for a discovered peer (primary first). */
export function peerDialIps(peer) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const ip = normalizePeerIp(raw);
    if (!ip || seen.has(ip) || ip === '0.0.0.0') return;
    seen.add(ip);
    out.push(ip);
  };
  push(peer?.ip);
  if (Array.isArray(peer?.ips)) {
    for (const ip of peer.ips) push(ip);
  }
  return out;
}
