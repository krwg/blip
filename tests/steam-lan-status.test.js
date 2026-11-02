import { describe, expect, it } from 'vitest';
import { getSteamLanStatus, STEAM_LAN_APP_ID } from '../main/steam-lan.js';

describe('getSteamLanStatus', () => {
  it('reports off when SteamLAN is disabled', () => {
    const st = getSteamLanStatus({ steamLanEnabled: false });
    expect(st.enabled).toBe(false);
    expect(st.state).toBe('off');
    expect(st.appId).toBe(STEAM_LAN_APP_ID);
    expect(st.personaName).toBe('');
    expect(st.steamId64).toBe('');
  });

  it('reports unavailable when enabled but runtime is not connected', () => {
    const st = getSteamLanStatus({ steamLanEnabled: true });
    expect(st.enabled).toBe(true);
    expect(['unavailable', 'error']).toContain(st.state);
    expect(st.appId).toBe(STEAM_LAN_APP_ID);
  });
});
