import { desktopCapturer } from 'electron';

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
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
  });
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail?.isEmpty?.() ? '' : s.thumbnail.toDataURL(),
    displayType: s.id.startsWith('screen:') ? 'screen' : 'window',
  }));
}

export async function resolveDisplaySourceForCallback() {
  const pendingId = takePendingDisplaySource();
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  if (pendingId) {
    const pick = sources.find((s) => s.id === pendingId);
    if (pick) return pick;
  }
  return sources.find((s) => s.id.startsWith('screen:')) ?? sources[0] ?? null;
}
