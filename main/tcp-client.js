import net from 'net';
import { DEFAULT_TCP_PORT } from './ports.js';
import { BlipErrorCode, createBlipError } from '../shared/blip-errors.js';
import { sendOnSocketQueued } from './tcp-write-queue.js';

const connectInflight = new Map();

/**
 * @param {string} ip
 * @param {number} blipId
 * @param {number} [tcpPort]
 * @param {{ timeoutMs?: number }} [opts]
 */
export function connectToPeer(ip, blipId, tcpPort = DEFAULT_TCP_PORT, opts = {}) {
  const timeoutMs = Math.max(500, Number(opts.timeoutMs) || 5000);
  const key = `${ip}:${blipId}:${tcpPort}:${timeoutMs}`;
  const existing = connectInflight.get(key);
  if (existing) return existing;

  const promise = new Promise((resolve, reject) => {
    const onConnectTimeout = () => {
      socket.destroy();
      reject(
        createBlipError(
          BlipErrorCode.CONNECT_TIMEOUT,
          `Connection timeout to ${ip}:${tcpPort} (#${blipId})`
        )
      );
    };

    const socket = net.createConnection({ host: ip, port: tcpPort }, () => {
      socket.setTimeout(0);
      socket.off('timeout', onConnectTimeout);
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 10_000);
      resolve(socket);
    });

    socket.setTimeout(timeoutMs);
    socket.on('timeout', onConnectTimeout);

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

/**
 * Race TCP connect across candidate IPs — first success wins (multi-homed peers).
 * @param {string[]} ips
 * @param {number} blipId
 * @param {number} [tcpPort]
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<{ socket: import('net').Socket, ip: string }>}
 */
export function connectToFirstReachable(ips, blipId, tcpPort = DEFAULT_TCP_PORT, opts = {}) {
  const list = [...new Set((ips || []).filter(Boolean))];
  if (!list.length) {
    return Promise.reject(
      createBlipError(BlipErrorCode.CONNECT_FAILED, `No dial IPs for #${blipId}`)
    );
  }
  if (list.length === 1) {
    return connectToPeer(list[0], blipId, tcpPort, opts).then((socket) => ({
      socket,
      ip: list[0],
    }));
  }

  const timeoutMs = Math.max(500, Number(opts.timeoutMs) || 2200);
  return new Promise((resolve, reject) => {
    let remaining = list.length;
    let settled = false;
    /** @type {Error|null} */
    let lastErr = null;

    for (const ip of list) {
      connectToPeer(ip, blipId, tcpPort, { timeoutMs })
        .then((socket) => {
          if (settled) {
            try {
              socket.destroy();
            } catch {
              /* ignore */
            }
            return;
          }
          settled = true;
          resolve({ socket, ip });
        })
        .catch((err) => {
          lastErr = err;
          remaining -= 1;
          if (!settled && remaining <= 0) {
            reject(
              lastErr ||
                createBlipError(BlipErrorCode.CONNECT_FAILED, `Connect failed for #${blipId}`)
            );
          }
        });
    }
  });
}

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
    socket.setTimeout(1200);
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, ms: null });
    });
    socket.on('error', () => resolve({ ok: false, ms: null }));
  });
}
