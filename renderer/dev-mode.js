/**
 * Developer section unlock — 7 taps on Settings → About version (Cultiva-style).
 */
import { t } from './i18n.js';
import { showAppToast } from './toasts.js';

export const DEVELOPER_UNLOCK_TAPS = 7;
export const DEVELOPER_UNLOCK_WINDOW_MS = 2500;

let tapCount = 0;
let tapTimer = null;

export function isDeveloperMode(config) {
  return config?.developerMode === true;
}

export async function enableDeveloperMode({ getConfig, saveConfig, onChange, toast = true } = {}) {
  const cfg = getConfig?.() || {};
  if (cfg.developerMode) {
    onChange?.(cfg);
    return cfg;
  }
  const next = await saveConfig({ developerMode: true });
  onChange?.(next);
  if (toast) {
    showAppToast({
      title: t('settings.dev_mode_unlocked'),
      durationMs: 4200,
    });
  }
  return next;
}

export async function hideDeveloperMode({ saveConfig, onChange } = {}) {
  const next = await saveConfig({ developerMode: false });
  onChange?.(next);
  showAppToast({
    title: t('settings.dev_mode_hidden'),
    durationMs: 3600,
  });
  return next;
}

/** Bind click-to-unlock on the About version line. Idempotent per element. */
export function bindAboutVersionUnlock(el, { getConfig, saveConfig, onUnlocked }) {
  if (!el || el.dataset.devUnlockBound === '1') return;
  el.dataset.devUnlockBound = '1';
  el.style.cursor = 'pointer';
  el.setAttribute('role', 'button');
  el.tabIndex = 0;

  const tryUnlock = async () => {
    if (isDeveloperMode(getConfig?.())) return;
    tapCount += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      tapCount = 0;
    }, DEVELOPER_UNLOCK_WINDOW_MS);
    if (tapCount < DEVELOPER_UNLOCK_TAPS) return;
    tapCount = 0;
    clearTimeout(tapTimer);
    const next = await enableDeveloperMode({ getConfig, saveConfig, toast: true });
    onUnlocked?.(next);
  };

  el.addEventListener('click', () => {
    void tryUnlock();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void tryUnlock();
    }
  });
}
