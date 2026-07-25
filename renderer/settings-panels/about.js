import { t } from '../i18n.js';
import { appendAboutBuildTrustNotice } from '../trust-ui.js';
import { bindAboutVersionUnlock } from '../dev-mode.js';
import { formatAppVersionBracket } from '../app-version.js';

function githubRepoBase(meta) {
  const raw = meta?.githubUrl || 'https://github.com/krwg/blip';
  return String(raw).replace(/\/$/, '');
}

function showAboutIconContextMenu(e, { openAppearanceIcons }) {
  const menu = document.createElement('div');
  menu.className = 'context-menu glass';
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  const changeBtn = document.createElement('button');
  changeBtn.type = 'button';
  changeBtn.dataset.i18n = 'settings.about_icon_change';
  changeBtn.textContent = t('settings.about_icon_change');
  changeBtn.addEventListener('mousedown', (ev) => ev.stopPropagation());
  changeBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    menu.remove();
    openAppearanceIcons?.();
  });

  menu.appendChild(changeBtn);
  document.body.appendChild(menu);
  const close = () => menu.remove();
  setTimeout(() => document.addEventListener('click', close, { once: true }), 0);
}

/**
 * @param {{
 *   getConfig: () => object,
 *   saveConfig: (patch: object) => Promise<object>,
 *   openAppearanceIcons: () => void,
 *   onDeveloperUnlocked?: (config: object) => void,
 * }} deps
 */
export function buildSettingsAboutPanel({
  getConfig,
  saveConfig,
  openAppearanceIcons,
  onDeveloperUnlocked,
}) {
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--about';

  const hero = document.createElement('div');
  hero.className = 'settings-about-hero';
  const iconBtn = document.createElement('button');
  iconBtn.type = 'button';
  iconBtn.className = 'settings-about-icon-btn';
  iconBtn.title = t('settings.about_icon_open_appearance');
  const icon = document.createElement('img');
  icon.className = 'settings-about-icon';
  icon.alt = 'BLIP';
  icon.draggable = false;
  void (async () => {
    try {
      const url = await window.blip.getAppIconUrl?.();
      if (url) icon.src = url;
    } catch {
      /* ignore */
    }
  })();
  iconBtn.appendChild(icon);
  iconBtn.addEventListener('click', () => {
    openAppearanceIcons?.();
  });
  iconBtn.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showAboutIconContextMenu(e, { openAppearanceIcons });
  });
  hero.appendChild(iconBtn);

  const aboutLine = document.createElement('p');
  aboutLine.className = 'settings-about-line';

  const aboutVersion = document.createElement('p');
  aboutVersion.className = 'settings-about-version';

  const aboutTagline = document.createElement('p');
  aboutTagline.className = 'settings-about-tagline';
  aboutTagline.dataset.i18n = 'settings.about_tagline';
  aboutTagline.textContent = t('settings.about_tagline');

  hero.appendChild(aboutLine);
  hero.appendChild(aboutVersion);
  hero.appendChild(aboutTagline);
  frag.appendChild(hero);

  bindAboutVersionUnlock(aboutVersion, {
    getConfig,
    saveConfig,
    onUnlocked: onDeveloperUnlocked,
  });

  const metaBlock = document.createElement('div');
  metaBlock.className = 'settings-about-meta';
  metaBlock.innerHTML = `
    <div class="settings-about-meta-row">
      <span data-i18n="settings.about_license">${t('settings.about_license')}</span>
      <span>GPL-3.0</span>
    </div>
    <div class="settings-about-meta-row">
      <span data-i18n="settings.about_made">${t('settings.about_made')}</span>
      <span>krwg</span>
    </div>`;
  frag.appendChild(metaBlock);

  let aboutTrustNotice = appendAboutBuildTrustNotice(frag);
  window.blip?.onTrustState?.(() => {
    aboutTrustNotice?.remove();
    aboutTrustNotice = appendAboutBuildTrustNotice(frag);
  });

  const githubBtn = document.createElement('button');
  githubBtn.type = 'button';
  githubBtn.className = 'btn btn-lang';
  githubBtn.dataset.i18n = 'settings.github';
  githubBtn.textContent = t('settings.github');

  const actionsCol = document.createElement('div');
  actionsCol.className = 'settings-about-actions';

  const changelogBtn = document.createElement('button');
  changelogBtn.type = 'button';
  changelogBtn.className = 'btn btn-lang';
  changelogBtn.dataset.i18n = 'settings.changelog';
  changelogBtn.textContent = t('settings.changelog');

  const releasesAboutBtn = document.createElement('button');
  releasesAboutBtn.type = 'button';
  releasesAboutBtn.className = 'btn btn-lang';
  releasesAboutBtn.dataset.i18n = 'settings.updates_releases';
  releasesAboutBtn.textContent = t('settings.updates_releases');

  window.blip
    .getAppMetadata?.()
    .then((meta) => {
      const name = meta?.displayName || 'BLIP';
      aboutLine.textContent = name;
      aboutVersion.textContent = formatAppVersionBracket(meta, { withCodename: true });
      const repoBase = githubRepoBase(meta);
      if (meta?.githubUrl) {
        githubBtn.addEventListener('click', () => window.blip.openExternal?.(meta.githubUrl));
      } else {
        githubBtn.disabled = true;
      }
      changelogBtn.addEventListener('click', () => {
        window.blip.openExternal?.(`${repoBase}/blob/main/CHANGELOG.md`);
      });
      releasesAboutBtn.addEventListener('click', () => {
        window.blip.openExternal?.(`${repoBase}/releases`);
      });
    })
    .catch(() => {});

  const linkRow = document.createElement('div');
  linkRow.className = 'settings-about-links';
  linkRow.appendChild(changelogBtn);
  linkRow.appendChild(releasesAboutBtn);

  actionsCol.appendChild(githubBtn);
  actionsCol.appendChild(linkRow);
  frag.appendChild(actionsCol);
  return frag;
}
