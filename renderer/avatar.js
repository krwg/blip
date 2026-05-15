const ACCENT = '#00ffc8';
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

export function generateAvatarData(blipId) {
  const rand = seededRandom(Math.floor(hashBlipId(blipId) * 1e9) + blipId);
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

export function createAvatarElement(blipId, scale = 4) {
  const wrap = document.createElement('div');
  wrap.className = 'avatar-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'avatar-canvas';
  drawAvatar(canvas, blipId, scale);
  wrap.appendChild(canvas);
  return wrap;
}
