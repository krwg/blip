import { t } from '../i18n.js';
import {
  buildThemedSelect,
  fillSettingsDropdown,
  buildSettingsFieldWithHint,
  buildPanelTitleRow,
  createPixelToggle,
  createPixelHintIcon,
  copyTextToClipboard,
} from '../settings-ui.js';
import {
  CLIPBOARD_SYNC_MODES,
  normalizeClipboardSyncMode,
} from '../clipboard-sync.js';
import { openConfirmDialog } from '../confirm-dialog.js';
import { showAppToast } from '../toasts.js';
import { getNetworkLogEntries, clearNetworkLog } from '../network-log.js';
import { appendSessionStatsSection } from '../session-stats-panel.js';
import { appendBandwidthGraphSection } from '../beacon-bandwidth-graph.js';
import { syncAchievements } from '../achievements-tracker.js';

/**
 * @param {{
 *   getState: () => { config: object, peers: array, view: string },
 *   saveConfig: (patch: object) => Promise<object>,
 *   restartClipboardSync: () => void,
 *   renderProjectsIfOpen: () => void,
 * }} deps
 */
export function buildSettingsNetworkPanel({
  getState,
  saveConfig,
  restartClipboardSync,
  renderProjectsIfOpen,
}) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel';
  frag.appendChild(buildPanelTitleRow('settings.section_network'));

  const clipOpts = CLIPBOARD_SYNC_MODES.map((id) => ({
    value: id,
    label: t(`clipboard.mode_${id}`),
  }));
  const clipSelect = buildThemedSelect();
  fillSettingsDropdown(
    clipSelect,
    clipOpts,
    normalizeClipboardSyncMode(state.config.clipboardSyncMode),
    async (mode) => {
      const prev = normalizeClipboardSyncMode(state.config.clipboardSyncMode);
      if (prev === 'off' && mode !== 'off') {
        const ok = await openConfirmDialog({
          title: t('clipboard.mode'),
          body: t('clipboard.enable_confirm'),
          danger: true,
        });
        if (!ok) {
          clipSelect.value = 'off';
          return;
        }
      }
      state.config = await saveConfig({ clipboardSyncMode: mode });
      restartClipboardSync?.();
    }
  );
  frag.appendChild(
    buildSettingsFieldWithHint('clipboard.mode', 'clipboard.hint', clipSelect)
  );

  const iceRow = document.createElement('div');
  iceRow.className = 'settings-toggle-with-hint';
  const iceLines = document.createElement('textarea');
  iceLines.className = 'input settings-textarea';
  iceLines.rows = 4;
  iceLines.placeholder = t('settings.ice_lines_placeholder');
  iceLines.dataset.i18nPlaceholder = 'settings.ice_lines_placeholder';
  iceLines.value = state.config?.iceServerLines || '';
  iceLines.disabled = !state.config?.iceEnabled;
  iceLines.addEventListener('change', async () => {
    state.config = await saveConfig({ iceServerLines: iceLines.value });
  });
  const iceToggle = createPixelToggle({
    checked: !!state.config?.iceEnabled,
    labelKey: 'settings.ice_enabled',
    onChange: async (checked) => {
      iceLines.disabled = !checked;
      state.config = await saveConfig({ iceEnabled: checked });
    },
  });
  iceRow.appendChild(iceToggle.el);
  iceRow.appendChild(createPixelHintIcon('settings.ice_hint'));
  frag.appendChild(iceRow);
  frag.appendChild(
    buildSettingsFieldWithHint('settings.ice_lines', 'settings.ice_lines_hint', iceLines)
  );

  const projClipRow = document.createElement('div');
  projClipRow.className = 'settings-toggle-with-hint';
  const projClipToggle = createPixelToggle({
    checked: !!state.config?.projectsClipboardEnabled,
    labelKey: 'settings.projects_clipboard',
    onChange: async (checked) => {
      if (checked) {
        const ok = await openConfirmDialog({
          title: t('settings.projects_clipboard'),
          body: t('settings.projects_clipboard_enable_confirm'),
        });
        if (!ok) {
          projClipToggle.input.checked = false;
          return;
        }
      }
      state.config = await saveConfig({ projectsClipboardEnabled: checked });
      showAppToast({
        title: checked
          ? t('settings.projects_clipboard_on')
          : t('settings.projects_clipboard_off'),
        durationMs: 4000,
      });
      if (getState().view === 'projects') renderProjectsIfOpen?.();
    },
  });
  projClipRow.appendChild(projClipToggle.el);
  projClipRow.appendChild(createPixelHintIcon('settings.projects_clipboard_hint'));
  frag.appendChild(projClipRow);

  const statsUi = appendSessionStatsSection(frag);
  appendBandwidthGraphSection(frag);

  const actions = document.createElement('div');
  actions.className = 'settings-network-actions';

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn btn-lang';
  refreshBtn.dataset.i18n = 'settings.network_refresh';
  refreshBtn.textContent = t('settings.network_refresh');

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-lang';
  copyBtn.dataset.i18n = 'settings.network_copy';
  copyBtn.textContent = t('settings.network_copy');

  actions.appendChild(refreshBtn);
  actions.appendChild(copyBtn);
  frag.appendChild(actions);

  const bodyHost = document.createElement('div');
  bodyHost.className = 'settings-network-body settings-list-panel settings-list-panel--auto';
  frag.appendChild(bodyHost);

  let lastDiagnostics = null;

  function formatDiagnosticsText(info) {
    const peers = getState().peers || [];
    const online = peers.filter((p) => p.online).length;
    const discovery = info.discoveryActive
      ? t('settings.network_discovery_on')
      : t('settings.network_discovery_off');
    return [
      `BLIP #${info.blipId ?? '—'}`,
      `${t('settings.network_hostname')}: ${info.hostname || '—'}`,
      `${t('settings.network_local_ip')}: ${info.localIp || '—'}`,
      `${t('settings.network_ipv4_all')}: ${(info.localIpv4s || []).join(', ') || '—'}`,
      `${t('settings.network_tcp')}: ${info.tcpPort ?? '—'}`,
      `${t('settings.network_udp')}: ${info.udpPort ?? '—'}`,
      `${t('settings.network_discovery')}: ${discovery}`,
      `${t('settings.network_peers')}: ${t('settings.network_peers_value')
        .replace('{online}', String(online))
        .replace('{total}', String(info.totalPeers ?? peers.length))}`,
    ].join('\n');
  }

  function renderDiagnostics(info) {
    bodyHost.innerHTML = '';
    lastDiagnostics = info;
    if (!info) {
      const err = document.createElement('p');
      err.className = 'hint';
      err.textContent = t('settings.network_unavailable');
      bodyHost.appendChild(err);
      return;
    }

    const list = document.createElement('dl');
    list.className = 'settings-network-list';

    function addRow(labelKey, value) {
      const dt = document.createElement('dt');
      dt.dataset.i18n = labelKey;
      dt.textContent = t(labelKey);
      const dd = document.createElement('dd');
      dd.textContent = value;
      list.appendChild(dt);
      list.appendChild(dd);
    }

    const peers = getState().peers || [];
    const online = peers.filter((p) => p.online).length;
    const discovery = info.discoveryActive
      ? t('settings.network_discovery_on')
      : t('settings.network_discovery_off');

    addRow('settings.network_blip_id', String(info.blipId ?? '—'));
    addRow('settings.network_hostname', info.hostname || '—');
    addRow('settings.network_local_ip', info.localIp || '—');
    addRow('settings.network_ipv4_all', (info.localIpv4s || []).join(', ') || '—');
    addRow('settings.network_tcp', String(info.tcpPort ?? '—'));
    addRow('settings.network_udp', String(info.udpPort ?? '—'));
    addRow('settings.network_discovery', discovery);
    addRow(
      'settings.network_peers',
      t('settings.network_peers_value')
        .replace('{online}', String(online))
        .replace('{total}', String(info.totalPeers ?? peers.length))
    );

    bodyHost.appendChild(list);

    const logTitle = document.createElement('h3');
    logTitle.className = 'section-subtitle';
    logTitle.dataset.i18n = 'settings.network_log';
    logTitle.textContent = t('settings.network_log');
    bodyHost.appendChild(logTitle);

    const logList = document.createElement('div');
    logList.className = 'network-log-list';

    function renderLog() {
      logList.innerHTML = '';
      const entries = getNetworkLogEntries();
      if (!entries.length) {
        const empty = document.createElement('p');
        empty.className = 'hint';
        empty.textContent = t('settings.network_log_empty');
        logList.appendChild(empty);
        return;
      }
      entries.slice(0, 24).forEach((e) => {
        const row = document.createElement('div');
        row.className = 'network-log-row';
        const time = new Date(e.ts).toLocaleTimeString();
        row.textContent = `${time} · #${e.peerId} · ${e.event}`;
        logList.appendChild(row);
      });
    }

    const clearLogBtn = document.createElement('button');
    clearLogBtn.type = 'button';
    clearLogBtn.className = 'btn btn-lang';
    clearLogBtn.textContent = t('settings.network_log_clear');
    clearLogBtn.addEventListener('click', () => {
      clearNetworkLog();
      renderLog();
    });

    bodyHost.appendChild(clearLogBtn);
    bodyHost.appendChild(logList);
    renderLog();
  }

  async function loadDiagnostics() {
    bodyHost.innerHTML = '';
    const loading = document.createElement('p');
    loading.className = 'hint';
    loading.textContent = '…';
    bodyHost.appendChild(loading);
    try {
      const info = await window.blip.getNetworkDiagnostics?.();
      renderDiagnostics(info);
    } catch {
      renderDiagnostics(null);
    }
  }

  refreshBtn.addEventListener('click', () => {
    void loadDiagnostics();
  });

  copyBtn.addEventListener('click', async () => {
    if (!lastDiagnostics) return;
    const text = formatDiagnosticsText(lastDiagnostics);
    const ok = await copyTextToClipboard(text);
    if (ok) {
      showAppToast({
        title: t('settings.network_copy_done'),
        durationMs: 2800,
      });
    } else {
      showAppToast({
        title: t('settings.network_copy_fail'),
        durationMs: 4000,
        variant: 'danger',
      });
    }
  });

  void loadDiagnostics();

  const statsRefreshTimer = setInterval(() => {
    statsUi?.refresh?.();
    const cfg = getState().config;
    if (cfg?.achievementsEnabled) syncAchievements(cfg);
  }, 60_000);

  frag._networkCleanup = () => clearInterval(statsRefreshTimer);

  return frag;
}
