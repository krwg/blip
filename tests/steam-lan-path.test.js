import { describe, expect, it } from 'vitest';
import { chooseMeshTransport, isSteamLanOnlyPeer } from '../main/steam-lan-path.js';
import { isSteamLanEndpoint, peerDialIps } from '../main/lan-ipv4.js';

describe('steam-lan-path', () => {
  it('skips steam endpoints in LAN dial lists', () => {
    expect(isSteamLanEndpoint('steam:76561198000000000')).toBe(true);
    expect(
      peerDialIps({
        ip: 'steam:76561198000000000',
        ips: ['steam:76561198000000000', '192.168.1.20'],
      })
    ).toEqual(['192.168.1.20']);
  });

  it('prefers LAN when both paths exist', () => {
    expect(
      chooseMeshTransport(
        {
          ip: '10.0.0.2',
          ips: ['10.0.0.2', 'steam:76561198000000000'],
          steamLan: true,
          steamId64: '76561198000000000',
        },
        { preferLan: true }
      )
    ).toBe('lan');
  });

  it('selects steam when no LAN dial target', () => {
    expect(
      chooseMeshTransport(
        {
          ip: 'steam:76561198000000000',
          ips: ['steam:76561198000000000'],
          steamLan: true,
        },
        { preferLan: true }
      )
    ).toBe('steam');
    expect(
      isSteamLanOnlyPeer({
        ip: 'steam:76561198000000000',
        ips: ['steam:76561198000000000'],
        steamLan: true,
      })
    ).toBe(true);
  });

  it('uses mapped steam flag without peer.steamLan', () => {
    expect(
      chooseMeshTransport({ ip: 'steam:1', ips: ['steam:1'] }, { mappedSteam: true })
    ).toBe('steam');
  });
});
