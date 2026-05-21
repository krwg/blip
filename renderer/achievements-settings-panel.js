import { t } from './i18n.js';
import { buildPanelTitleRow, buildSettingsFieldWithHint } from './settings-ui.js';
import { renderAchievementsGrid } from './achievements.js';
import { clearAllAchievementUnlocks } from './achievements-store.js';
import { showAppToast } from './toasts.js';

/**
 * @param {object} state
 * @param {object} api
 */
export function buildSettingsAchievementsPanel(state, api) {
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--achievements';

  frag.appendChild(buildPanelTitleRow('settings.section_achievements', 'achievements.hint'));

  const enabledWrap = document.createElement('label');
  enabledWrap.className = 'settings-toggle-row';
  const enabledInput = document.createElement('input');
  enabledInput.type = 'checkbox';
  enabledInput.checked = !!state.config.achievementsEnabled;
  const enabledLabel = document.createElement('span');
  enabledLabel.dataset.i18n = 'achievements.enabled';
  enabledLabel.textContent = t('achievements.enabled');
  enabledWrap.appendChild(enabledInput);
  enabledWrap.appendChild(enabledLabel);
  frag.appendChild(
    buildSettingsFieldWithHint('achievements.enabled_label', 'achievements.enabled_hint', enabledWrap)
  );

  const notifyWrap = document.createElement('label');
  notifyWrap.className = 'settings-toggle-row';
  const notifyInput = document.createElement('input');
  notifyInput.type = 'checkbox';
  notifyInput.checked = state.config.achievementsNotify !== false;
  const notifyLabel = document.createElement('span');
  notifyLabel.dataset.i18n = 'achievements.notify';
  notifyLabel.textContent = t('achievements.notify');
  notifyWrap.appendChild(notifyInput);
  notifyWrap.appendChild(notifyLabel);
  frag.appendChild(
    buildSettingsFieldWithHint('achievements.notify_label', 'achievements.notify_hint', notifyWrap)
  );

  const gridHost = document.createElement('div');
  gridHost.className = 'ach-grid settings-list-panel';

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn btn-lang';
  resetBtn.dataset.i18n = 'achievements.reset';
  resetBtn.textContent = t('achievements.reset');

  function refreshGrid() {
    const on = !!state.config.achievementsEnabled;
    gridHost.classList.toggle('ach-grid--disabled', !on);
    notifyWrap.classList.toggle('hidden', !on);
    renderAchievementsGrid(gridHost);
  }

  enabledInput.addEventListener('change', async () => {
    state.config = await api.saveConfig({ achievementsEnabled: enabledInput.checked });
    refreshGrid();
  });

  notifyInput.addEventListener('change', async () => {
    state.config = await api.saveConfig({ achievementsNotify: notifyInput.checked });
  });

  resetBtn.addEventListener('click', () => {
    if (!confirm(t('achievements.reset_confirm'))) return;
    clearAllAchievementUnlocks();
    refreshGrid();
    showAppToast({ title: t('achievements.reset_ok'), durationMs: 3000 });
  });

  frag.appendChild(gridHost);
  frag.appendChild(resetBtn);
  refreshGrid();

  return frag;
}
