import { t } from './i18n.js';
import { buildSectionSubtitleRow } from './settings-ui.js';
import {
  getSessionStats,
  getSessionStatsChartBars,
  sessionOnlineHours,
} from './session-stats.js';

/**
 * @param {HTMLElement} parent
 */
export function appendSessionStatsSection(parent) {
  parent.appendChild(buildSectionSubtitleRow('settings.network_stats_title', 'settings.network_stats_hint'));

  const card = document.createElement('div');
  card.className = 'session-stats-panel settings-list-panel';

  const summary = document.createElement('div');
  summary.className = 'session-stats-summary';

  const chartWrap = document.createElement('div');
  chartWrap.className = 'session-stats-chart';
  chartWrap.setAttribute('role', 'img');
  chartWrap.setAttribute('aria-label', t('settings.network_stats_chart'));

  function refresh() {
    const s = getSessionStats();
    const hours = sessionOnlineHours();
    const hStr =
      hours >= 1 ? `${hours.toFixed(1)} h` : `${Math.max(1, Math.round(hours * 60))} min`;
    summary.textContent = t('settings.network_stats_summary')
      .replace('{hours}', hStr)
      .replace('{messages}', String(s.messagesSent || 0))
      .replace('{files}', String(s.filesSent || 0))
      .replace('{calls}', String(s.callsStarted || 0))
      .replace('{peers}', String(s.peersMaxOnline || 0));

    chartWrap.innerHTML = '';
    const bars = getSessionStatsChartBars();
    const maxVal = Math.max(1, ...bars.map((b) => b.value));
    for (const bar of bars) {
      const row = document.createElement('div');
      row.className = 'session-stats-chart__row';
      const label = document.createElement('span');
      label.className = 'session-stats-chart__label';
      label.textContent = t(bar.labelKey);
      const track = document.createElement('div');
      track.className = 'session-stats-chart__track';
      const fill = document.createElement('div');
      fill.className = 'session-stats-chart__fill';
      fill.style.width = `${Math.round((bar.value / maxVal) * 100)}%`;
      fill.title = String(bar.value);
      track.appendChild(fill);
      const val = document.createElement('span');
      val.className = 'session-stats-chart__val';
      val.textContent = String(bar.value);
      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(val);
      chartWrap.appendChild(row);
    }
  }

  card.appendChild(summary);
  card.appendChild(chartWrap);
  parent.appendChild(card);
  refresh();

  return { refresh };
}
