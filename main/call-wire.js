import { sendOnSocket } from './tcp-client.js';

/**
 * Plain { type, sdp } for JSON over TCP / IPC (RTCSessionDescription does not always stringify).
 */
export function serializeSdp(sdp) {
  if (!sdp) return null;
  if (typeof sdp === 'string') {
    return { type: 'offer', sdp };
  }
  let type = sdp.type;
  let body = sdp.sdp;
  if (body && typeof body === 'object' && typeof body.sdp === 'string') {
    type = body.type ?? type;
    body = body.sdp;
  }
  if (typeof type === 'string' && typeof body === 'string' && body.length > 0) {
    return { type, sdp: body };
  }
  return null;
}

/** Prefer the peer's existing inbound TCP socket (same path the offer arrived on). */
export async function sendCallPayload(tcpServer, ensurePeerSocket, peerBlipId, payload) {
  const socket = tcpServer?.getConnection(peerBlipId);
  if (socket && !socket.destroyed) {
    await sendOnSocket(socket, payload);
    return;
  }
  const fallback = await ensurePeerSocket(peerBlipId);
  await sendOnSocket(fallback, payload);
}
