// @ts-nocheck
/**
 * Numbered BLIP error codes for mesh / call diagnostics.
 * UI shows only the number (e.g. `117`); full text lives in README + main-process logs.
 *
 * Ranges:
 *   0       — reserved / OK
 *   100–116 — discovery / connect / handshake (base)
 *   117–139 — granular TCP close / destroy reasons (was lumped as “Socket closed”)
 *   200–299 — calls / signalling
 *   900–999 — unknown / wrap
 */

export const BlipErrorCode = Object.freeze({
  OK: 0,

  PEER_NOT_FOUND: 100,
  PEER_OFFLINE: 101,
  CONNECT_TIMEOUT: 102,
  CONNECT_FAILED: 103,
  /** @deprecated umbrella — prefer 117–125 */
  SOCKET_CLOSED: 104,
  HANDSHAKE_TIMEOUT: 105,
  HANDSHAKE_INVALID_ACK: 106,
  HANDSHAKE_PUBKEY_MISMATCH: 107,
  HANDSHAKE_REJECTED: 108,
  HANDSHAKE_PEER_CLOSED: 109,
  COMPAT_PLAINTEXT: 110,
  UNENCRYPTED_DISABLED: 111,
  PEER_BLOCKED: 112,
  INVALID_PEER_ID: 113,
  COMPAT_RECONNECT_FAILED: 114,
  HANDSHAKE_SEND_FAILED: 115,
  SESSION_MISSING: 116,

  SOCKET_CLOSED_REMOTE_EOF: 117,
  SOCKET_CLOSED_AFTER_ERROR: 118,
  SOCKET_CLOSED_LINE_TOO_LARGE: 119,
  SOCKET_CLOSED_MESH_CRYPTO: 120,
  SOCKET_CLOSED_HANDSHAKE_BAD: 121,
  SOCKET_CLOSED_PEER_BLOCKED: 122,
  SOCKET_CLOSED_AUTH_GATE: 123,
  SOCKET_CLOSED_LOCAL_TIMEOUT: 124,
  SOCKET_ERROR: 125,
  ENSURE_HANDSHAKE_FAILED: 126,
  ENSURE_COMPAT_RETRY: 127,
  SOCKET_CLOSED_BEFORE_WRITE: 128,
  SOCKET_CLOSED_DURING_WAIT: 129,
  PEER_CLASSIFIED_MODERN: 130,
  PEER_CLASSIFIED_LEGACY: 131,

  CALL_OPEN_FAILED: 200,
  CALL_SIGNAL_FAILED: 201,
  CALL_PEER_UNREACHABLE: 202,
  CALL_ENSURE_FAILED: 203,

  UNKNOWN: 999,
});

