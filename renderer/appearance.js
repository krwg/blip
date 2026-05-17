/**
 * Theme + animated background — driven by html[data-theme] and html[data-animated-bg].
 * Persisted via main process saveConfig: themeId, animatedBgId.
 */

import { t } from './i18n.js';

export const THEME_GROUPS = {
  light: [
    'light-paper',
    'light-fog',
    'light-sand',
    'light-glacier',
    'light-meadow',
    'light-circuit',
    'light-rose',
  ],
  dark: [
    'dark-signal',
    'dark-void',
    'dark-violet',
    'dark-forest',
    'dark-ember',
    'dark-midnight',
    'dark-cyan',
    'dark-crimson',
  ],
};

/** No grid / checker / mesh tile patterns — thematic animated art. */
export const ANIMATED_BACKGROUNDS = [
  'none',
  'waves',
  'aurora',
  'nebula',
  'drift',
  'pulse',
  'tide',
  'rain',
  'beacon',
  'hyperwave',
  'plasma',
  'vortex',
  'synth',
  'cosmos',
  'skyline',
  'bloom',
  'horizon',
  'ember',
  'rift',
  'depths',
  'signal',
];

/** Migrate removed mesh-style backgrounds to art equivalents. */
const LEGACY_BG_MAP = {
  grid: 'skyline',
  circuit: 'signal',
  static: 'ember',
  glitch: 'rift',
  pixelstorm: 'skyline',
  shards: 'depths',
  scanlines: 'horizon',
};

const DEFAULT_THEME = 'dark-signal';
const DEFAULT_BG = 'none';

export function normalizeThemeId(id) {
  const all = [...THEME_GROUPS.light, ...THEME_GROUPS.dark];
  return all.includes(id) ? id : DEFAULT_THEME;
}

export function normalizeBgId(id) {
  const mapped = LEGACY_BG_MAP[id] || id;
  return ANIMATED_BACKGROUNDS.includes(mapped) ? mapped : DEFAULT_BG;
}

export const THEME_META = THEME_GROUPS.light
  .concat(THEME_GROUPS.dark)
  .map((id) => ({ id }));

export const BG_META = ANIMATED_BACKGROUNDS.map((id) => ({ id }));

export function labelTheme(id) {
  const key = `appearance.theme.${id}`;
  const label = t(key);
  return label === key ? id : label;
}

export function labelBg(id) {
  const key = `appearance.bg.${id}`;
  const label = t(key);
  return label === key ? id : label;
}

export function applyAppearance(config) {
  const html = document.documentElement;
  const theme = normalizeThemeId(config?.themeId);
  const bg = normalizeBgId(config?.animatedBgId);
  html.dataset.theme = theme;
  html.dataset.animatedBg = bg;
  delete html.dataset.callWindow;
  html.dataset.reactiveBg =
    config?.reactiveBackground === true && bg !== 'none' ? '1' : '0';
  syncReducedMotion(config);
}

/** Call window: theme colors only — no animated wallpaper over video. */
export function applyCallWindowAppearance(config) {
  const html = document.documentElement;
  html.dataset.theme = normalizeThemeId(config?.themeId);
  html.dataset.animatedBg = 'none';
  html.dataset.callWindow = '1';
  html.dataset.reactiveBg = '0';
  syncReducedMotion(config);
}

export function syncReducedMotion(config) {
  const html = document.documentElement;
  const reduce =
    config?.reduceMotion === true ||
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  html.dataset.reducedMotion = reduce ? '1' : '0';
}

export function listenReducedMotion(cb, getConfig) {
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (!mq) return () => {};
  const fn = () => {
    syncReducedMotion(getConfig?.());
    cb?.();
  };
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}
