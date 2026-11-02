import net from 'net';
import { DEFAULT_TCP_PORT } from './ports.js';
import { createTcpLineReader } from './tcp-framing.js';
import {
  initInboundSession,
  clearSocketSession,
  getSocketSession,
} from './mesh-handshake.js';
import { parseMeshTcpLine } from './mesh-session-crypto.js';
import { sendOnSocketQueued } from './tcp-write-queue.js';
import {
  BlipErrorCode,
  destroySocketTagged,
  tagSocketClose,
} from '../shared/blip-errors.js';

const connections = new Map();

export function createTcpServer(handlers, tcpPort = DEFAULT_TCP_PORT) {
  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    const remoteIp = socket.remoteAddress?.replace('::ffff:', '') || '';
    initInboundSession(socket, remoteIp);

    const reader = createTcpLineReader(() => {
      destroySocketTagged(
        socket,
        BlipErrorCode.SOCKET_CLOSED_LINE_TOO_LARGE,
        `inbound line overflow from ${remoteIp}`
      );
    });

    socket.on('data', (chunk) => {
      try {
        const lines = reader.push(chunk);
        for (const line of lines) {
          try {
            const session = getSocketSession(socket);
            const msg = parseMeshTcpLine(session?.cipher || null, line);
            handlers.onMessage(msg, socket, remoteIp);
          } catch (err) {
            if (
              err?.code === 'MESH_PLAINTEXT_AFTER_CIPHER' ||
              err?.code === 'MESH_BAD_ENVELOPE' ||
              err?.code === 'MESH_NO_CIPHER'
            ) {
              destroySocketTagged(
                socket,
                BlipErrorCode.SOCKET_CLOSED_MESH_CRYPTO,
                `${err.code} from ${remoteIp}`
              );
              return;
            }
          }
        }
      } catch (e) {
        if (e?.code === 'LINE_TOO_LARGE') {
          destroySocketTagged(
            socket,
            BlipErrorCode.SOCKET_CLOSED_LINE_TOO_LARGE,
            `LINE_TOO_LARGE from ${remoteIp}`
          );
        } else {
          destroySocketTagged(
            socket,
            BlipErrorCode.SOCKET_ERROR,
            e?.message || `inbound parse error from ${remoteIp}`
          );
        }
      }
    });

    socket.on('error', (err) => {
      if (!socket._blipCloseCode) {
        tagSocketClose(socket, BlipErrorCode.SOCKET_ERROR, err?.message || String(err));
      }
      clearSocketSession(socket);
      destroySocketTagged(
        socket,
        socket._blipCloseCode || BlipErrorCode.SOCKET_ERROR,
        err?.message || 'inbound socket error'
      );
    });

    socket.on('close', (hadError) => {
      if (!socket._blipCloseCode) {
        tagSocketClose(
          socket,
          hadError
            ? BlipErrorCode.SOCKET_CLOSED_AFTER_ERROR
            : BlipErrorCode.SOCKET_CLOSED_REMOTE_EOF,
          hadError ? 'inbound close after error' : 'inbound remote EOF'
        );
      }
      clearSocketSession(socket);
      for (const [key, s] of connections) {
        if (s === socket) connections.delete(key);
      }
    });
  });

  const api = {
    server,
    registerConnection(blipId, socket) {
      if (!socket) {
        connections.delete(blipId);
        return;
      }
      connections.set(blipId, socket);
    },
    /** Drop registration only if it still points at this socket. */
    unregisterConnection(blipId, socket) {
      if (connections.get(blipId) === socket) connections.delete(blipId);
    },
    getConnection(blipId) {
      const socket = connections.get(blipId);
      if (socket && socket.destroyed) {
        connections.delete(blipId);
        return undefined;
      }
      return socket;
    },
    sendTo(blipId, payload) {
      const socket = connections.get(blipId);
      if (socket && !socket.destroyed) {
        void sendOnSocketQueued(socket, payload);
        return true;
      }
      return false;
    },
    broadcast(payload, excludeId) {
      for (const [id, socket] of connections) {
        if (id !== excludeId && !socket.destroyed) {
          void sendOnSocketQueued(socket, payload);
        }
      }
    },
    close() {
      for (const socket of connections.values()) {
        if (!socket.destroyed) socket.destroy();
      }
      connections.clear();
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };

  return new Promise((resolve, reject) => {
    const onEarlyError = (err) => {
      server.off('error', onEarlyError);
      reject(err);
    };
    server.once('error', onEarlyError);
    server.listen(tcpPort, '0.0.0.0', () => {
      server.off('error', onEarlyError);
      server.on('error', (err) => console.error('[TCP server]', err.message));
      console.log(`[TCP] listening on ${tcpPort}`);
      resolve(api);
    });
  });
}
