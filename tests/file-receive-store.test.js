import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { createFileReceiveStore, FILE_RECEIVE_CHUNK_BYTES } from '../main/file-receive-store.js';

describe('createFileReceiveStore', () => {
  let dir;
  /** @type {ReturnType<typeof createFileReceiveStore>} */
  let store;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'blip-recv-'));
    store = createFileReceiveStore({ getIncomingDir: () => dir });
  });

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('assembles out-of-order base64 chunks on disk', async () => {
    const a = Buffer.from('AAAA');
    const b = Buffer.from('BBBB');
    const begin = await store.beginFileReceive({
      transferId: 't1',
      name: 'demo.bin',
      mime: 'application/octet-stream',
      size: a.length + b.length,
      chunkCount: 2,
      chunkBytes: a.length,
    });
    expect(begin.ok).toBe(true);

    await store.writeFileReceiveChunk({
      transferId: 't1',
      index: 1,
      data: b.toString('base64'),
    });
    await store.writeFileReceiveChunk({
      transferId: 't1',
      index: 0,
      data: a.toString('base64'),
    });

    const done = await store.finishFileReceive({ transferId: 't1' });
    expect(done.ok).toBe(true);
    expect(done.filePath).toBeTruthy();
    const body = await readFile(done.filePath);
    expect(body.equals(Buffer.concat([a, b]))).toBe(true);
  });

  it('rejects finish when chunks are missing', async () => {
    await store.beginFileReceive({
      transferId: 't2',
      name: 'x.bin',
      size: FILE_RECEIVE_CHUNK_BYTES,
      chunkCount: 2,
      chunkBytes: FILE_RECEIVE_CHUNK_BYTES,
    });
    await store.writeFileReceiveChunk({
      transferId: 't2',
      index: 0,
      data: Buffer.alloc(8).toString('base64'),
    });
    const done = await store.finishFileReceive({ transferId: 't2' });
    expect(done.ok).toBe(false);
    expect(done.error).toBe('incomplete');
  });
});
