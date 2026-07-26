import { describe, expect, it } from 'vitest';
import { ipv4Broadcast, peerDialIps, normalizePeerIp } from '../main/lan-ipv4.js';

describe('lan-ipv4', () => {
  it('computes directed broadcast', () => {
    expect(ipv4Broadcast('192.168.1.42', '255.255.255.0')).toBe('192.168.1.255');
    expect(ipv4Broadcast('10.0.5.9', '255.255.0.0')).toBe('10.0.255.255');
    expect(ipv4Broadcast('bad', '255.255.255.0')).toBe('');
  });

  it('normalizes v4-mapped addresses', () => {
    expect(normalizePeerIp('::ffff:192.168.0.8')).toBe('192.168.0.8');
  });

  it('orders unique dial IPs', () => {
    expect(
      peerDialIps({
        ip: '192.168.1.10',
        ips: ['192.168.1.10', '10.0.0.2', '::ffff:10.0.0.3'],
      })
    ).toEqual(['192.168.1.10', '10.0.0.2', '10.0.0.3']);
  });
});
