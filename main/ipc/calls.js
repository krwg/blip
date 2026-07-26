/**
 * Call / WebRTC signalling IPC (extracted from main/index.js).
 * @see https://github.com/krwg/blip/issues/60
 */

import { ipcMain } from 'electron';
import { serializeSdp } from '../call-wire.js';
import {
  BlipErrorCode,
  createBlipError,
  blipErrorIpcPayload,
} from '../../shared/blip-errors.js';

/**
 * @param {object} deps
 * @param {() => object|null} deps.getConfig
 * @param {(to: number, packet: object) => Promise<void>} deps.sendCallToPeer
 * @param {(peerId: number|null) => void} deps.setActiveCallPeer
 * @param {(peerId?: number|null) => void} deps.clearActiveCallPeer
 * @param {(peerId: number) => object|null} deps.findPeer
 * @param {(peerId: number) => Promise<void>} deps.ensurePeerSocket
 * @param {(channel: string, data: object, opts?: object) => Promise<void>} deps.sendToCallWindow
 * @param {() => import('electron').BrowserWindow|null} deps.getCallWindow
 */
export function registerCallIpc(deps) {
  const {
    getConfig,
    sendCallToPeer,
    setActiveCallPeer,
    clearActiveCallPeer,
    findPeer,
    ensurePeerSocket,
    sendToCallWindow,
    getCallWindow,
  } = deps;

  ipcMain.handle('initiate-call', async (_, payload) => {
    const config = getConfig();
    try {
      const sdp = serializeSdp(payload.sdp);
      if (!sdp) return { ok: false, error: 'Invalid local SDP' };
      const packet = {
        type: 'call-offer',
        from: config.blipId,
        to: payload.to,
        sdp,
        video: payload.video ?? false,
      };
      try {
        await sendCallToPeer(payload.to, packet);
      } catch (err) {
        if (/peer not found/i.test(err?.message || '')) {
          await new Promise((r) => setTimeout(r, 450));
          await sendCallToPeer(payload.to, packet);
        } else {
          throw err;
        }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-accept', async (_, payload) => {
    const config = getConfig();
    try {
      const sdp = serializeSdp(payload.sdp);
      if (!sdp) return { ok: false, error: 'Invalid local SDP' };
      await sendCallToPeer(payload.to, {
        type: 'call-answer',
        from: config.blipId,
        to: payload.to,
        sdp,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-reject', async (_, payload) => {
    const config = getConfig();
    try {
      await sendCallToPeer(payload.to, {
        type: 'call-reject',
        from: config.blipId,
        to: payload.to,
      });
      return { ok: true };
    } catch {
      return { ok: true };
    }
  });

  ipcMain.handle('call-candidate', async (_, payload) => {
    const config = getConfig();
    try {
      await sendCallToPeer(payload.to, {
        type: 'call-candidate',
        from: config.blipId,
        to: payload.to,
        candidate: payload.candidate,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-hangup', async (_, payload) => {
    const config = getConfig();
    try {
      clearActiveCallPeer(payload.to);
      await sendCallToPeer(payload.to, {
        type: 'call-hangup',
        from: config.blipId,
        to: payload.to,
      });
      return { ok: true };
    } catch {
      clearActiveCallPeer();
      return { ok: true };
    }
  });

  ipcMain.handle('call-state', async (_, payload) => {
    const config = getConfig();
    try {
      await sendCallToPeer(payload.to, {
        type: 'call-state',
        from: config.blipId,
        to: payload.to,
        muted: !!payload.muted,
        deafened: !!payload.deafened,
        screenSharing: !!payload.screenSharing,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-renegotiate', async (_, payload) => {
    const config = getConfig();
    try {
      const sdp = serializeSdp(payload.sdp);
      if (!sdp) return { ok: false, error: 'Invalid local SDP' };
      await sendCallToPeer(payload.to, {
        type: 'call-renegotiate',
        from: config.blipId,
        to: payload.to,
        sdp,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('call-renegotiate-answer', async (_, payload) => {
    const config = getConfig();
    try {
      const sdp = serializeSdp(payload.sdp);
      if (!sdp) return { ok: false, error: 'Invalid local SDP' };
      await sendCallToPeer(payload.to, {
        type: 'call-renegotiate-answer',
        from: config.blipId,
        to: payload.to,
        sdp,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('open-call-outgoing', async (_, payload) => {
    try {
      const peerId = Number(payload?.peerId);
      if (!Number.isFinite(peerId)) {
        return blipErrorIpcPayload(
          createBlipError(BlipErrorCode.INVALID_PEER_ID, 'invalid_peer')
        );
      }
      const peer = findPeer(peerId);
      if (!peer) {
        return blipErrorIpcPayload(
          createBlipError(BlipErrorCode.PEER_NOT_FOUND, 'Peer not found')
        );
      }
      if (!peer.online) {
        return blipErrorIpcPayload(
          createBlipError(BlipErrorCode.PEER_OFFLINE, 'Peer offline')
        );
      }
      await ensurePeerSocket(peerId);
      setActiveCallPeer(peerId, { video: payload.video ?? false });
      await sendToCallWindow(
        'call-outgoing',
        { peerId, video: payload.video ?? false },
        { focus: true }
      );
      return { ok: true };
    } catch (err) {
      clearActiveCallPeer();
      const wrapped =
        err?.blipCode != null
          ? err
          : createBlipError(BlipErrorCode.CALL_ENSURE_FAILED, err?.message || 'call ensure failed', err);
      return blipErrorIpcPayload(wrapped);
    }
  });

  ipcMain.handle('close-call-window', () => {
    const callWindow = getCallWindow?.();
    if (callWindow && !callWindow.isDestroyed()) {
      callWindow.hide();
    }
    return true;
  });

  ipcMain.handle('call-window-toggle-fullscreen', () => {
    const callWindow = getCallWindow?.();
    if (!callWindow || callWindow.isDestroyed()) return false;
    const next = !callWindow.isFullScreen();
    callWindow.setFullScreen(next);
    return next;
  });

  ipcMain.handle('call-window-is-fullscreen', () => {
    const callWindow = getCallWindow?.();
    if (!callWindow || callWindow.isDestroyed()) return false;
    return callWindow.isFullScreen();
  });
}
