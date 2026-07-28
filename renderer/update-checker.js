/**
 * GitHub / electron-updater check flow and update status toasts.
 * @see https://github.com/krwg/blip/issues/58
 */

import { isVersionNewer, filterReleasesForChannel } from './app-version.js';

/**
 * Pure mapping from update status payload to toast options (no DOM).
 * @param {object|null|undefined} payload
 * @param {(key: string) => string} t
 * @param {{ onOpenUpdatesSettings?: () => void, onQuitAndInstall?: () => void }} callbacks
 * @returns {{ title: string, body?: string, variant?: string, durationMs?: number, actions?: object[] }|null}
 */
export function buildUpdateStatusToastOptions(payload, t, callbacks = {}) {
  if (!payload?.state) return null;

  const actions = [];
  let title = '';
  let body = '';
  let variant = 'accent';
  let durationMs = 10000;

  switch (payload.state) {
    case 'checking':
      title = t('toast.update_checking');
      durationMs = 5000;
      break;
    case 'available':
      title = t('toast.update_available');
      body = t('toast.update_available_body').replace('{v}', payload.version || '—');
      actions.push({
        label: t('settings.section_updates'),
        primary: true,
        onClick: () => callbacks.onOpenUpdatesSettings?.(),
      });
      break;
    case 'none':
      title = t('toast.update_latest');
      durationMs = 5000;
      break;
    case 'progress':
      title = t('toast.update_progress');
      body = `${payload.percent ?? 0}%`;
      durationMs = 0;
      break;
    case 'downloaded':
      title = t('toast.update_ready');
      body = t('toast.update_ready_body').replace('{v}', payload.version || '—');
      actions.push({
        label: t('settings.updates_install'),
        primary: true,
        onClick: () => callbacks.onQuitAndInstall?.(),
      });
      durationMs = 0;
      break;
    case 'error':
      title = t('toast.update_error');
      body = payload.message || '';
      variant = 'danger';
      break;
    default:
      return null;
  }

  return { title, body, variant, durationMs, actions };
}

/**
 * @param {object} deps
 * @param {() => object} deps.getState
 * @param {(view: string, opts?: object) => void} deps.renderView
 * @param {(key: string) => string} deps.t
 * @param {(opts: object) => { dismiss?: () => void }} deps.showAppToast
 */
export function createUpdateChecker(deps) {
  const { getState, renderView, t, showAppToast } = deps;

  let lastUpdateToastDismiss = null;

  function showUpdateStatusToast(payload) {
    const options = buildUpdateStatusToastOptions(payload, t, {
      onOpenUpdatesSettings: () => {
        const state = getState();
        state.settingsSection = 'updates';
        renderView('settings');
      },
      onQuitAndInstall: async () => {
        const res = await window.blip.quitAndInstall?.();
        if (res?.skipped && res.reason === 'call_active') {
          showUpdateStatusToast({ state: 'error', message: t('settings.updates_status_call_active') });
        }
      },
    });
    if (!options) return;

    lastUpdateToastDismiss?.();
    lastUpdateToastDismiss = null;

    const toast = showAppToast(options);
    lastUpdateToastDismiss = toast?.dismiss ?? null;
  }

  async function checkUpdatesViaGithub(currentVersion) {
    const result = await window.blip.getGithubReleases?.(3);
    if (!result?.ok || !result.releases?.length) {
      showUpdateStatusToast({ state: 'error', message: t('settings.updates_releases_error') });
      return;
    }
    const state = getState();
    const channel = filterReleasesForChannel(result.releases, !!state.config?.receiveBetaUpdates);
    const latest = channel[0];
    const tag = latest?.tag?.replace(/^v/i, '') || '';
    if (isVersionNewer(tag, currentVersion)) {
      showUpdateStatusToast({ state: 'available', version: tag });
    } else {
      showUpdateStatusToast({ state: 'none' });
    }
  }

  async function runStartupUpdateCheck() {
    const state = getState();
    if (state?.config?.autoCheckUpdates === false) return;
    if (!window.blip?.getAppMetadata) return;
    const meta = await window.blip.getAppMetadata();
    const current = meta?.version || '0.0.0';

    showUpdateStatusToast({ state: 'checking' });

    if (meta?.isPackaged && window.blip.checkForUpdates) {
      if (meta?.isPortable) {
        await checkUpdatesViaGithub(current);
        return;
      }
      const r = await window.blip.checkForUpdates();
      if (r?.skipped) {
        await checkUpdatesViaGithub(current);
      }
      return;
    }

    await checkUpdatesViaGithub(current);
  }

  return {
    showUpdateStatusToast,
    checkUpdatesViaGithub,
    runStartupUpdateCheck,
  };
}
