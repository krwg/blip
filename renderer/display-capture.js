import { getScreenCaptureMandatory } from './call-media.js';
import { BlipErrorCode, createBlipError } from '../shared/blip-errors.js';

export async function captureDisplayStream(sourceId, config, { withAudio = false } = {}) {
  if (!sourceId || typeof sourceId !== 'string') {
    throw createBlipError(BlipErrorCode.CAPTURE_NO_SOURCE);
  }

  const chromeMediaSource = sourceId.startsWith('window:') ? 'window' : 'desktop';
  const size = getScreenCaptureMandatory(config);
  const videoMandatory = {
    chromeMediaSource,
    chromeMediaSourceId: sourceId,
    ...size,
  };
  const audioConstraint = withAudio
    ? {
        mandatory: {
          chromeMediaSource,
          chromeMediaSourceId: sourceId,
        },
      }
    : false;

  try {
    if (window.blip?.prepareDisplayCapture) {
      await window.blip.prepareDisplayCapture(sourceId);
    }
    return await navigator.mediaDevices.getUserMedia({
      audio: audioConstraint,
      video: { mandatory: videoMandatory },
    });
  } catch (err) {
    if (err?.name === 'NotAllowedError' || /permission/i.test(String(err?.message || ''))) {
      throw createBlipError(BlipErrorCode.CAPTURE_PERMISSION_DENIED, err?.message || '', err);
    }
    console.warn('[BLIP] desktop getUserMedia capture failed:', err?.message || err);
    throw createBlipError(BlipErrorCode.CAPTURE_GETUSERMEDIA_FAILED, err?.message || '', err);
  }
}
