import { app } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

export function resolveBuildAsset(filename) {
  const devPath = join(rootDir, 'build', filename);
  if (existsSync(devPath)) return devPath;
  if (app.isPackaged) {
    const prodPath = join(process.resourcesPath, 'icons', filename);
    if (existsSync(prodPath)) return prodPath;
  }
  return devPath;
}
