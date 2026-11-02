import { describe, expect, it } from 'vitest';
import {
  handleFileTransferTcp,
  isAcceptableIncomingFileOffer,
} from '../renderer/file-transfer.js';

const config = { blipId: 1, maxFileTransferGb: 1 };

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

describe('isAcceptableIncomingFileOffer', () => {
  it('rejects missing transferId / zero size', () => {
    expect(isAcceptableIncomingFileOffer({ size: 10, chunkCount: 1 }, config)).toBe(false);
    expect(
      isAcceptableIncomingFileOffer({ transferId: 't1', size: 0, chunkCount: 1 }, config)
    ).toBe(false);
  });

  it('rejects over configured maxFileTransferGb', () => {
    const twoGb = 2 * 1024 * 1024 * 1024;
    expect(
      isAcceptableIncomingFileOffer(
        { transferId: 't1', size: twoGb, chunkCount: Math.ceil(twoGb / (1024 * 1024)) },
        config
      )
    ).toBe(false);
  });

  it('accepts a 1 MiB offer under the 1 GB limit', () => {
    expect(
      isAcceptableIncomingFileOffer(
        { transferId: 't1', size: 1024 * 1024, chunkCount: 1 },
        config
      )
    ).toBe(true);
  });
});

describe('handleFileTransferTcp inbound hardening', () => {
  it('aborts oversized file-offer without keeping state', () => {
    const aborted = [];
    const ok = handleFileTransferTcp(
      {
        type: 'file-offer',
        from: 2,
        to: 1,
        transferId: 'big',
        name: 'huge.bin',
        size: 50 * 1024 * 1024 * 1024,
        chunkCount: 50000,
      },
      {
        config,
        onAbort: (peerId, transferId) => aborted.push([peerId, transferId]),
      }
    );
    expect(ok).toBe(true);
    expect(aborted).toEqual([[2, 'big']]);
  });

  it('does not double-count rewritten chunk indexes', () => {
    const progress = [];
    const completed = [];
    const hooks = {
      config,
      onProgress: (_peer, id, pct) => progress.push([id, pct]),
      onComplete: (_peer, payload) => completed.push(payload),
      onAbort: () => completed.push('abort'),
    };

    handleFileTransferTcp(
      {
        type: 'file-offer',
        from: 2,
        to: 1,
        transferId: 'dup',
        name: 'a.txt',
        mime: 'text/plain',
        size: 5,
        chunkCount: 2,
      },
      hooks
    );

    handleFileTransferTcp(
      {
        type: 'file-chunks-batch',
        from: 2,
        to: 1,
        transferId: 'dup',
        chunks: [
          { index: 0, data: b64('hello') },
          { index: 0, data: b64('HELLO') },
        ],
      },
      hooks
    );

    expect(progress.at(-1)?.[1]).toBe(50);

    handleFileTransferTcp(
      {
        type: 'file-chunk',
        from: 2,
        to: 1,
        transferId: 'dup',
        index: 1,
        data: b64('!'),
      },
      hooks
    );

    handleFileTransferTcp(
      { type: 'file-done', from: 2, to: 1, transferId: 'dup' },
      hooks
    );

    expect(completed).toHaveLength(1);
    expect(completed[0].attachment.blob).toBeInstanceOf(Blob);
    expect(completed[0].attachment.objectUrl).toMatch(/^blob:/);
    expect(completed[0].attachment.dataUrl).toBeUndefined();
  });

  it('aborts file-done when chunks are missing', () => {
    const aborted = [];
    const hooks = {
      config,
      onAbort: (_p, id) => aborted.push(id),
      onComplete: () => aborted.push('complete'),
    };

    handleFileTransferTcp(
      {
        type: 'file-offer',
        from: 2,
        to: 1,
        transferId: 'hole',
        name: 'a.bin',
        size: 3,
        chunkCount: 2,
      },
      hooks
    );
    handleFileTransferTcp(
      {
        type: 'file-chunk',
        from: 2,
        to: 1,
        transferId: 'hole',
        index: 0,
        data: b64('ab'),
      },
      hooks
    );
    handleFileTransferTcp(
      { type: 'file-done', from: 2, to: 1, transferId: 'hole' },
      hooks
    );

    expect(aborted).toEqual(['hole']);
  });
});
