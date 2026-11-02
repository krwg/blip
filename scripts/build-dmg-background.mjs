import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
mkdirSync(buildDir, { recursive: true });

function dmgSvg(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0c"/>
      <stop offset="55%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="${Math.round(w * 0.044)}" y="${Math.round(h * 0.063)}" width="${Math.round(w * 0.911)}" height="${Math.round(h * 0.874)}" fill="none" stroke="#94a3b8" stroke-opacity="0.28" stroke-width="2"/>
  <text x="${w / 2}" y="${Math.round(h * 0.126)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="${Math.round(w * 0.026)}" fill="#cbd5e1" letter-spacing="4">BLIP</text>
  <text x="${w / 2}" y="${Math.round(h * 0.19)}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="${Math.round(w * 0.017)}" fill="#64748b" letter-spacing="2">DRAG TO APPLICATIONS</text>
  <circle cx="${Math.round(w * 0.263)}" cy="${Math.round(h * 0.526)}" r="${Math.round(w * 0.096)}" fill="none" stroke="#94a3b8" stroke-opacity="0.2" stroke-width="1"/>
  <circle cx="${Math.round(w * 0.726)}" cy="${Math.round(h * 0.526)}" r="${Math.round(w * 0.096)}" fill="none" stroke="#94a3b8" stroke-opacity="0.2" stroke-width="1"/>
  <path d="M${Math.round(w * 0.37)} ${Math.round(h * 0.526)} H${Math.round(w * 0.619)}" stroke="#94a3b8" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="6 6"/>
</svg>`;
}

const out1x = join(buildDir, 'dmg-background.png');
const out2x = join(buildDir, 'dmg-background@2x.png');
await sharp(Buffer.from(dmgSvg(540, 380))).png().toFile(out1x);
await sharp(Buffer.from(dmgSvg(1080, 760))).png().toFile(out2x);
// electron-builder DMG cleanup also looks at project-root copies.
await sharp(Buffer.from(dmgSvg(540, 380))).png().toFile(join(root, 'dmg-background.png'));
await sharp(Buffer.from(dmgSvg(1080, 760))).png().toFile(join(root, 'dmg-background@2x.png'));
writeFileSync(join(buildDir, '.gitkeep'), '');
console.log('[build-dmg-background]', out1x);
console.log('[build-dmg-background]', out2x);
