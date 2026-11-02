/**
 * TCP message types forwarded from main → renderer (inbound allowlist).
 * Keep in sync with renderer handlers (ui.js / projects / groups / files).
 */

/** @type {ReadonlySet<string>} */
export const TCP_FORWARD_TO_RENDERER = new Set([
  'message',
  'typing',
  'receipt',
  'reaction',
  'message-pin',
  'message-edit',
  'group-invite',
  'group-invite-ack',
  'group-msg',
  'group-host',
  'group-sync',
  'group-leave',
  'group-disband',
  'group-call-start',
  'group-call-state',
  'group-call-end',
  'voice-ch-roster',
  'voice-ch-signal',
  'seed-request',
  'seed-chunk',
  'seed-chunks-batch',
  'seed-have',
  'seed-have-request',
  'file-offer',
  'file-chunk',
  'file-chunks-batch',
  'file-done',
  'file-abort',
  'clipboard-push',
  'avatar-share',
  'group-avatar-share',
  'group-avatar-request',
  'profile-gif-share',
  'profile-gif-request',
  'mesh-proj-pad',
  'mesh-proj-board',
  'mesh-proj-canvas',
  'mesh-proj-clipboard',
  'mesh-proj-clipboard-pull',
  'group-proj-pad',
  'group-proj-board',
  'group-proj-canvas',
  'group-proj-clipboard',
  'group-proj-clipboard-pull',
]);

/** Types that may leave the host via send-tcp-message (includes call signalling). */
export const TCP_OUTBOUND_ALLOWED = new Set([
  ...TCP_FORWARD_TO_RENDERER,
  'ping',
  'group-call-signal',
  'call-offer',
  'call-answer',
  'call-candidate',
  'call-reject',
  'call-hangup',
  'call-state',
  'call-renegotiate',
  'call-renegotiate-answer',
  'mesh-handshake',
  'mesh-handshake-ack',
]);

export function isTcpForwardToRenderer(type) {
  return TCP_FORWARD_TO_RENDERER.has(String(type || ''));
}

export function isTcpOutboundAllowed(type) {
  return TCP_OUTBOUND_ALLOWED.has(String(type || ''));
}
