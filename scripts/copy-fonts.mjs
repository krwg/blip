import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'node_modules/typeface-minecraft/files');
const destDir = join(root, 'renderer/assets/fonts');

const files = ['minecraft.woff2', 'minecraft.ttf'];

if (!existsSync(srcDir)) {
  console.warn('[copy-fonts] typeface-minecraft not installed — skip');
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
for (const file of files) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
console.log('[copy-fonts] Minecraft fonts copied to renderer/assets/fonts');
