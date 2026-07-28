import { t } from '../i18n.js';
import {
  buildPanelTitleRow,
  createPixelToggle,
  createPixelHintIcon,
} from '../settings-ui.js';
import { releaseMarkdownToHtml, bindReleaseMarkdownLinks } from '../release-markdown.js';
import { openReleaseNotesOverlay } from '../release-overlay.js';
import { openConfirmDialog } from '../confirm-dialog.js';
import {
  filterReleasesForChannel,
  githubRepoBase,
  formatAppVersionBracket,
} from '../app-version.js';

/**
 * @param {{
 *   getState: () => { config: object },
 *   saveConfig: (patch: object) => Promise<object>,
 *   getLastUpdateStatus: () => object|null,
 *   setLastUpdateStatus: (v: object|null) => void,
 *   formatUpdateStatusText: () => string,
 *   checkUpdatesViaGithub: (version: string) => Promise<void>,
 * }} deps
 */
export function buildSettingsUpdatesPanel({
  getState,
  saveConfig,
  getLastUpdateStatus,
  setLastUpdateStatus,
  formatUpdateStatusText,
  checkUpdatesViaGithub,
}) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--updates';
  frag.appendChild(buildPanelTitleRow('settings.section_updates'));

  const autoTitle = document.createElement('h3');
  autoTitle.className = 'section-subtitle';
  autoTitle.dataset.i18n = 'settings.updates_auto_title';
  autoTitle.textContent = t('settings.updates_auto_title');

  const autoHintRow = document.createElement('div');
  autoHintRow.className = 'settings-label-row';
  autoHintRow.appendChild(autoTitle);
  autoHintRow.appendChild(createPixelHintIcon('settings.updates_auto_hint'));
  frag.appendChild(autoHintRow);

  frag.appendChild(
    createPixelToggle({
      checked: state.config.autoDownloadUpdates !== false,
      labelKey: 'settings.updates_auto_download',
      onChange: async (checked) => {
        state.config = await saveConfig({ autoDownloadUpdates: checked });
      },
    }).el
  );
  frag.appendChild(
    createPixelToggle({
      checked: state.config.autoCheckUpdates !== false,
      labelKey: 'settings.updates_auto_check',
      onChange: async (checked) => {
        state.config = await saveConfig({ autoCheckUpdates: checked });
      },
    }).el
  );

  const verLine = document.createElement('p');
  verLine.className = 'settings-about-version';
  frag.appendChild(verLine);

  const statusLine = document.createElement('p');
  statusLine.className = 'settings-update-status';
  frag.appendChild(statusLine);

  const actions = document.createElement('div');
  actions.className = 'settings-updates-actions';

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'btn btn-accent';
  checkBtn.disabled = true;
  checkBtn.dataset.i18n = 'settings.updates_check';
  checkBtn.textContent = t('settings.updates_check');
  checkBtn.addEventListener('click', async () => {
    if (!window.blip.checkForUpdates) return;
    setLastUpdateStatus({ state: 'checking' });
    delete statusLine.dataset.i18n;
    statusLine.textContent = formatUpdateStatusText();
    const r = await window.blip.checkForUpdates();
    if (r?.skipped) {
      setLastUpdateStatus(null);
      if (r.reason === 'portable') {
        statusLine.dataset.i18n = 'settings.updates_portable_only';
        statusLine.textContent = t('settings.updates_portable_only');
        const meta = await window.blip.getAppMetadata?.().catch(() => null);
        if (meta?.version) void checkUpdatesViaGithub?.(meta.version);
      } else if (r.reason === 'call_active') {
        delete statusLine.dataset.i18n;
        statusLine.textContent = t('settings.updates_status_call_active');
      } else {
        statusLine.dataset.i18n = 'settings.updates_dev_only';
        statusLine.textContent = t('settings.updates_dev_only');
      }
    } else {
      statusLine.textContent = formatUpdateStatusText();
    }
  });

  const releasesBtn = document.createElement('button');
  releasesBtn.type = 'button';
  releasesBtn.className = 'btn btn-lang';
  releasesBtn.dataset.i18n = 'settings.updates_releases';
  releasesBtn.textContent = t('settings.updates_releases');
  releasesBtn.addEventListener('click', async () => {
    const meta = await window.blip.getAppMetadata?.().catch(() => null);
    window.blip.openExternal?.(`${githubRepoBase(meta)}/releases`);
  });

  const installBtn = document.createElement('button');
  installBtn.type = 'button';
  installBtn.className = 'btn btn-lang';
  installBtn.dataset.i18n = 'settings.updates_install';
  installBtn.textContent = t('settings.updates_install');
  installBtn.disabled = getLastUpdateStatus()?.state !== 'downloaded';
  installBtn.addEventListener('click', async () => {
    if (latestRelease) {
      openReleaseNotesOverlay({
        tag: latestRelease.tag,
        name: latestRelease.name,
        body: latestRelease.body,
        url: latestRelease.url,
      });
      const ok = await openConfirmDialog({
        title: t('settings.updates_install'),
        body: t('settings.updates_install_after_notes'),
        confirmLabel: t('settings.updates_install'),
      });
      if (!ok) return;
    }
    const res = await window.blip.quitAndInstall?.();
    if (res?.skipped && res.reason === 'call_active') {
      delete statusLine.dataset.i18n;
      statusLine.textContent = t('settings.updates_status_call_active');
    }
  });

  actions.appendChild(checkBtn);
  actions.appendChild(releasesBtn);
  actions.appendChild(installBtn);
  frag.appendChild(actions);

  const releasesTitle = document.createElement('h3');
  releasesTitle.className = 'section-subtitle';
  releasesTitle.dataset.i18n = 'settings.updates_recent';
  releasesTitle.textContent = t('settings.updates_recent');
  frag.appendChild(releasesTitle);

  const releasesFeed = document.createElement('div');
  releasesFeed.className = 'settings-releases-feed settings-list-panel settings-list-panel--tall';
  releasesFeed.textContent = '…';
  frag.appendChild(releasesFeed);
  let latestRelease = null;

  function formatReleaseDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString();
    } catch {
      return '';
    }
  }

  void window.blip.getGithubReleases?.(8).then((result) => {
    releasesFeed.innerHTML = '';
    if (!result?.ok || !result.releases?.length) {
      const err = document.createElement('p');
      err.className = 'hint';
      err.dataset.i18n = 'settings.updates_releases_error';
      err.textContent = t('settings.updates_releases_error');
      releasesFeed.appendChild(err);
      return;
    }
    const feed = filterReleasesForChannel(
      result.releases,
      !!getState().config?.receiveBetaUpdates
    );
    latestRelease = feed[0] || null;
    for (const r of feed) {
      const card = document.createElement('article');
      card.className = 'settings-release-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute(
        'aria-label',
        t('settings.updates_open_notes').replace('{v}', r.tag || r.name || ''),
      );

      const openNotes = () => {
        openReleaseNotesOverlay({
          tag: r.tag,
          name: r.name,
          body: r.body,
          url: r.url,
        });
      };

      card.addEventListener('click', (e) => {
        if (e.target.closest('button, a')) return;
        openNotes();
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openNotes();
        }
      });

      const head = document.createElement('div');
      head.className = 'settings-release-head';
      const tag = document.createElement('strong');
      tag.textContent = r.tag || r.name || '—';
      const date = document.createElement('span');
      date.className = 'settings-release-date';
      date.textContent = formatReleaseDate(r.publishedAt);
      head.appendChild(tag);
      if (r.prerelease) {
        const pre = document.createElement('span');
        pre.className = 'settings-release-pre';
        pre.dataset.i18n = 'settings.release_pre';
        pre.textContent = t('settings.release_pre');
        head.appendChild(pre);
      }
      head.appendChild(date);
      card.appendChild(head);

      if (r.name && r.name !== r.tag) {
        const title = document.createElement('p');
        title.className = 'settings-release-name';
        title.textContent = r.name;
        card.appendChild(title);
      }

      if (r.body) {
        const body = document.createElement('div');
        body.className = 'settings-release-body release-md release-md--preview';
        body.innerHTML = releaseMarkdownToHtml(r.body);
        bindReleaseMarkdownLinks(body, (href) => window.blip.openExternal?.(href));
        card.appendChild(body);
      }

      if (r.url) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'btn btn-lang settings-release-link';
        link.dataset.i18n = 'settings.updates_open_release';
        link.textContent = t('settings.updates_open_release');
        link.addEventListener('click', (e) => {
          e.stopPropagation();
          window.blip.openExternal?.(r.url);
        });
        card.appendChild(link);
      }

      releasesFeed.appendChild(card);
    }
  }).catch(() => {
    releasesFeed.innerHTML = '';
    const err = document.createElement('p');
    err.className = 'hint';
    err.textContent = t('settings.updates_releases_error');
    releasesFeed.appendChild(err);
  });

  window.blip.getAppMetadata?.().then((meta) => {
    verLine.textContent = formatAppVersionBracket(meta);
    if (!meta?.isPackaged) {
      statusLine.dataset.i18n = 'settings.updates_dev_only';
      statusLine.textContent = t('settings.updates_dev_only');
      checkBtn.disabled = true;
      installBtn.disabled = true;
    } else if (meta?.isPortable) {
      statusLine.dataset.i18n = 'settings.updates_portable_only';
      statusLine.textContent = t('settings.updates_portable_only');
      checkBtn.disabled = false;
      installBtn.disabled = true;
    } else {
      checkBtn.disabled = false;
      delete statusLine.dataset.i18n;
      statusLine.textContent = formatUpdateStatusText();
      installBtn.disabled = getLastUpdateStatus()?.state !== 'downloaded';
    }
  }).catch(() => {});

  return frag;
}
