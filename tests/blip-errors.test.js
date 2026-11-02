import { describe, expect, it } from 'vitest';
import {
  BlipErrorCode,
  createBlipError,
  classifyBlipError,
  formatBlipErrorCode,
  BLIP_ERROR_CATALOG,
  isSocketCloseFamily,
  tagSocketClose,
} from '../shared/blip-errors.js';
import {
  peerPrefersPlaintextCompat,
  shouldSoftFailHandshake,
} from '../main/mesh-compat.js';

describe('blip-errors', () => {
  it('catalog covers every BlipErrorCode value', () => {
    for (const code of Object.values(BlipErrorCode)) {
      expect(BLIP_ERROR_CATALOG[code]).toBeTruthy();
      expect(BLIP_ERROR_CATALOG[code].id).toBeTruthy();
    }
  });

  it('formats client-facing digits only', () => {
    const err = createBlipError(BlipErrorCode.SOCKET_CLOSED_DURING_WAIT, 'wait');
    expect(formatBlipErrorCode(err)).toBe('129');
    expect(classifyBlipError(new Error('Socket closed')).blipCode).toBe(104);
  });

  it('classifies unencrypted_mesh_disabled', () => {
    expect(classifyBlipError(new Error('unencrypted_mesh_disabled')).blipCode).toBe(111);
  });

  it('treats granular close codes as close-family', () => {
    expect(isSocketCloseFamily(104)).toBe(true);
    expect(isSocketCloseFamily(117)).toBe(true);
    expect(isSocketCloseFamily(129)).toBe(true);
    expect(isSocketCloseFamily(109)).toBe(true);
    expect(isSocketCloseFamily(105)).toBe(false);
  });

  it('includes display / overlay / boot catalog ranges', () => {
    expect(BlipErrorCode.CAPTURE_PICKER_EMPTY).toBe(304);
    expect(BlipErrorCode.OVERLAY_PUSH_FAILED).toBe(310);
    expect(BlipErrorCode.BOOT_PRELOAD_MISSING).toBe(320);
    expect(BLIP_ERROR_CATALOG[304]?.id).toBe('CAPTURE_PICKER_EMPTY');
    expect(BLIP_ERROR_CATALOG[320]?.id).toBe('BOOT_PRELOAD_MISSING');
  });

  it('tagSocketClose stores code on socket object', () => {
    const sock = {};
    tagSocketClose(sock, BlipErrorCode.SOCKET_CLOSED_REMOTE_EOF, 'eof');
    expect(sock._blipCloseCode).toBe(117);
    expect(sock._blipCloseDetail).toBe('eof');
  });
});

describe('legacy plaintext preference', () => {
  it('treats meshLegacy / proto<2 / missing pubkey / unverified as plaintext peers', () => {
    expect(peerPrefersPlaintextCompat({ meshLegacy: true })).toBe(true);
    expect(peerPrefersPlaintextCompat({ meshProto: 1, meshPubkey: 'x' })).toBe(true);
    expect(peerPrefersPlaintextCompat({ meshProto: 2, meshPubkey: 'x', meshVerified: true })).toBe(
      false
    );
    expect(peerPrefersPlaintextCompat({ meshProto: 2, meshPubkey: 'x', meshVerified: false })).toBe(
      true
    );
    expect(peerPrefersPlaintextCompat({ meshProto: 2 })).toBe(true);
  });

  it('soft-fails handshake only when unencrypted allowed and peer is legacy', () => {
    expect(
      shouldSoftFailHandshake({ allowUnencryptedMesh: true }, { meshLegacy: true })
    ).toBe(true);
    expect(
      shouldSoftFailHandshake({ allowUnencryptedMesh: false }, { meshLegacy: true })
    ).toBe(false);
    expect(
      shouldSoftFailHandshake(
        { allowUnencryptedMesh: true },
        { meshProto: 2, meshPubkey: 'abc', meshVerified: true }
      )
    ).toBe(false);
  });
});
