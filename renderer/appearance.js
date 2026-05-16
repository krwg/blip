/**
 * Theme + animated background — driven by html[data-theme] and html[data-animated-bg].
 * Persisted via main process saveConfig: themeId, animatedBgId.
 */

export const THEME_GROUPS = {
  light: ['light-paper', 'light-fog', 'light-sand', 'light-glacier', 'light-meadow'],
  dark: ['dark-signal', 'dark-void', 'dark-violet', 'dark-forest', 'dark-ember'],
};

export const ANIMATED_BACKGROUNDS = [
  'none',
  'waves',
  'aurora',
  'grid',
  'scanlines',
  'nebula',
  'drift',
  'pulse',
  'circuit',
  'shards',
  'tide',
];

const DEFAULT_THEME = 'dark-signal';
const DEFAULT_BG = 'none';

export function normalizeThemeId(id) {
  const all = [...THEME_GROUPS.light, ...THEME_GROUPS.dark];
  return all.includes(id) ? id : DEFAULT_THEME;
}

export function normalizeBgId(id) {
  return ANIMATED_BACKGROUNDS.includes(id) ? id : DEFAULT_BG;
}

export const THEME_META = [
  { id: 'light-paper', en: 'Stack', ru: 'Стек' },
  { id: 'light-fog', en: 'Cloud', ru: 'Облако' },
  { id: 'light-sand', en: 'Legacy', ru: 'Легаси' },
  { id: 'light-glacier', en: 'Cryo', ru: 'Крио' },
  { id: 'light-meadow', en: 'IDE', ru: 'IDE' },
  { id: 'dark-signal', en: 'Signal', ru: 'Сигнал' },
  { id: 'dark-void', en: 'Null', ru: 'Null' },
  { id: 'dark-violet', en: 'Hex', ru: 'Hex' },
  { id: 'dark-forest', en: 'Terminal', ru: 'Терминал' },
  { id: 'dark-ember', en: 'Kernel', ru: 'Ядро' },
];

export const BG_META = [
  { id: 'none', en: 'Off', ru: 'Выкл' },
  { id: 'waves', en: 'Ping', ru: 'Ping' },
  { id: 'aurora', en: 'Compile', ru: 'Компилятор' },
  { id: 'grid', en: 'Matrix', ru: 'Матрица' },
  { id: 'scanlines', en: 'CRT', ru: 'CRT' },
  { id: 'nebula', en: 'VM', ru: 'VM' },
  { id: 'drift', en: 'Packet', ru: 'Пакет' },
  { id: 'pulse', en: 'Heartbeat', ru: 'Пульс' },
  { id: 'circuit', en: 'PCB', ru: 'PCB' },
  { id: 'shards', en: 'Fragment', ru: 'Фрагмент' },
  { id: 'tide', en: 'Sync', ru: 'Синх' },
];

export function labelTheme(id, lang) {
  const m = THEME_META.find((x) => x.id === id);
  if (!m) return id;
  return lang === 'ru' ? m.ru : m.en;
}

export function labelBg(id, lang) {
  const m = BG_META.find((x) => x.id === id);
  if (!m) return id;
  return lang === 'ru' ? m.ru : m.en;
}

export function applyAppearance(config) {
  const html = document.documentElement;
  const theme = normalizeThemeId(config?.themeId);
  const bg = normalizeBgId(config?.animatedBgId);
  html.dataset.theme = theme;
  html.dataset.animatedBg = bg;
  syncReducedMotion();
}

export function syncReducedMotion() {
  const html = document.documentElement;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  html.dataset.reducedMotion = reduce ? '1' : '0';
}

export function listenReducedMotion(cb) {
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (!mq) return () => {};
  const fn = () => {
    syncReducedMotion();
    cb?.();
  };
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}
