import { t } from '../i18n.js';
import {
  buildPanelTitleRow,
  createPixelToggle,
  createPixelHintIcon,
  wrapInSettingsListPanel,
} from '../settings-ui.js';
import { showAppToast } from '../toasts.js';

/**
 * @param {{
 *   getState: () => { config: object },
 *   saveConfig: (patch: object) => Promise<object>,
 * }} deps
 */
export function buildSettingsShortcutsPanel({ getState, saveConfig }) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--shortcuts';
  frag.appendChild(buildPanelTitleRow('settings.section_shortcuts'));

  function addShortcutBlock(scopeKey, rows) {
    const sub = document.createElement('p');
    sub.className = 'settings-shortcuts-sub';
    sub.dataset.i18n = scopeKey;
    sub.textContent = t(scopeKey);
    frag.appendChild(sub);

    const list = document.createElement('dl');
    list.className = 'settings-shortcuts-list';
    for (const [key, keys] of rows) {
      const dt = document.createElement('dt');
      dt.dataset.i18n = key;
      dt.textContent = t(key);
      const dd = document.createElement('dd');
      dd.textContent = keys;
      list.appendChild(dt);
      list.appendChild(dd);
    }
    frag.appendChild(wrapInSettingsListPanel(list, 'settings-shortcuts-panel'));
  }

  addShortcutBlock('settings.shortcuts_main_scope', [
    ['settings.shortcuts_nav_dial', 'Alt+1'],
    ['settings.shortcuts_nav_peers', 'Alt+2'],
    ['settings.shortcuts_nav_chat', 'Alt+3'],
    ['settings.shortcuts_nav_settings', 'Alt+4'],
    ['settings.shortcuts_open_settings', 'Ctrl+,'],
    ['settings.shortcuts_chat_search', 'Ctrl+F'],
  ]);

  addShortcutBlock('settings.shortcuts_call_scope', [
    ['settings.shortcuts_mute', 'M'],
    ['settings.shortcuts_deafen', 'D'],
    ['settings.shortcuts_share', 'S'],
    ['settings.shortcuts_fullscreen', 'F'],
    ['settings.shortcuts_accept', 'Enter'],
    ['settings.shortcuts_end', 'Esc'],
  ]);

  addShortcutBlock('settings.shortcuts_global_scope', [
    ['settings.shortcuts_nav_dial', 'Alt+1'],
    ['settings.shortcuts_nav_peers', 'Alt+2'],
    ['settings.shortcuts_nav_chat', 'Alt+3'],
    ['settings.shortcuts_nav_settings', 'Alt+4'],
    ['settings.shortcuts_open_settings', 'Ctrl+,'],
    ['settings.shortcuts_toggle_dnd', 'Ctrl+Shift+D'],
    ['settings.shortcuts_hangup_global', 'Ctrl+Shift+End'],
    [
      'settings.shortcuts_overlay',
      process.platform === 'darwin' ? 'Control+Shift+O' : 'Shift+Alt+O',
    ],
  ]);

  const globalRow = document.createElement('div');
  globalRow.className = 'settings-toggle-with-hint';
  const globalToggle = createPixelToggle({
    checked: state.config.globalShortcutsEnabled !== false,
    labelKey: 'settings.shortcuts_global_enable',
    onChange: async (checked) => {
      state.config = await saveConfig({ globalShortcutsEnabled: checked });
      showAppToast({
        title: checked
          ? t('settings.shortcuts_global_on')
          : t('settings.shortcuts_global_off'),
        durationMs: 3200,
      });
    },
  });
  globalRow.appendChild(globalToggle.el);
  globalRow.appendChild(createPixelHintIcon('settings.shortcuts_global_hint'));
  frag.appendChild(globalRow);

  return frag;
}
