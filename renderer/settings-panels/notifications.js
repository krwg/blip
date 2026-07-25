import { t } from '../i18n.js';
import {
  createPixelToggle,
  createPixelHintIcon,
  buildPanelTitleRow,
} from '../settings-ui.js';
import { setDefaultToastDurationMs } from '../toast-config.js';

export function buildSettingsNotificationsPanel({ getState, saveConfig, applySoundPrefs }) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel';
  frag.appendChild(buildPanelTitleRow('settings.section_notifications'));

  frag.appendChild(
    createPixelToggle({
      checked: state.config.desktopNotifications !== false,
      labelKey: 'settings.notifications_enable',
      onChange: async (checked) => {
        state.config = await saveConfig({ desktopNotifications: checked });
      },
    }).el
  );

  frag.appendChild(
    createPixelToggle({
      checked: state.config.desktopCallNotifications !== false,
      labelKey: 'settings.notifications_calls',
      onChange: async (checked) => {
        state.config = await saveConfig({ desktopCallNotifications: checked });
      },
    }).el
  );

  const dndRow = document.createElement('div');
  dndRow.className = 'settings-toggle-with-hint';
  const dndToggle = createPixelToggle({
    checked: state.config.doNotDisturb === true,
    labelKey: 'settings.notifications_dnd',
    onChange: async (checked) => {
      state.config = await saveConfig({ doNotDisturb: checked });
      applySoundPrefs?.(state.config);
    },
  });
  dndRow.appendChild(dndToggle.el);
  dndRow.appendChild(createPixelHintIcon('settings.notifications_dnd_hint'));
  frag.appendChild(dndRow);

  const toastSec = Math.max(2, Math.min(60, Number(state.config.toastDurationSec) || 9));
  const toastRow = document.createElement('label');
  toastRow.className = 'settings-range-row';
  const toastLab = document.createElement('span');
  toastLab.dataset.i18n = 'settings.toast_duration';
  toastLab.textContent = t('settings.toast_duration');
  const toastRange = document.createElement('input');
  toastRange.type = 'range';
  toastRange.min = '2';
  toastRange.max = '60';
  toastRange.step = '1';
  toastRange.value = String(toastSec);
  toastRange.className = 'settings-range';
  const toastVal = document.createElement('span');
  toastVal.className = 'settings-range-val';
  toastVal.textContent = `${toastSec}s`;
  toastRange.addEventListener('input', () => {
    toastVal.textContent = `${toastRange.value}s`;
  });
  toastRange.addEventListener('change', async () => {
    const sec = Number(toastRange.value) || 9;
    state.config = await saveConfig({ toastDurationSec: sec });
    setDefaultToastDurationMs(sec * 1000);
  });
  toastRow.appendChild(toastLab);
  toastRow.appendChild(toastRange);
  toastRow.appendChild(toastVal);
  frag.appendChild(toastRow);

  return frag;
}
