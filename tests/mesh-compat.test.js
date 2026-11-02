import { describe, expect, it, vi } from 'vitest';
import {
  isUnencryptedMeshAllowed,
  assertMayUseUnencryptedPeer,
  tryLegacyCompatAuth,
  markOutboundCompatSession,
} from '../main/mesh-compat.js';

describe('mesh-compat', () => {
  it('allowUnencryptedMesh defaults on', () => {
    expect(isUnencryptedMeshAllowed({})).toBe(true);
    expect(isUnencryptedMeshAllowed({ allowUnencryptedMesh: false })).toBe(false);
  });

  it('assertMayUseUnencryptedPeer blocks legacy when disabled', () => {
    expect(
      assertMayUseUnencryptedPeer({ allowUnencryptedMesh: false }, { meshLegacy: true }),
    ).toEqual({ ok: false, error: 'unencrypted_mesh_disabled' });
    expect(
      assertMayUseUnencryptedPeer({ allowUnencryptedMesh: false }, { meshTcpEncrypted: true }),
    ).toEqual({ ok: true });
  });

  it('tryLegacyCompatAuth auths discovery peer', () => {
    const session = { authenticated: false };
    const discovery = {
      getPeers: () => [{ blipId: 7, online: true, ip: '10.0.0.2' }],
      noteObservedPeerIp: vi.fn(),
    };
    const r = tryLegacyCompatAuth({
      session,
      msg: { type: 'call-offer', from: 7 },
      config: { allowUnencryptedMesh: true },
      discovery,
      remoteIp: '10.0.0.2',
    });
    expect(r.ok).toBe(true);
    expect(session.authenticated).toBe(true);
    expect(session.compat).toBe(true);
    expect(session.encrypted).toBe(false);
  });

  it('markOutboundCompatSession', () => {
    const session = {};
    markOutboundCompatSession(session, '9');
    expect(session).toMatchObject({
      peerId: 9,
      authenticated: true,
      encrypted: false,
      compat: true,
    });
  });
});
