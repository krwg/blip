import { t } from '../i18n.js';
import {
  buildPanelTitleRow,
  buildSectionSubtitleRow,
  createPixelToggle,
  createPixelHintIcon,
} from '../settings-ui.js';

function isDesktopTrayPlatform() {
  const p = typeof window !== 'undefined' ? window.blip?.platform : null;
  return p === 'win32' || p === 'darwin' || p === 'linux';
}

function platformHintKey(baseKey) {
  const p = typeof window !== 'undefined' ? window.blip?.platform : null;
  if (p === 'darwin') return `${baseKey}_mac`;
  if (p === 'linux') return `${baseKey}_linux`;
  return baseKey;
}

function buildLaunchAtLoginSection(getState, saveConfig) {
  if (!isDesktopTrayPlatform()) return null;
  const state = getState();
  const block = document.createElement('div');
  block.className = 'settings-tray-wrap settings-tray-wrap--flat';
  const row = document.createElement('div');
  row.className = 'settings-toggle-with-hint';
  const toggle = createPixelToggle({
    checked: !!state.config.launchAtLogin,
    labelKey: 'settings.launch_at_login',
    onChange: async (checked) => {
      state.config = await saveConfig({ launchAtLogin: checked });
    },
  });
  row.appendChild(toggle.el);
  row.appendChild(createPixelHintIcon(platformHintKey('settings.launch_at_login_hint')));
  block.appendChild(row);
  return block;
}

function buildCloseToTraySection(getState, saveConfig) {
  if (!isDesktopTrayPlatform()) return null;
  const state = getState();
  const block = document.createElement('div');
  block.className = 'settings-tray-wrap settings-tray-wrap--flat';
  const row = document.createElement('div');
  row.className = 'settings-toggle-with-hint';
  const toggle = createPixelToggle({
    checked: !!state.config.closeToTray,
    labelKey: 'settings.close_to_tray',
    onChange: async (checked) => {
      state.config = await saveConfig({ closeToTray: checked });
    },
  });
  row.appendChild(toggle.el);
  row.appendChild(createPixelHintIcon(platformHintKey('settings.close_to_tray_hint')));
  block.appendChild(row);
  return block;
}

/**
 * @param {{
 *   getState: () => { config: object },
 *   saveConfig: (patch: object) => Promise<object>,
 * }} deps
 */
export function buildSettingsSystemPanel({ getState, saveConfig }) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel';
  frag.appendChild(buildPanelTitleRow('settings.section_system'));

  const tray = buildCloseToTraySection(getState, saveConfig);
  if (tray) frag.appendChild(tray);
  const autostart = buildLaunchAtLoginSection(getState, saveConfig);
  if (autostart) frag.appendChild(autostart);
  if (!tray && !autostart) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.dataset.i18n = 'settings.system_na';
    p.textContent = t('settings.system_na');
    frag.appendChild(p);
  }

  frag.appendChild(buildSectionSubtitleRow('settings.overlay_section'));

  const overlayToggle = createPixelToggle({
    checked: !!state.config.overlayEnabled,
    labelKey: 'settings.overlay_enable',
    onChange: async (checked) => {
      state.config = await saveConfig({ overlayEnabled: checked });
    },
  });
  const overlayRow = document.createElement('div');
  overlayRow.className = 'settings-toggle-with-hint';
  overlayRow.appendChild(overlayToggle.el);
  overlayRow.appendChild(createPixelHintIcon('settings.overlay_enable_hint'));
  frag.appendChild(overlayRow);

  const hotkeyHint = document.createElement('p');
  hotkeyHint.className = 'hint';
  hotkeyHint.dataset.i18n = 'settings.overlay_hotkey_hint';
  hotkeyHint.textContent = t('settings.overlay_hotkey_hint');
  frag.appendChild(hotkeyHint);

  const clickThroughToggle = createPixelToggle({
    checked: state.config.overlayClickThrough !== false,
    labelKey: 'settings.overlay_click_through',
    onChange: async (checked) => {
      state.config = await saveConfig({ overlayClickThrough: checked });
    },
  });
  const clickRow = document.createElement('div');
  clickRow.className = 'settings-toggle-with-hint';
  clickRow.appendChild(clickThroughToggle.el);
  clickRow.appendChild(createPixelHintIcon('settings.overlay_click_through_hint'));
  frag.appendChild(clickRow);

  const detectToggle = createPixelToggle({
    checked: !!state.config.presenceDetectEnabled,
    labelKey: 'settings.presence_detect',
    onChange: async (checked) => {
      state.config = await saveConfig({ presenceDetectEnabled: checked });
    },
  });
  const detectRow = document.createElement('div');
  detectRow.className = 'settings-toggle-with-hint';
  detectRow.appendChild(detectToggle.el);
  detectRow.appendChild(createPixelHintIcon('settings.presence_detect_hint'));
  frag.appendChild(detectRow);

  const shareToggle = createPixelToggle({
    checked: !!state.config.presenceShareEnabled,
    labelKey: 'settings.presence_share',
    onChange: async (checked) => {
      state.config = await saveConfig({ presenceShareEnabled: checked });
    },
  });
  const shareRow = document.createElement('div');
  shareRow.className = 'settings-toggle-with-hint';
  shareRow.appendChild(shareToggle.el);
  shareRow.appendChild(createPixelHintIcon('settings.presence_share_hint'));
  frag.appendChild(shareRow);

  const gamesToggle = createPixelToggle({
    checked: state.config.presencePreferGames !== false,
    labelKey: 'settings.presence_prefer_games',
    onChange: async (checked) => {
      state.config = await saveConfig({ presencePreferGames: checked });
    },
  });
  const gamesRow = document.createElement('div');
  gamesRow.className = 'settings-toggle-with-hint';
  gamesRow.appendChild(gamesToggle.el);
  gamesRow.appendChild(createPixelHintIcon('settings.presence_prefer_games_hint'));
  frag.appendChild(gamesRow);

  frag.appendChild(buildSectionSubtitleRow('settings.presence_pinned_app'));
  const pinInput = document.createElement('input');
  pinInput.className = 'input';
  pinInput.type = 'text';
  pinInput.maxLength = 48;
  pinInput.placeholder = t('settings.presence_pinned_app_ph');
  pinInput.value = state.config.presencePinnedApp || '';
  pinInput.addEventListener('change', async () => {
    const v = pinInput.value.trim().slice(0, 48);
    pinInput.value = v;
    state.config = await saveConfig({ presencePinnedApp: v });
  });
  frag.appendChild(pinInput);
  const pinHint = document.createElement('p');
  pinHint.className = 'hint';
  pinHint.dataset.i18n = 'settings.presence_pinned_app_hint';
  pinHint.textContent = t('settings.presence_pinned_app_hint');
  frag.appendChild(pinHint);

  return frag;
}
