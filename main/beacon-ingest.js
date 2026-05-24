import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat, open, readFile } from 'fs/promises';
import { basename, extname } from 'path';
import { getSeedDir, writeSeedMeta } from './beacon-store.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

function chunkFilePath(seedDir, chunkIndex) {
  return join(seedDir, `chunk-${String(chunkIndex).padStart(5, '0')}`);
}

async function writeRawChunk(seedId, chunkIndex, buf) {
  const dir = getSeedDir(seedId);
  await mkdir(dir, { recursive: true });
  await writeFile(chunkFilePath(dir, chunkIndex), buf);
}

/**
 * Streaming SHA-256 (full hex).
 * @param {string} filePath
 * @param {number} chunkSize
 */
export function hashFilePath(filePath, chunkSize) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const rs = createReadStream(filePath, { highWaterMark: chunkSize });
    rs.on('data', (chunk) => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest('hex')));
    rs.on('error', reject);
  });
}

function guessMime(filename) {
  const ext = extname(filename || '').toLowerCase();
  const map = {
    '.zip': 'application/zip',
    '.7z': 'application/x-7z-compressed',
    '.rar': 'application/vnd.rar',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.exe': 'application/octet-stream',
    '.iso': 'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Ingest a file from disk into seed storage (no renderer File API).
 * @param {string} filePath
 * @param {{ chunkSize?: number, maxBytes?: number, onProgress?: (p: { phase: string, percent?: number }) => void }} [opts]
 */
export async function ingestPublishFromPath(filePath, opts = {}) {
  const chunkSize = opts.chunkSize || 1048576;
  const onProgress = opts.onProgress;

  let st;
  try {
    st = await stat(filePath);
  } catch {
    throw new Error('not_found');
  }
  if (!st.isFile()) throw new Error('not_file');
  if (st.size <= 0) throw new Error('empty');
  if (opts.maxBytes && st.size > opts.maxBytes) throw new Error('too_large');

  onProgress?.({ phase: 'hashing', percent: 2 });
  const fullHash = await hashFilePath(filePath, chunkSize);
  const seedId = fullHash.slice(0, 16);

  const filename = basename(filePath);
  const totalChunks = Math.ceil(st.size / chunkSize);
  const meta = {
    seedId,
    filename,
    size: st.size,
    chunkSize,
    totalChunks,
    mime: guessMime(filename),
    publishedAt: Date.now(),
  };

  onProgress?.({ phase: 'publishing', percent: 8 });

  const fh = await open(filePath, 'r');
  try {
    for (let i = 0; i < totalChunks; i++) {
      const offset = i * chunkSize;
      const len = Math.min(chunkSize, st.size - offset);
      const buf = Buffer.allocUnsafe(len);
      const { bytesRead } = await fh.read(buf, 0, len, offset);
      if (bytesRead <= 0) throw new Error('read');
      await writeRawChunk(seedId, i, buf.subarray(0, bytesRead));
      const pct = Math.round(8 + ((i + 1) / totalChunks) * 82);
      onProgress?.({ phase: 'publishing', percent: pct });
    }
  } finally {
    await fh.close();
  }

  await writeSeedMeta(seedId, meta);
  onProgress?.({ phase: 'ready', percent: 100 });
  return meta;
}

/** Small image preview (optional). */
export async function tryReadImagePreviewB64(filePath, maxBytes = 8 * 1024 * 1024) {
  const ext = extname(filePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return null;
  try {
    const st = await stat(filePath);
    if (st.size > maxBytes) return null;
    const buf = await readFile(filePath);
    return buf.toString('base64');
  } catch {
    return null;
  }
}
