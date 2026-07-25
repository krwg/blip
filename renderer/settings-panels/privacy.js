import { t } from '../i18n.js';
import {
  buildPanelTitleRow,
  createSettingsListPanel,
} from '../settings-ui.js';
import { formatPeerDisplayName } from '../peer-labels.js';
import { showAppToast } from '../toasts.js';
import { getBlockedPeerIds, unblockPeer } from '../peer-trust.js';

/**
 * @param {{
 *   getState: () => { peers: array, view: string, config: object },
 *   renderPeersIfOpen: () => void,
 * }} deps
 */
export function buildSettingsPrivacyPanel({ getState, renderPeersIfOpen }) {
  const state = getState();
  const frag = document.createElement('div');
  frag.className = 'settings-panel settings-panel--privacy';
  frag.appendChild(buildPanelTitleRow('settings.section_privacy', 'settings.privacy_hint'));

  const list = createSettingsListPanel('settings-blocked-list settings-list-panel--stretch-x');

  function renderList() {
    list.innerHTML = '';
    const blocked = getBlockedPeerIds();
    list.classList.toggle('settings-list-panel--empty', blocked.length === 0);
    if (blocked.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.dataset.i18n = 'settings.privacy_empty';
      empty.textContent = t('settings.privacy_empty');
      list.appendChild(empty);
      return;
    }
    for (const id of blocked) {
      const row = document.createElement('div');
      row.className = 'settings-blocked-row settings-list-panel__row';

      const peer = state.peers.find((p) => p.blipId === id);
      const meta = document.createElement('div');
      meta.className = 'settings-blocked-meta';

      const name = document.createElement('span');
      name.className = 'settings-blocked-name';
      name.textContent = formatPeerDisplayName(peer, id);

      const idLine = document.createElement('span');
      idLine.className = 'settings-blocked-id';
      idLine.textContent = `BLIP #${id}`;

      meta.appendChild(name);
      meta.appendChild(idLine);

      const unblockBtn = document.createElement('button');
      unblockBtn.type = 'button';
      unblockBtn.className = 'btn btn-lang';
      unblockBtn.dataset.i18n = 'settings.privacy_unblock';
      unblockBtn.textContent = t('settings.privacy_unblock');
      unblockBtn.addEventListener('click', () => {
        unblockPeer(id);
        showAppToast({
          title: t('peers.unblock_done'),
          body: `BLIP #${id}`,
          durationMs: 3500,
        });
        renderList();
        if (getState().view === 'peers') renderPeersIfOpen?.();
      });

      row.appendChild(meta);
      row.appendChild(unblockBtn);
      list.appendChild(row);
    }
  }

  renderList();
  frag.appendChild(list);
  return frag;
}
