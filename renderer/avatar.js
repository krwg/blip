const SEED_KEY = 'blip_avatar_seed_v1';

const SHADES = ['#004d3d', '#008f72', '#00ffc8'];

function hashBlipId(blipId) {
  let h = blipId * 2654435761;
  return ((h >>> 0) % 65536) / 65536;
}

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function getAvatarSeed(blipId) {
  try {
    const raw = localStorage.getItem(SEED_KEY);
    if (!raw) return blipId;
    const o = JSON.parse(raw);
    const n = Number(o?.[String(blipId)]);
    return Number.isFinite(n) ? n : blipId;
  } catch {
    return blipId;
  }
}

export function setAvatarSeed(blipId, seed) {
  try {
    const raw = localStorage.getItem(SEED_KEY);
    const o = raw ? JSON.parse(raw) : {};
    o[String(blipId)] = seed;
    localStorage.setItem(SEED_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

/** New random 8×8 generated avatar for this BLIP ID. */
export function regenerateAvatar(blipId) {
  const seed = Math.floor(Math.random() * 2147483646) + 1;
  setAvatarSeed(blipId, seed);
}

export function generateAvatarData(blipId) {
  const seed = getAvatarSeed(blipId);
  const rand = seededRandom(Math.floor(hashBlipId(seed) * 1e9) + Number(seed));
  const pixels = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const filled = rand() > 0.35;
      const shade = SHADES[Math.floor(rand() * SHADES.length)];
      pixels[y * 8 + x] = filled ? shade : 'transparent';
      pixels[y * 8 + (7 - x)] = filled ? shade : 'transparent';
    }
  }
  return pixels;
}

export function drawAvatar(canvas, blipId, scale = 4) {
  const pixels = generateAvatarData(blipId);
  const size = 8 * scale;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 64; i++) {
    const color = pixels[i];
    if (color === 'transparent') continue;
    const x = (i % 8) * scale;
    const y = Math.floor(i / 8) * scale;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, scale, scale);
  }
}

/**
 * @param {number} blipId
 * @param {number} [scale]
 * @param {{ selfBlipId?: number | null }} [_opts] — reserved for API compatibility
 */
export function createAvatarElement(blipId, scale = 4, _opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'avatar-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'avatar-canvas';
  drawAvatar(canvas, blipId, scale);
  wrap.appendChild(canvas);
  return wrap;
}
