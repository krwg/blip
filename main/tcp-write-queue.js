
import { getSocketSession } from './mesh-handshake.js';
import { sealMeshLine } from './mesh-session-crypto.js';

const queues = new WeakMap();

export function sendOnSocketQueued(socket, payload) {
  if (!socket || socket.destroyed) {
    return Promise.reject(new Error('Socket not available'));
  }
  let q = queues.get(socket);
  if (!q) {
    q = { tail: Promise.resolve() };
    queues.set(socket, q);
  }
  const session = getSocketSession(socket);
  const body = JSON.stringify(payload);
  const line =
    session?.cipher &&
    payload?.type !== 'mesh-handshake' &&
    payload?.type !== 'mesh-handshake-ack' &&
    payload?.type !== 'ping' &&
    payload?.type !== 'pong'
      ? `${sealMeshLine(session.cipher, body)}\n`
      : `${body}\n`;
  const job = q.tail.then(
    () =>
      new Promise((resolve, reject) => {
        socket.write(line, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  );
  q.tail = job.catch(() => {});
  return job;
}