/** @type {Record<number, { id: string, summary: string, detail: string }>} */
export const BLIP_ERROR_CATALOG = Object.freeze({
  0: { id: 'OK', summary: 'Success', detail: 'No error.' },
  100: {
    id: 'PEER_NOT_FOUND',
    summary: 'Peer not in discovery table',
    detail: 'No online peer with that blipId on the LAN announce table.',
  },
  101: {
    id: 'PEER_OFFLINE',
    summary: 'Peer offline',
    detail: 'Peer row exists but online=false (stale / timed out).',
  },
  102: {
    id: 'CONNECT_TIMEOUT',
    summary: 'TCP connect timeout',
    detail: 'Outbound TCP to peer.tcpPort did not complete in time.',
  },
  103: {
    id: 'CONNECT_FAILED',
    summary: 'TCP connect failed',
    detail: 'Socket error while connecting (refused, unreachable, reset).',
  },
  104: {
    id: 'SOCKET_CLOSED',
    summary: 'Socket closed (unspecified)',
    detail:
      'Legacy umbrella. Prefer 117–129. TCP closed while a handshake waiter was pending without a tagged reason.',
  },
  105: {
    id: 'HANDSHAKE_TIMEOUT',
    summary: 'Handshake timeout',
    detail: 'No mesh-handshake-ack within the handshake window.',
  },
  106: {
    id: 'HANDSHAKE_INVALID_ACK',
    summary: 'Invalid handshake ack',
    detail: 'Ack failed signature / field checks.',
  },
  107: {
    id: 'HANDSHAKE_PUBKEY_MISMATCH',
    summary: 'TOFU pubkey mismatch',
    detail: 'Peer mesh pubkey ≠ knownPeerKeys and announce did not verify a rebind.',
  },
  108: {
    id: 'HANDSHAKE_REJECTED',
    summary: 'Handshake rejected',
    detail: 'Peer destroyed the session (blocked, bad packet, or policy).',
  },
  109: {
    id: 'HANDSHAKE_PEER_CLOSED',
    summary: 'Peer closed during handshake',
    detail:
      'Peer closed TCP during/after mesh-handshake. Morse retries plaintext compat when allowed.',
  },
  110: {
    id: 'COMPAT_PLAINTEXT',
    summary: 'Plaintext compat session',
    detail: 'Skipped or fell back from encrypted handshake; channel is unencrypted (consent on).',
  },
  111: {
    id: 'UNENCRYPTED_DISABLED',
    summary: 'Unencrypted mesh disabled',
    detail: 'Settings → Network → allow older BLIP versions is off; legacy peer refused.',
  },
  112: {
    id: 'PEER_BLOCKED',
    summary: 'Peer blocked',
    detail: 'Local block list refused the session.',
  },
  113: {
    id: 'INVALID_PEER_ID',
    summary: 'Invalid peer id',
    detail: 'Call/open payload peerId is not a finite number.',
  },
  114: {
    id: 'COMPAT_RECONNECT_FAILED',
    summary: 'Compat reconnect failed',
    detail: 'Second TCP connect after handshake close did not stay up.',
  },
  115: {
    id: 'HANDSHAKE_SEND_FAILED',
    summary: 'Handshake send failed',
    detail: 'Could not write mesh-handshake to the socket.',
  },
  116: {
    id: 'SESSION_MISSING',
    summary: 'Mesh session missing',
    detail: 'No session map entry for the socket after handshake failure.',
  },
  117: {
    id: 'SOCKET_CLOSED_REMOTE_EOF',
    summary: 'Remote closed TCP (EOF)',
    detail: 'Peer sent FIN/RST with no local destroy tag — common on ≤1.1.x unknown frames.',
  },
  118: {
    id: 'SOCKET_CLOSED_AFTER_ERROR',
    summary: 'Socket closed after error',
    detail: 'TCP close followed a socket error event (see cause in log).',
  },
  119: {
    id: 'SOCKET_CLOSED_LINE_TOO_LARGE',
    summary: 'Line too large',
    detail: 'TCP framing rejected an oversized line; socket destroyed locally.',
  },
  120: {
    id: 'SOCKET_CLOSED_MESH_CRYPTO',
    summary: 'Mesh crypto framing error',
    detail: 'AES envelope / plaintext-after-cipher mismatch; socket destroyed locally.',
  },
  121: {
    id: 'SOCKET_CLOSED_HANDSHAKE_BAD',
    summary: 'Bad handshake packet',
    detail: 'Inbound mesh-handshake failed verify; socket destroyed locally.',
  },
  122: {
    id: 'SOCKET_CLOSED_PEER_BLOCKED',
    summary: 'Blocked peer handshake',
    detail: 'Inbound handshake from a blocked blipId; socket destroyed locally.',
  },
  123: {
    id: 'SOCKET_CLOSED_AUTH_GATE',
    summary: 'Unauthenticated frame on inbound',
    detail: 'TCP server got an application frame before auth/compat; socket destroyed.',
  },
  124: {
    id: 'SOCKET_CLOSED_LOCAL_TIMEOUT',
    summary: 'Local handshake timeout destroy',
    detail: 'We destroyed the socket after HANDSHAKE_TIMEOUT (non-softFail path).',
  },
  125: {
    id: 'SOCKET_ERROR',
    summary: 'Socket error event',
    detail: 'net.Socket emitted error (ECONNRESET, EPIPE, …).',
  },
  126: {
    id: 'ENSURE_HANDSHAKE_FAILED',
    summary: 'ensurePeerSocket handshake stage failed',
    detail: 'Outbound handshake/compat stage threw; see nested cause code.',
  },
  127: {
    id: 'ENSURE_COMPAT_RETRY',
    summary: 'Retrying plaintext compat',
    detail: 'Informational: first socket died; opening a fresh plaintext session.',
  },
  128: {
    id: 'SOCKET_CLOSED_BEFORE_WRITE',
    summary: 'Socket dead before handshake write',
    detail: 'TCP connected then closed before mesh-handshake could be sent.',
  },
  129: {
    id: 'SOCKET_CLOSED_DURING_WAIT',
    summary: 'Socket closed while waiting for ack',
    detail: 'Handshake was sent; peer closed before mesh-handshake-ack.',
  },
  130: {
    id: 'PEER_CLASSIFIED_MODERN',
    summary: 'Peer classified as Morse (encrypted)',
    detail: 'Discovery: meshProto≥2 + pubkey + verified — encrypted handshake attempted.',
  },
  131: {
    id: 'PEER_CLASSIFIED_LEGACY',
    summary: 'Peer classified as legacy/compat',
    detail: 'Discovery: legacy/compat/unverified — plaintext path preferred.',
  },
  200: {
    id: 'CALL_OPEN_FAILED',
    summary: 'Could not open outgoing call',
    detail: 'ensurePeerSocket / call window failed before offer.',
  },
  201: {
    id: 'CALL_SIGNAL_FAILED',
    summary: 'Call signalling send failed',
    detail: 'TCP write of call-offer / answer / candidate failed.',
  },
  202: {
    id: 'CALL_PEER_UNREACHABLE',
    summary: 'Call peer unreachable',
    detail: 'Peer not online when starting the call UI path.',
  },
  203: {
    id: 'CALL_ENSURE_FAILED',
    summary: 'Call ensurePeerSocket failed',
    detail: 'Outgoing call blocked at mesh socket ensure; see nested code in terminal.',
  },
  999: {
    id: 'UNKNOWN',
    summary: 'Unknown error',
    detail: 'Unclassified exception; see main-process log for the raw message.',
  },
});

