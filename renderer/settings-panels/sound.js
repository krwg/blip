import { t } from '../i18n.js';
import {
  buildThemedSelect,
  buildSettingsField,
  buildSettingsFieldWithHint,
  buildPanelTitleRow,
  createPixelToggle,
} from '../settings-ui.js';
import {
  fillPremiumGatedDropdown,
  markPremiumGatedOptions,
  MESH_PLUS_FEATURES,
} from '../mesh-plus.js';
import {
  sounds,
  setSoundPrefs,
  SOUND_PREVIEW_KEYS,
  MELODY_PREVIEW_KEYS,
  SOUND_PACK_IDS,
  MELODY_PACK_IDS,
} from '../audio.js';

/**
 * @param {{
 *   getState: () => { config: object },
 *   saveConfig: (patch: object) => Promise<object>,
 *   applySoundPrefs: (cfg?: object) => void,
 * }} deps
 */
export function buildSettingsSoundPanel({ getState, saveConfig, applySoundPrefs }) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel';
  frag.appendChild(buildPanelTitleRow('settings.section_sound'));

  const enableToggle = createPixelToggle({
    checked: state.config.uiSoundsEnabled !== false,
    labelKey: 'settings.sound_enable',
    onChange: async (checked) => {
      state.config = await saveConfig({ uiSoundsEnabled: checked });
      applySoundPrefs?.(state.config);
      syncVolumeDisabled();
    },
  });

  const volLabel = document.createElement('label');
  volLabel.className = 'settings-sound-volume-label';
  volLabel.dataset.i18n = 'settings.sound_volume';
  volLabel.textContent = t('settings.sound_volume');

  const volRow = document.createElement('div');
  volRow.className = 'settings-sound-volume-row';

  const volRange = document.createElement('input');
  volRange.type = 'range';
  volRange.min = '0';
  volRange.max = '100';
  volRange.step = '5';
  volRange.className = 'settings-sound-range';
  const volPct = Math.round(
    (typeof state.config.uiSoundsVolume === 'number' ? state.config.uiSoundsVolume : 1) * 100
  );
  volRange.value = String(volPct);

  const volVal = document.createElement('span');
  volVal.className = 'settings-sound-volume-val';
  volVal.textContent = `${volPct}%`;

  async function persistVolume() {
    const v = Number(volRange.value) / 100;
    volVal.textContent = `${volRange.value}%`;
    state.config = await saveConfig({ uiSoundsVolume: v });
    applySoundPrefs?.(state.config);
  }

  volRange.addEventListener('input', () => {
    volVal.textContent = `${volRange.value}%`;
    setSoundPrefs({
      enabled: enableToggle.input.checked,
      volume: Number(volRange.value) / 100,
      soundPack: state.config.uiSoundPack,
      melodyPack: state.config.uiMelodyPack,
    });
  });
  volRange.addEventListener('change', () => {
    void persistVolume();
  });

  function syncVolumeDisabled() {
    volRange.disabled = !enableToggle.input.checked;
    volLabel.style.opacity = enableToggle.input.checked ? '1' : '0.45';
  }
  syncVolumeDisabled();

  volRow.appendChild(volRange);
  volRow.appendChild(volVal);

  const soundPackSelect = buildThemedSelect();
  fillPremiumGatedDropdown(
    soundPackSelect,
    markPremiumGatedOptions(
      [
        { value: 'signal', label: t('settings.sound_pack_signal') },
        { value: 'pulse', label: t('settings.sound_pack_pulse') },
        { value: 'wire', label: t('settings.sound_pack_wire') },
        { value: 'static', label: t('settings.sound_pack_static') },
      ],
      MESH_PLUS_FEATURES.sound_pack,
      state.config
    ),
    SOUND_PACK_IDS.includes(state.config.uiSoundPack) ? state.config.uiSoundPack : 'signal',
    MESH_PLUS_FEATURES.sound_pack,
    state.config,
    async (id) => {
      state.config = await saveConfig({ uiSoundPack: id });
      applySoundPrefs?.(state.config);
    }
  );

  const melodyPackSelect = buildThemedSelect();
  fillPremiumGatedDropdown(
    melodyPackSelect,
    markPremiumGatedOptions(
      [
        { value: 'mesh', label: t('settings.melody_pack_mesh') },
        { value: 'grid', label: t('settings.melody_pack_grid') },
        { value: 'beacon', label: t('settings.melody_pack_beacon') },
        { value: 'chime', label: t('settings.melody_pack_chime') },
      ],
      MESH_PLUS_FEATURES.melody_pack,
      state.config
    ),
    MELODY_PACK_IDS.includes(state.config.uiMelodyPack) ? state.config.uiMelodyPack : 'mesh',
    MESH_PLUS_FEATURES.melody_pack,
    state.config,
    async (id) => {
      state.config = await saveConfig({ uiMelodyPack: id });
      applySoundPrefs?.(state.config);
    }
  );

  const previewLabels = {
    messageReceived: 'settings.sound_prev_message',
    messageSent: 'settings.sound_prev_sent',
    notify: 'settings.sound_prev_notify',
    incomingCall: 'settings.sound_prev_incoming',
    outgoingCall: 'settings.sound_prev_outgoing',
    callConnected: 'settings.sound_prev_connected',
    callEnd: 'settings.sound_prev_end',
    peerOnline: 'settings.sound_prev_online',
    groupInvite: 'settings.sound_prev_group',
    groupCallInvite: 'settings.sound_prev_group_call',
    meshPing: 'settings.sound_prev_ping',
  };

  function buildPreviewSection(titleKey, keys) {
    const sub = document.createElement('h3');
    sub.className = 'section-subtitle';
    sub.dataset.i18n = titleKey;
    sub.textContent = t(titleKey);
    const grid = document.createElement('div');
    grid.className = 'settings-sound-preview-grid';
    keys.forEach((key) => {
      const labelKey = previewLabels[key];
      if (!labelKey) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-lang settings-sound-preview-btn';
      btn.dataset.i18n = labelKey;
      btn.textContent = t(labelKey);
      btn.addEventListener('click', async () => {
        setSoundPrefs({
          enabled: true,
          volume: Number(volRange.value) / 100,
          soundPack: state.config.uiSoundPack,
          melodyPack: state.config.uiMelodyPack,
        });
        await sounds.preview(key);
      });
      grid.appendChild(btn);
    });
    return { sub, grid };
  }

  const fxPreview = buildPreviewSection('settings.sound_preview_fx', SOUND_PREVIEW_KEYS);
  const melodyPreview = buildPreviewSection(
    'settings.sound_preview_melody',
    MELODY_PREVIEW_KEYS
  );

  frag.appendChild(enableToggle.el);

  const typingToggle = createPixelToggle({
    checked: !!state.config.typingSoundEnabled,
    labelKey: 'settings.typing_sound',
    onChange: async (checked) => {
      state.config = await saveConfig({ typingSoundEnabled: checked });
    },
  });
  frag.appendChild(typingToggle.el);

  frag.appendChild(volLabel);
  frag.appendChild(volRow);
  frag.appendChild(
    buildSettingsFieldWithHint('settings.sound_pack', 'settings.sound_mesh_plus_hint', soundPackSelect)
  );
  frag.appendChild(buildSettingsField('settings.melody_pack', melodyPackSelect));
  const previewTitle = document.createElement('h3');
  previewTitle.className = 'section-subtitle';
  previewTitle.dataset.i18n = 'settings.sound_preview';
  previewTitle.textContent = t('settings.sound_preview');
  frag.appendChild(previewTitle);
  frag.appendChild(fxPreview.sub);
  frag.appendChild(fxPreview.grid);
  frag.appendChild(melodyPreview.sub);
  frag.appendChild(melodyPreview.grid);
  return frag;
}
