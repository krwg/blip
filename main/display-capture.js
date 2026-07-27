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

export async function listDisplaySources() {
  let sources;
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    });
  } catch (err) {
    throw createBlipError(BlipErrorCode.CAPTURE_LIST_SOURCES_FAILED, err?.message || '', err);
  }
  const mapped = sources
    .filter((s) => s?.id && String(s.name || '').trim())
    .map((s) => ({
      id: s.id,
      name: s.name,
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
    sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 1920, height: 1080 },
      fetchWindowIcons: true,
    });
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
