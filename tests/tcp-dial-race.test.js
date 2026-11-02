import { describe, expect, it, vi, afterEach } from 'vitest';
import net from 'net';

vi.mock('../main/tcp-write-queue.js', () => ({
  sendOnSocketQueued: vi.fn(),
}));

describe('connectToFirstReachable', () => {
  /** @type {import('net').Server[]} */
  const servers = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (s) =>
          new Promise((resolve) => {
            try {
              s.close(() => resolve());
            } catch {
              resolve();
            }
          })
      )
    );
  });

  it('connects to the first reachable IP among candidates', async () => {
    const { connectToFirstReachable } = await import('../main/tcp-client.js');
    const server = net.createServer((sock) => sock.end());
    servers.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const { socket, ip } = await connectToFirstReachable(
      ['127.0.0.1', '127.0.0.1'],
      42,
      port,
      { timeoutMs: 1500 }
    );
    expect(ip).toBe('127.0.0.1');
    expect(socket.destroyed).toBe(false);
    socket.destroy();
  });

  it('rejects when no candidate answers', async () => {
    const { connectToFirstReachable } = await import('../main/tcp-client.js');
    await expect(
      connectToFirstReachable(['127.0.0.1'], 7, 1, { timeoutMs: 400 })
    ).rejects.toBeTruthy();
  });
});
