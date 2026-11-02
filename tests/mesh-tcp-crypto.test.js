import { describe, expect, it } from 'vitest';
import {
  generateEcdhKeyPair,
  deriveDirectionalKeys,
  createMeshCipher,
  sealMeshLine,
  parseMeshTcpLine,
  openMeshLine,
} from '../main/mesh-session-crypto.js';
import {
  buildHandshakePacket,
  buildHandshakeAckPacket,
  verifyHandshakePacket,
  verifyAnnouncePayload,
  MESH_PROTO,
  ensureMeshIdentity,
  signCanonical,
  announceCanonical,
  acceptPeerPubkey,
} from '../main/mesh-identity.js';

describe('mesh-session-crypto', () => {
  it('round-trips AES-GCM lines with directional keys', () => {
    const a = generateEcdhKeyPair();
    const b = generateEcdhKeyPair();
    const aKeys = deriveDirectionalKeys(a.privateKey, b.publicKeyB64, 'initiator');
    const bKeys = deriveDirectionalKeys(b.privateKey, a.publicKeyB64, 'responder');
    expect(Buffer.compare(aKeys.sendKey, bKeys.recvKey)).toBe(0);
    expect(Buffer.compare(aKeys.recvKey, bKeys.sendKey)).toBe(0);

    const aCipher = createMeshCipher(aKeys.sendKey, aKeys.recvKey);
    const bCipher = createMeshCipher(bKeys.sendKey, bKeys.recvKey);

    const sealed = sealMeshLine(aCipher, JSON.stringify({ type: 'chat', text: 'hi' }));
    const opened = parseMeshTcpLine(bCipher, sealed);
    expect(opened).toEqual({ type: 'chat', text: 'hi' });
  });

  it('rejects tampered ciphertext', () => {
    const a = generateEcdhKeyPair();
    const b = generateEcdhKeyPair();
    const aKeys = deriveDirectionalKeys(a.privateKey, b.publicKeyB64, 'initiator');
    const bKeys = deriveDirectionalKeys(b.privateKey, a.publicKeyB64, 'responder');
    const aCipher = createMeshCipher(aKeys.sendKey, aKeys.recvKey);
    const bCipher = createMeshCipher(bKeys.sendKey, bKeys.recvKey);
    const sealed = JSON.parse(sealMeshLine(aCipher, '{"type":"x"}'));
    sealed.c = Buffer.from(sealed.c, 'base64').fill(7).toString('base64');
    expect(() => openMeshLine(bCipher, JSON.stringify(sealed))).toThrow();
  });
});

describe('mesh-identity handshake v2', () => {
  it('signs and verifies handshake with ECDH pubkey', () => {
    let cfg = ensureMeshIdentity({});
    const built = buildHandshakePacket(cfg, 3);
    const v = verifyHandshakePacket(built.packet);
    expect(v.ok).toBe(true);
    expect(v.encryptedCapable).toBe(true);
    expect(v.ecdhPubkey).toBeTruthy();

    const ack = buildHandshakeAckPacket(cfg, 7, built.packet.meshPubkey);
    const va = verifyHandshakePacket(ack.packet, 7);
    expect(va.ok).toBe(true);
    expect(va.encryptedCapable).toBe(true);
  });

  it('builds BLIP 1.1.x-compatible handshake v1 (no ECDH)', () => {
    const cfg = ensureMeshIdentity({});
    const built = buildHandshakePacket(cfg, 3, { legacy: true });
    expect(built.packet.meshProto).toBe(1);
    expect(built.packet.ecdhPubkey).toBeUndefined();
    expect(built.ecdhPrivateKey).toBeNull();
    const v = verifyHandshakePacket(built.packet);
    expect(v.ok).toBe(true);
    expect(v.encryptedCapable).toBe(false);
    expect(v.meshProto).toBe(1);

    const ack = buildHandshakeAckPacket(cfg, 7, built.packet.meshPubkey, null, null, {
      legacy: true,
    });
    expect(ack.packet.meshProto).toBe(1);
    expect(ack.packet.ecdhPubkey).toBeUndefined();
    const va = verifyHandshakePacket(ack.packet, 7);
    expect(va.ok).toBe(true);
    expect(va.encryptedCapable).toBe(false);
  });

  it('rebinds TOFU when verified announce carries a new mesh pubkey', () => {
    const cfg = {
      knownPeerKeys: { '9': 'old-key' },
    };
    expect(acceptPeerPubkey(cfg, 9, 'new-key', null).ok).toBe(false);
    expect(
      acceptPeerPubkey(cfg, 9, 'new-key', {
        blipId: 9,
        meshVerified: true,
        meshPubkey: 'new-key',
      })
    ).toEqual({ ok: true, rebind: true });
    expect(acceptPeerPubkey(cfg, 9, 'old-key', null)).toEqual({ ok: true, rebind: false });
  });

  it('accepts announce proto 1 as legacy and proto 2 as current', () => {
    let cfg = ensureMeshIdentity({});
    const base = {
      blipId: 4,
      displayName: 'T',
      presence: 'online',
      presenceText: '',
      ip: '10.0.0.2',
      udpPort: 1,
      tcpPort: 2,
      meshAnnounceTs: Date.now(),
      meshPubkey: cfg.meshPublicKey,
    };
    const canon = announceCanonical(base);
    const sig = signCanonical(cfg, canon);
    const ok2 = verifyAnnouncePayload({ ...base, meshProto: MESH_PROTO, meshAnnounceSig: sig });
    expect(ok2.ok).toBe(true);
    expect(ok2.meshLegacy).toBe(false);
    const ok1 = verifyAnnouncePayload({ ...base, meshProto: 1, meshAnnounceSig: sig });
    expect(ok1.ok).toBe(true);
    expect(ok1.meshLegacy).toBe(true);
  });
});
