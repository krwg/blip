import { desktopCapturer } from 'electron';
import { BlipErrorCode, createBlipError } from '../shared/blip-errors.js';

let pendingDisplaySourceId = null;

export function setPendingDisplaySource(sourceId) {
  pendingDisplaySourceId = sourceId || null;
}

export function takePendingDisplaySource() {
  const id = pendingDisplaySourceId;
  pendingDisplaySourceId = null;
  return id;
}

async function fetchAllCaptureSources(thumbnailSize) {
  const byId = new Map();
  const opts = { thumbnailSize, fetchWindowIcons: true };
  for (const types of [
    ['screen', 'window'],
    ['window'],
    ['screen'],
  ]) {
    try {
      const batch = await desktopCapturer.getSources({ ...opts, types });
      for (const s of batch) {
        if (s?.id && !byId.has(s.id)) byId.set(s.id, s);
      }
    } catch {
      /* try next query shape */
    }
  }
  return [...byId.values()];
}

export async function listDisplaySources() {
  let sources;
  try {
    sources = await fetchAllCaptureSources({ width: 320, height: 180 });
  } catch (err) {
    throw createBlipError(BlipErrorCode.CAPTURE_LIST_SOURCES_FAILED, err?.message || '', err);
  }
  const mapped = sources
    .filter((s) => s?.id)
    .map((s, idx) => ({
      id: s.id,
      name: String(s.name || '').trim() || (s.id.startsWith('screen:') ? `Screen ${idx + 1}` : `Window ${idx + 1}`),
      thumbnail: s.thumbnail?.isEmpty?.() ? '' : s.thumbnail.toDataURL(),
      displayType: s.id.startsWith('screen:') ? 'screen' : 'window',
    }));
  if (!mapped.length) {
    throw createBlipError(BlipErrorCode.CAPTURE_PICKER_EMPTY);
  }
  return mapped;
}

export async function resolveDisplaySourceForCallback() {
  const pendingId = takePendingDisplaySource();
  let sources;
  try {
    sources = await fetchAllCaptureSources({ width: 1920, height: 1080 });
  } catch (err) {
    throw createBlipError(BlipErrorCode.CAPTURE_LIST_SOURCES_FAILED, err?.message || '', err);
  }
  if (pendingId) {
    const pick = sources.find((s) => s.id === pendingId);
    if (pick) return pick;
    throw createBlipError(BlipErrorCode.CAPTURE_SOURCE_NOT_FOUND, pendingId);
  }
  return sources.find((s) => s.id.startsWith('screen:')) ?? sources[0] ?? null;
}
