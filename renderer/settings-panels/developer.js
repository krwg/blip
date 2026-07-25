import { t } from '../i18n.js';
import {
  buildPanelTitleRow,
  createPixelToggle,
  createPixelHintIcon,
  copyTextToClipboard,
} from '../settings-ui.js';
import { showAppToast } from '../toasts.js';
import { premiumTierEnabled } from '../mesh-plus.js';
import { getNetworkLogEntries } from '../network-log.js';
import { openConfirmDialog } from '../confirm-dialog.js';
import { hideDeveloperMode } from '../dev-mode.js';

/**
 * @param {{
 *   getState: () => { config: object, peers: array, view: string },
 *   saveConfig: (patch: object) => Promise<object>,
 *   syncAchievements: (cfg: object) => void,
 *   refreshBeaconMesh: () => void,
 *   onProjectsChanged: () => void,
 *   onFactoryReset: () => Promise<void>,
 *   onDeveloperHidden: (cfg: object) => void,
 *   renderSettingsIfOpen: () => void,
 *   renderPeersIfOpen: () => void,
 * }} deps
 */
export function buildSettingsDeveloperPanel({
  getState,
  saveConfig,
  syncAchievements,
  refreshBeaconMesh,
  onProjectsChanged,
  onFactoryReset,
  onDeveloperHidden,
  renderSettingsIfOpen,
  renderPeersIfOpen,
}) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--developer';

  frag.appendChild(buildPanelTitleRow('settings.section_developer', 'settings.dev_panel_hint'));

  const projRow = document.createElement('div');
  projRow.className = 'settings-toggle-with-hint';
  const projToggle = createPixelToggle({
    checked: !!state.config?.devProjectsEnabled,
    labelKey: 'settings.dev_projects',
    onChange: async (checked) => {
      const next = await saveConfig({ devProjectsEnabled: checked });
      getState().config = next;
      onProjectsChanged?.(checked);
      showAppToast({
        title: checked ? t('settings.dev_projects_on') : t('settings.dev_projects_off'),
        durationMs: 4200,
      });
    },
  });
  projRow.appendChild(projToggle.el);
  projRow.appendChild(createPixelHintIcon('settings.dev_projects_hint'));
  frag.appendChild(projRow);

  const betaRow = document.createElement('div');
  betaRow.className = 'settings-toggle-with-hint';
  const betaToggle = createPixelToggle({
    checked: !!state.config?.receiveBetaUpdates,
    labelKey: 'settings.dev_beta_updates',
    onChange: async (checked) => {
      const next = await saveConfig({ receiveBetaUpdates: checked });
      getState().config = next;
      if (next?.achievementsEnabled) syncAchievements?.(next);
      showAppToast({
        title: checked ? t('settings.dev_beta_on') : t('settings.dev_beta_off'),
        durationMs: 4000,
      });
    },
  });
  betaRow.appendChild(betaToggle.el);
  betaRow.appendChild(createPixelHintIcon('settings.dev_hint'));
  frag.appendChild(betaRow);

  const traceRow = document.createElement('div');
  traceRow.className = 'settings-toggle-with-hint';
  const traceToggle = createPixelToggle({
    checked: !!state.config?.devMeshTrace,
    labelKey: 'settings.dev_mesh_trace',
    onChange: async (checked) => {
      const next = await saveConfig({ devMeshTrace: checked });
      getState().config = next;
      showAppToast({
        title: checked ? t('settings.dev_mesh_trace_on') : t('settings.dev_mesh_trace_off'),
        durationMs: 3200,
      });
    },
  });
  traceRow.appendChild(traceToggle.el);
  traceRow.appendChild(createPixelHintIcon('settings.dev_mesh_trace_hint'));
  frag.appendChild(traceRow);

  const beaconRow = document.createElement('div');
  beaconRow.className = 'settings-toggle-with-hint';
  const beaconToggle = createPixelToggle({
    checked: !!state.config?.devBeaconEnabled,
    labelKey: 'settings.dev_beacon',
    onChange: async (checked) => {
      const next = await saveConfig({ devBeaconEnabled: checked });
      getState().config = next;
      refreshBeaconMesh?.();
      showAppToast({
        title: checked ? t('settings.dev_beacon_on') : t('settings.dev_beacon_off'),
        durationMs: 4000,
      });
    },
  });
  beaconRow.appendChild(beaconToggle.el);
  beaconRow.appendChild(createPixelHintIcon('settings.dev_beacon_hint'));
  frag.appendChild(beaconRow);

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn-lang';
  exportBtn.dataset.i18n = 'settings.dev_export';
  exportBtn.textContent = t('settings.dev_export');
  exportBtn.addEventListener('click', async () => {
    let net = null;
    try {
      net = await window.blip.getNetworkDiagnostics?.();
    } catch {
      /* ignore */
    }
    const st = getState();
    const payload = {
      exportedAt: new Date().toISOString(),
      version: (await window.blip.getAppMetadata?.())?.version,
      blipId: st.config.blipId,
      network: net,
      peers: st.peers.map((p) => ({
        id: p.blipId,
        online: p.online,
        name: p.displayName,
      })),
      networkLog: getNetworkLogEntries(),
    };
    const ok = await copyTextToClipboard(JSON.stringify(payload, null, 2));
    showAppToast({
      title: ok ? t('settings.dev_export_done') : t('settings.dev_export_fail'),
      durationMs: 4000,
      variant: ok ? undefined : 'danger',
    });
  });
  frag.appendChild(exportBtn);

  const clearMeshBtn = document.createElement('button');
  clearMeshBtn.type = 'button';
  clearMeshBtn.className = 'btn btn-danger';
  clearMeshBtn.dataset.i18n = 'settings.dev_clear_mesh_plus';
  clearMeshBtn.textContent = t('settings.dev_clear_mesh_plus');
  clearMeshBtn.addEventListener('click', async () => {
    const st = getState();
    if (!premiumTierEnabled(st.config)) {
      showAppToast({
        title: t('settings.dev_clear_mesh_plus_none'),
        durationMs: 4000,
      });
      return;
    }
    try {
      await window.blip.deactivateMeshPlus();
      st.config = await window.blip.getConfig();
      showAppToast({
        title: t('settings.dev_clear_mesh_plus_ok'),
        durationMs: 4500,
      });
      renderSettingsIfOpen?.();
      renderPeersIfOpen?.();
    } catch (e) {
      showAppToast({
        title: e?.message || t('settings.dev_clear_mesh_plus_fail'),
        durationMs: 4500,
        variant: 'danger',
      });
    }
  });
  frag.appendChild(clearMeshBtn);

  const factoryRow = document.createElement('div');
  factoryRow.className = 'settings-toggle-with-hint settings-dev-factory-row';
  const factoryBtn = document.createElement('button');
  factoryBtn.type = 'button';
  factoryBtn.className = 'btn btn-danger';
  factoryBtn.dataset.i18n = 'settings.dev_factory_reset';
  factoryBtn.textContent = t('settings.dev_factory_reset');
  factoryBtn.addEventListener('click', async () => {
    const ok = await openConfirmDialog({
      title: t('settings.dev_factory_reset'),
      body: t('settings.dev_factory_reset_confirm'),
      confirmLabel: t('settings.dev_factory_reset'),
      danger: true,
    });
    if (!ok) return;
    try {
      await onFactoryReset?.();
      showAppToast({
        title: t('settings.dev_factory_reset_ok'),
        durationMs: 5000,
      });
    } catch (e) {
      showAppToast({
        title: e?.message || t('settings.dev_factory_reset_fail'),
        durationMs: 4500,
        variant: 'danger',
      });
    }
  });
  factoryRow.appendChild(factoryBtn);
  factoryRow.appendChild(createPixelHintIcon('settings.dev_factory_reset_hint'));
  frag.appendChild(factoryRow);

  const hideRow = document.createElement('div');
  hideRow.className = 'settings-toggle-with-hint';
  const hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'btn btn-lang';
  hideBtn.dataset.i18n = 'settings.dev_hide';
  hideBtn.textContent = t('settings.dev_hide');
  hideBtn.addEventListener('click', async () => {
    const next = await hideDeveloperMode({
      saveConfig,
      onChange: (cfg) => {
        getState().config = cfg;
      },
    });
    onDeveloperHidden?.(next);
  });
  hideRow.appendChild(hideBtn);
  hideRow.appendChild(createPixelHintIcon('settings.dev_hide_hint'));
  frag.appendChild(hideRow);

  return frag;
}
