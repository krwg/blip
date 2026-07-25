import { t } from '../i18n.js';
import {
  buildThemedSelect,
  fillSettingsDropdown,
  buildSettingsFieldWithHint,
  buildPanelTitleRow,
} from '../settings-ui.js';
import {
  FILE_LIMIT_GB_OPTIONS,
  normalizeFileLimitGb,
  formatFileLimitLabel,
} from '../file-transfer-limits.js';
import {
  FILE_TRANSFER_SPEED_IDS,
  normalizeFileTransferSpeed,
} from '../file-transfer-speed.js';

export function buildSettingsTransferPanel({ getState, saveConfig }) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel';
  frag.appendChild(buildPanelTitleRow('settings.section_transfer', 'settings.transfer_hint'));

  const limitSelect = buildThemedSelect();
  const limitOpts = FILE_LIMIT_GB_OPTIONS.map((gb) => ({
    value: String(gb),
    label: formatFileLimitLabel(gb, t),
  }));
  fillSettingsDropdown(
    limitSelect,
    limitOpts,
    String(normalizeFileLimitGb(state.config.maxFileTransferGb)),
    async (val) => {
      state.config = await saveConfig({ maxFileTransferGb: Number(val) });
    }
  );
  const speedSelect = buildThemedSelect();
  const speedOpts = FILE_TRANSFER_SPEED_IDS.map((id) => ({
    value: id,
    label: t(`settings.file_speed_${id}`),
  }));
  fillSettingsDropdown(
    speedSelect,
    speedOpts,
    normalizeFileTransferSpeed(state.config.fileTransferSpeed),
    async (val) => {
      state.config = await saveConfig({ fileTransferSpeed: val });
    }
  );
  frag.appendChild(
    buildSettingsFieldWithHint('settings.file_limit', 'settings.transfer_hint', limitSelect)
  );
  frag.appendChild(
    buildSettingsFieldWithHint('settings.file_speed', 'settings.file_speed_hint', speedSelect)
  );
  return frag;
}
