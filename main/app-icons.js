import { existsSync } from 'fs';
import { join } from 'path';
import { resolveBuildAsset } from './paths.js';

/** Single Apple-style signal mark for app / tray / installers. */
export const APP_ICON_VARIANTS = [{ id: 'main', file: 'icon-main.svg', tier: 'free' }];

const FREE_IDS = new Set(['main']);

export function normalizeAppIconVariant(_id) {
  return 'main';
}

export function resolveAppIconVariant(_config) {
  return 'main';
}

export function canUseAppIconVariant(_config, variantId) {
  return FREE_IDS.has(normalizeAppIconVariant(variantId));
}

export function resolveVariantWindowIconPath(variantId) {
  const id = normalizeAppIconVariant(variantId);
  const named = resolveBuildAsset(join('icons', `${id}.png`));
  if (existsSync(named)) return named;
  return resolveBuildAsset('icon.png');
}

export function resolveVariantTrayIconPath(variantId) {
  const id = normalizeAppIconVariant(variantId);
  const named = resolveBuildAsset(join('icons', `${id}-tray.png`));
  if (existsSync(named)) return named;
  return resolveBuildAsset('tray-16.png');
}

export function listAppIconVariantIds() {
  return APP_ICON_VARIANTS.map((v) => v.id);
}
