import net from 'net';
import { TCP_PORT } from './tcp-client.js';

const connections = new Map();

export function createTcpServer(handlers) {
  const server = net.createServer((socket) => {
    let buffer = '';
    const remoteIp = socket.remoteAddress?.replace('::ffff:', '') || '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          handlers.onMessage(msg, socket, remoteIp);
        } catch {
          /* ignore malformed */
        }
      }
    });

    socket.on('close', () => {
      for (const [key, s] of connections) {
        if (s === socket) connections.delete(key);
      }
    });

    socket.on('error', () => socket.destroy());
  });

  server.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`[TCP] listening on ${TCP_PORT}`);
  });

  return {
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
        socket.write(JSON.stringify(payload) + '\n');
        return true;
      }
      return false;
    },
    broadcast(payload, excludeId) {
      for (const [id, socket] of connections) {
        if (id !== excludeId && !socket.destroyed) {
          socket.write(JSON.stringify(payload) + '\n');
        }
      }
    },
  };
}
