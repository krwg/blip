import sharp from 'sharp';
import toIco from 'to-ico';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'icon.svg');
const buildDir = join(root, 'build');

if (!existsSync(svgPath)) {
  console.error('[build-icons] icon.svg not found at project root');
  process.exit(1);
}

mkdirSync(buildDir, { recursive: true });
copyFileSync(svgPath, join(buildDir, 'icon.svg'));

const svg = readFileSync(svgPath);
const sizes = [256, 128, 64, 48, 32, 16];

console.log('[build-icons] Generating PNG sizes…');
const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(svg, { density: 288 })
      .resize(size, size, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer()
  )
);

const icoPath = join(buildDir, 'icon.ico');
writeFileSync(icoPath, await toIco(pngBuffers));
console.log('[build-icons] Wrote', icoPath);

const png256 = join(buildDir, 'icon.png');
await sharp(svg, { density: 288 })
  .resize(256, 256, { kernel: sharp.kernel.nearest })
  .png()
  .toFile(png256);
console.log('[build-icons] Wrote', png256);

const tray16 = join(buildDir, 'tray-16.png');
await sharp(svg, { density: 288 })
  .resize(16, 16, { kernel: sharp.kernel.nearest })
  .png()
  .toFile(tray16);
console.log('[build-icons] Wrote', tray16);
