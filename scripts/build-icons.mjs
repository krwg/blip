import sharp from 'sharp';
import toIco from 'to-ico';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
const iconsDir = join(buildDir, 'icons');
const svgPath = join(root, 'icon-main.svg');
const kernel = sharp.kernel.lanczos3;

if (!existsSync(svgPath)) {
  console.error('[build-icons] icon-main.svg not found at project root');
  process.exit(1);
}

mkdirSync(buildDir, { recursive: true });
if (existsSync(iconsDir)) {
  rmSync(iconsDir, { recursive: true, force: true });
}
mkdirSync(iconsDir, { recursive: true });

const svg = readFileSync(svgPath);
console.log('[build-icons] Rasterizing Apple-style signal icon…');

const png256 = join(iconsDir, 'main.png');
const tray16 = join(iconsDir, 'main-tray.png');
await sharp(svg, { density: 384 })
  .resize(256, 256, { kernel, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(png256);
await sharp(svg, { density: 384 })
  .resize(16, 16, { kernel, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(tray16);

copyFileSync(svgPath, join(buildDir, 'icon.svg'));
copyFileSync(svgPath, join(root, 'icon.svg'));

const sizes = [256, 128, 64, 48, 32, 16];
const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(svg, { density: 384 })
      .resize(size, size, { kernel })
      .png()
      .toBuffer()
  )
);

const icoPath = join(buildDir, 'icon.ico');
writeFileSync(icoPath, await toIco(pngBuffers));
console.log('[build-icons] Wrote', icoPath);

const iconPngPath = join(buildDir, 'icon.png');
await sharp(svg, { density: 576 }).resize(1024, 1024, { kernel }).png().toFile(iconPngPath);
console.log('[build-icons] Wrote', iconPngPath);

// Marketing / README master
await sharp(svg, { density: 576 })
  .resize(1024, 1024, { kernel })
  .png()
  .toFile(join(root, 'icon.png'));

const png2icons = (await import('png2icons')).default;
const icnsBuf = png2icons.createICNS(readFileSync(iconPngPath), png2icons.BILINEAR, 0);
if (!icnsBuf) {
  console.error('[build-icons] png2icons failed to create ICNS');
  process.exit(1);
}
const icnsPath = join(buildDir, 'icon.icns');
writeFileSync(icnsPath, icnsBuf);
console.log('[build-icons] Wrote', icnsPath);

for (const size of [512, 256, 128, 64, 48, 32, 16]) {
  await sharp(svg, { density: 576 })
    .resize(size, size, { kernel })
    .png()
    .toFile(join(iconsDir, `${size}x${size}.png`));
}

copyFileSync(tray16, join(buildDir, 'tray-16.png'));
console.log('[build-icons] Wrote', join(buildDir, 'tray-16.png'));
console.log('[build-icons] Done (main only)');
