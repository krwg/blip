import net from 'net';
import { DEFAULT_TCP_PORT } from './ports.js';
import { BlipErrorCode, createBlipError } from '../shared/blip-errors.js';

const connectInflight = new Map();

export function connectToPeer(ip, blipId, tcpPort = DEFAULT_TCP_PORT) {
  const key = `${ip}:${blipId}:${tcpPort}`;
  const existing = connectInflight.get(key);
  if (existing) return existing;

  const promise = new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port: tcpPort }, () => {
      socket.setNoDelay(true);
      resolve(socket);
    });

    socket.setTimeout(5000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(
        createBlipError(
          BlipErrorCode.CONNECT_TIMEOUT,
          `Connection timeout to ${ip}:${tcpPort} (#${blipId})`
        )
      );
    });

    socket.on('error', (err) => {
      reject(
        createBlipError(
          BlipErrorCode.CONNECT_FAILED,
          err?.message || `Connect failed to ${ip}:${tcpPort}`,
          err
        )
      );
    });
  }).finally(() => {
    connectInflight.delete(key);
  });

  connectInflight.set(key, promise);
  return promise;
}

import { sendOnSocketQueued } from './tcp-write-queue.js';

export function sendOnSocket(socket, payload) {
  return sendOnSocketQueued(socket, payload);
}

export function pingPeer(ip, tcpPort = DEFAULT_TCP_PORT) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.createConnection({ host: ip, port: tcpPort }, () => {
      const ms = Date.now() - started;
      const payload = JSON.stringify({ type: 'ping' }) + '\n';
      socket.write(payload, () => {
        socket.destroy();
        resolve({ ok: true, ms });
      });
    });
    socket.setTimeout(2000);
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, ms: null });
    });
    socket.on('error', () => resolve({ ok: false, ms: null }));
  });
}
