/**
 * Numbered BLIP error codes for mesh / call diagnostics.
 * UI shows only the number (e.g. `104`); full text lives in README + main-process logs.
 *
 * Ranges:
 *   0       — reserved / OK
 *   100–199 — discovery, TCP, handshake, compat
 *   200–299 — calls / signalling
 *   900–999 — unknown / wrap
 */

export const BlipErrorCode = Object.freeze({
  OK: 0,

  PEER_NOT_FOUND: 100,
  PEER_OFFLINE: 101,
  CONNECT_TIMEOUT: 102,
  CONNECT_FAILED: 103,
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

  CALL_OPEN_FAILED: 200,
  CALL_SIGNAL_FAILED: 201,
  CALL_PEER_UNREACHABLE: 202,

  UNKNOWN: 999,
});

/** @type {Record<number, { id: string, summary: string, detail: string }>} */
export const BLIP_ERROR_CATALOG = Object.freeze({
  0: {
    id: 'OK',
    summary: 'Success',
    detail: 'No error.',
  },
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
    summary: 'Socket closed',
    detail: 'TCP socket closed while a handshake waiter was still pending.',
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
      'Typical for BLIP ≤1.1.x: unknown mesh-handshake frame closes TCP. Morse retries plaintext compat.',
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
    detail: 'Second TCP connect after handshake peer-close did not stay up.',
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
  if (/socket closed/i.test(msg)) {
    return createBlipError(BlipErrorCode.SOCKET_CLOSED, msg, err);
  }
  if (/peer closed handshake/i.test(msg)) {
    return createBlipError(BlipErrorCode.HANDSHAKE_PEER_CLOSED, msg, err);
  }
  if (codeName === 'ETIMEDOUT' || /timeout/i.test(msg)) {
    return createBlipError(BlipErrorCode.CONNECT_TIMEOUT, msg, err);
  }
  if (codeName === 'ECONNREFUSED' || codeName === 'ECONNRESET' || codeName === 'ENETUNREACH') {
    return createBlipError(BlipErrorCode.CONNECT_FAILED, msg, err);
  }
  if (/connection timeout/i.test(msg)) {
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
  if (classified.cause && classified.cause !== err) {
    console.error(`  cause: ${classified.cause?.message || classified.cause}`);
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
