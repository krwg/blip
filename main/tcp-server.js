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

const connections = new Map();

export function createTcpServer(handlers, tcpPort = DEFAULT_TCP_PORT) {
  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    const remoteIp = socket.remoteAddress?.replace('::ffff:', '') || '';
    initInboundSession(socket, remoteIp);

    const reader = createTcpLineReader(() => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
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
              console.warn('[TCP] mesh crypto:', err.code, remoteIp);
              try {
                socket.destroy();
              } catch {
                /* ignore */
              }
              return;
            }
          }
        }
      } catch (e) {
        if (e?.code === 'LINE_TOO_LARGE') {
          console.warn('[TCP] line too large from', remoteIp);
        }
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
    });

    socket.on('close', () => {
      clearSocketSession(socket);
      for (const [key, s] of connections) {
        if (s === socket) connections.delete(key);
      }
    });

    socket.on('error', () => {
      clearSocketSession(socket);
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
    });
  });

  const api = {
    server,
    registerConnection(blipId, socket) {
      connections.set(blipId, socket);
    },
    getConnection(blipId) {
      return connections.get(blipId);
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
