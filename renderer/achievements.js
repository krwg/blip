import { t } from './i18n.js';
import { getSessionStats, sessionOnlineHours } from './session-stats.js';
import { isAchievementUnlocked } from './achievements-store.js';

/**
 * @typedef {{ id: string, titleKey: string, descKey: string, iconAsset: string, check: (s: object) => boolean }} AchievementDef
 */

/** Icon paths — fill with your assets (e.g. `achievements/first_peer.png`). */
/** @type {AchievementDef[]} */
export const ACHIEVEMENT_DEFS = [
  {
    id: 'first_peer',
    titleKey: 'achievements.first_peer',
    descKey: 'achievements.first_peer_desc',
    iconAsset: '',
    check: (s) => (s.peersMaxOnline || 0) >= 1,
  },
  {
    id: 'mesh_5',
    titleKey: 'achievements.mesh_5',
    descKey: 'achievements.mesh_5_desc',
    iconAsset: '',
    check: (s) => (s.peersMaxOnline || 0) >= 5,
  },
  {
    id: 'messages_50',
    titleKey: 'achievements.messages_50',
    descKey: 'achievements.messages_50_desc',
    iconAsset: '',
    check: (s) => (s.messagesSent || 0) >= 50,
  },
  {
    id: 'messages_100',
    titleKey: 'achievements.messages_100',
    descKey: 'achievements.messages_100_desc',
    iconAsset: '',
    check: (s) => (s.messagesSent || 0) >= 100,
  },
  {
    id: 'first_call',
    titleKey: 'achievements.first_call',
    descKey: 'achievements.first_call_desc',
    iconAsset: '',
    check: (s) => (s.callsStarted || 0) >= 1,
  },
  {
    id: 'first_file',
    titleKey: 'achievements.first_file',
    descKey: 'achievements.first_file_desc',
    iconAsset: '',
    check: (s) => (s.filesSent || 0) >= 1,
  },
  {
    id: 'online_1h',
    titleKey: 'achievements.online_1h',
    descKey: 'achievements.online_1h_desc',
    iconAsset: '',
    check: () => sessionOnlineHours() >= 1,
  },
];

/**
 * @returns {{ def: AchievementDef, unlocked: boolean, progressMet: boolean }[]}
 */
export function getAchievementStates() {
  const stats = getSessionStats();
  return ACHIEVEMENT_DEFS.map((def) => {
    const progressMet = !!def.check(stats);
    return {
      def,
      progressMet,
      unlocked: isAchievementUnlocked(def.id) || progressMet,
    };
  });
}

/**
 * @param {HTMLElement} root
 */
export function renderAchievementsGrid(root) {
  root.innerHTML = '';
  for (const { def, unlocked, progressMet } of getAchievementStates()) {
    const card = document.createElement('div');
    card.className = `ach-card${unlocked ? ' ach-card--unlocked' : ''}${
      progressMet && !unlocked ? ' ach-card--ready' : ''
    }`;
    card.dataset.achId = def.id;

    const iconWrap = document.createElement('div');
    iconWrap.className = 'ach-card__icon';
    if (def.iconAsset) {
      const img = document.createElement('img');
      img.className = 'ach-card__icon-img';
      img.src = def.iconAsset;
      img.alt = '';
      iconWrap.appendChild(img);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'ach-card__icon-placeholder';
      placeholder.textContent = '◆';
      placeholder.title = t('achievements.icon_placeholder');
      iconWrap.appendChild(placeholder);
    }

    const body = document.createElement('div');
    body.className = 'ach-card__body';
    const title = document.createElement('div');
    title.className = 'ach-card__title';
    title.textContent = t(def.titleKey);
    const desc = document.createElement('div');
    desc.className = 'ach-card__desc';
    desc.textContent = t(def.descKey);
    body.appendChild(title);
    body.appendChild(desc);

    const mark = document.createElement('div');
    mark.className = 'ach-card__mark';
    mark.textContent = unlocked ? '✓' : progressMet ? '…' : '';

    card.appendChild(iconWrap);
    card.appendChild(body);
    card.appendChild(mark);
    root.appendChild(card);
  }
}