/**
 * @param {number} code
 * @param {string} [detail]
 * @param {unknown} [cause]
 */
export function createBlipError(code, detail = '', cause = undefined) {
  const meta = BLIP_ERROR_CATALOG[code] || BLIP_ERROR_CATALOG[999];
  const err = new Error(detail || meta.summary);
  err.blipCode = code;
  err.blipId = meta.id;
  err.blipSummary = meta.summary;
  if (cause !== undefined) err.cause = cause;
  return err;
}

/** Client-facing string: digits only. */
export function formatBlipErrorCode(errOrCode) {
  if (typeof errOrCode === 'number' && Number.isFinite(errOrCode)) return String(errOrCode);
  const code = errOrCode?.blipCode;
  if (typeof code === 'number' && Number.isFinite(code)) return String(code);
  return String(BlipErrorCode.UNKNOWN);
}

export function isSocketCloseFamily(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return false;
  return (
    n === BlipErrorCode.SOCKET_CLOSED ||
    n === BlipErrorCode.HANDSHAKE_PEER_CLOSED ||
    (n >= 117 && n <= 129)
  );
}

/**
 * Tag a socket before destroy so close→clearSocketSession can emit a specific code.
 * @param {import('net').Socket|null|undefined} socket
 * @param {number} code
 * @param {string} [detail]
 */
export function tagSocketClose(socket, code, detail = '') {
  if (!socket) return;
  socket._blipCloseCode = code;
  socket._blipCloseDetail = detail || BLIP_ERROR_CATALOG[code]?.summary || '';
}

/**
 * Destroy with a tagged blip close code (logged).
 * @param {import('net').Socket|null|undefined} socket
 * @param {number} code
 * @param {string} [detail]
 */
export function destroySocketTagged(socket, code, detail = '') {
  if (!socket || socket.destroyed) return;
  tagSocketClose(socket, code, detail);
  console.error(
    `[BLIP E${code}/${BLIP_ERROR_CATALOG[code]?.id || '?'}] destroy: ${detail || BLIP_ERROR_CATALOG[code]?.summary || ''}`
  );
  try {
    socket.destroy();
  } catch {
    /* ignore */
  }
}

/**
 * Map legacy string / node errors onto catalog codes.
 * @param {unknown} err
 */
