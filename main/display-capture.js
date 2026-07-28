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

async function fetchAllCaptureSources(thumbnailSize, { fetchWindowIcons = true } = {}) {
  const byId = new Map();
  const opts = { thumbnailSize, fetchWindowIcons };
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

function mapCaptureSource(s, idx) {
  return {
    id: s.id,
    name:
      String(s.name || '').trim() ||
      (s.id.startsWith('screen:') ? `Screen ${idx + 1}` : `Window ${idx + 1}`),
    thumbnail: s.thumbnail?.isEmpty?.() ? '' : s.thumbnail?.toDataURL?.() || '',
    displayType: s.id.startsWith('screen:') ? 'screen' : 'window',
  };
}

export async function listDisplaySources() {
  let sources;
  try {
    // Windows drops many windows when thumbnails are requested — enumerate with 0×0 first.
    sources = await fetchAllCaptureSources({ width: 0, height: 0 }, { fetchWindowIcons: false });
    if (sources.length < 2) {
      const withThumbs = await fetchAllCaptureSources({ width: 160, height: 90 });
      const byId = new Map(sources.map((s) => [s.id, s]));
      for (const s of withThumbs) {
        if (s?.id && !byId.has(s.id)) byId.set(s.id, s);
      }
      sources = [...byId.values()];
    } else {
      // Best-effort thumbnails without losing the complete id list.
      try {
        const thumbs = await fetchAllCaptureSources({ width: 160, height: 90 });
        const thumbById = new Map(thumbs.map((s) => [s.id, s]));
        sources = sources.map((s) => {
          const t = thumbById.get(s.id);
          return t && !t.thumbnail?.isEmpty?.() ? t : s;
        });
      } catch {
        /* keep 0×0 list */
      }
    }
  } catch (err) {
    throw createBlipError(BlipErrorCode.CAPTURE_LIST_SOURCES_FAILED, err?.message || '', err);
  }
  const mapped = sources.filter((s) => s?.id).map((s, idx) => mapCaptureSource(s, idx));
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
