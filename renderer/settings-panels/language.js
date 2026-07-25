import { t, setLang, getLang, applyLangChange } from '../i18n.js';
import {
  buildThemedSelect,
  fillSettingsDropdown,
  buildSettingsField,
  buildPanelTitleRow,
} from '../settings-ui.js';

export function buildSettingsLanguagePanel({ getState, saveConfig, renderSettings }) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel';
  frag.appendChild(buildPanelTitleRow('settings.section_language'));

  const langSelect = buildThemedSelect();
  fillSettingsDropdown(
    langSelect,
    [
      { value: 'en', label: 'English' },
      { value: 'ru', label: 'Русский' },
    ],
    state.config.language || getLang() || 'en',
    async (lang) => {
      setLang(lang);
      state.config.language = lang;
      await saveConfig({ language: lang });
      applyLangChange();
      state.settingsSection = 'language';
      renderSettings?.();
    }
  );

  frag.appendChild(buildSettingsField('settings.language', langSelect));
  return frag;
}