export function classifyBlipError(err) {
  if (err && typeof err.blipCode === 'number') return err;
  const msg = String(err?.message || err || '');
  const codeName = err?.code;

  if (/unencrypted_mesh_disabled/i.test(msg)) {
    return createBlipError(BlipErrorCode.UNENCRYPTED_DISABLED, msg, err);
  }
  if (/invalid_peer|invalid peer/i.test(msg)) {
    return createBlipError(BlipErrorCode.INVALID_PEER_ID, msg, err);
  }
  if (/peer not found/i.test(msg)) {
    return createBlipError(BlipErrorCode.PEER_NOT_FOUND, msg, err);
  }
  if (codeName === 'HANDSHAKE_TIMEOUT' || /handshake timeout/i.test(msg)) {
    return createBlipError(BlipErrorCode.HANDSHAKE_TIMEOUT, msg, err);
  }
  if (/invalid handshake ack/i.test(msg)) {
    return createBlipError(BlipErrorCode.HANDSHAKE_INVALID_ACK, msg, err);
  }
  if (/socket closed during handshake wait/i.test(msg)) {
    return createBlipError(BlipErrorCode.SOCKET_CLOSED_DURING_WAIT, msg, err);
  }
  if (/socket closed/i.test(msg)) {
    return createBlipError(BlipErrorCode.SOCKET_CLOSED, msg, err);
  }
  if (/peer closed handshake/i.test(msg)) {
    return createBlipError(BlipErrorCode.HANDSHAKE_PEER_CLOSED, msg, err);
  }
  if (codeName === 'ETIMEDOUT' || /connection timeout/i.test(msg)) {
    return createBlipError(BlipErrorCode.CONNECT_TIMEOUT, msg, err);
  }
  if (codeName === 'ECONNREFUSED' || codeName === 'ECONNRESET' || codeName === 'ENETUNREACH' || codeName === 'EPIPE') {
    return createBlipError(BlipErrorCode.CONNECT_FAILED, msg, err);
  }
  if (/timeout/i.test(msg)) {
    return createBlipError(BlipErrorCode.CONNECT_TIMEOUT, msg, err);
  }
  return createBlipError(BlipErrorCode.UNKNOWN, msg, err);
}

/**
 * Always log full diagnostics on main (dev terminal / electron stdout).
 * @param {unknown} err
 * @param {string} [context]
 */
export function logBlipError(err, context = '') {
  const classified = classifyBlipError(err);
  const code = classified.blipCode;
  const id = classified.blipId || 'UNKNOWN';
  const ctx = context ? ` ${context}` : '';
  console.error(`[BLIP E${code}/${id}]${ctx} ${classified.message}`);
  if (classified.blipSummary && classified.blipSummary !== classified.message) {
    console.error(`  summary: ${classified.blipSummary}`);
  }
  const doc = BLIP_ERROR_CATALOG[code];
  if (doc?.detail) console.error(`  detail: ${doc.detail}`);
  if (classified.cause) {
    const c = classified.cause;
    const nested = typeof c?.blipCode === 'number' ? `E${c.blipCode}/${c.blipId || ''} ` : '';
    console.error(`  cause: ${nested}${c?.message || c}`);
  }
  return classified;
}

export function blipErrorIpcPayload(err) {
  const classified = logBlipError(err);
  return {
    ok: false,
    error: formatBlipErrorCode(classified),
    errorCode: classified.blipCode,
    errorId: classified.blipId,
  };
}

/** Snapshot peer discovery fields for dial diagnostics. */
export function formatPeerDialDebug(peer) {
  if (!peer) return 'peer=<null>';
  return [
    `blipId=${peer.blipId}`,
    `ip=${peer.ip}`,
    `tcp=${peer.tcpPort}`,
    `meshProto=${peer.meshProto ?? '?'}`,
    `meshLegacy=${!!peer.meshLegacy}`,
    `meshCompat=${!!peer.meshCompat}`,
    `meshVerified=${!!peer.meshVerified}`,
    `meshPubkey=${peer.meshPubkey ? 'yes' : 'no'}`,
    `encrypted=${!!peer.meshTcpEncrypted}`,
  ].join(' ');
}
