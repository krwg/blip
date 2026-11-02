import { t } from './i18n.js';
import { getSessionStats, sessionOnlineHours } from './session-stats.js';
import { isAchievementUnlocked } from './achievements-store.js';
import { premiumTierEnabled } from './mesh-plus.js';
import { showAppToast } from './toasts.js';

/** Empty square icon field — art comes later. */
export function appendAchievementIcon(parent, def, { unlocked = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `ach-icon-slot ach-icon-slot--empty${unlocked ? '' : ' ach-icon-slot--locked'}`;
  wrap.setAttribute('aria-hidden', 'true');
  wrap.title = unlocked
    ? t('achievements.icon_placeholder')
    : t('achievements.icon_unlock_to_see');
  parent.appendChild(wrap);
  return wrap;
}

export function achievementIconUrl() {
  return '';
}

/**
 * tier: 'core' | 'extra' | 'legendary'
 */
export const ACHIEVEMENT_DEFS = [
  // —— core ——
  {
    id: 'first_peer',
    tier: 'core',
    codeKey: 'achievements.code_first_peer',
    titleKey: 'achievements.first_peer',
    descKey: 'achievements.first_peer_desc',
    check: (s) => (s.peersMaxOnline || 0) >= 1,
  },
  {
    id: 'mesh_5',
    tier: 'core',
    codeKey: 'achievements.code_mesh_5',
    titleKey: 'achievements.mesh_5',
    descKey: 'achievements.mesh_5_desc',
    check: (s) => (s.peersMaxOnline || 0) >= 5,
  },
  {
    id: 'messages_50',
    tier: 'core',
    codeKey: 'achievements.code_messages_50',
    titleKey: 'achievements.messages_50',
    descKey: 'achievements.messages_50_desc',
    check: (s) => (s.messagesSent || 0) >= 50,
  },
  {
    id: 'messages_100',
    tier: 'core',
    codeKey: 'achievements.code_messages_100',
    titleKey: 'achievements.messages_100',
    descKey: 'achievements.messages_100_desc',
    check: (s) => (s.messagesSent || 0) >= 100,
  },
  {
    id: 'first_call',
    tier: 'core',
    codeKey: 'achievements.code_first_call',
    titleKey: 'achievements.first_call',
    descKey: 'achievements.first_call_desc',
    check: (s) => (s.callsStarted || 0) >= 1,
  },
  {
    id: 'first_file',
    tier: 'core',
    codeKey: 'achievements.code_first_file',
    titleKey: 'achievements.first_file',
    descKey: 'achievements.first_file_desc',
    check: (s) => (s.filesSent || 0) >= 1,
  },
  {
    id: 'online_1h',
    tier: 'core',
    codeKey: 'achievements.code_online_1h',
    titleKey: 'achievements.online_1h',
    descKey: 'achievements.online_1h_desc',
    check: () => sessionOnlineHours() >= 1,
  },
  {
    id: 'mesh_plus_active',
    tier: 'core',
    codeKey: 'achievements.code_mesh_plus',
    titleKey: 'achievements.mesh_plus_active',
    descKey: 'achievements.mesh_plus_active_desc',
    checkConfig: (cfg) => premiumTierEnabled(cfg),
  },
  {
    id: 'beta_tester',
    tier: 'core',
    codeKey: 'achievements.code_beta_tester',
    titleKey: 'achievements.beta_tester',
    descKey: 'achievements.beta_tester_desc',
    checkConfig: (cfg) => !!cfg?.receiveBetaUpdates,
  },

  // —— 5 new mid ——
  {
    id: 'messages_250',
    tier: 'extra',
    codeKey: 'achievements.code_messages_250',
    titleKey: 'achievements.messages_250',
    descKey: 'achievements.messages_250_desc',
    check: (s) => (s.messagesSent || 0) >= 250,
  },
  {
    id: 'files_5',
    tier: 'extra',
    codeKey: 'achievements.code_files_5',
    titleKey: 'achievements.files_5',
    descKey: 'achievements.files_5_desc',
    check: (s) => (s.filesSent || 0) >= 5,
  },
  {
    id: 'calls_5',
    tier: 'extra',
    codeKey: 'achievements.code_calls_5',
    titleKey: 'achievements.calls_5',
    descKey: 'achievements.calls_5_desc',
    check: (s) => (s.callsStarted || 0) >= 5,
  },
  {
    id: 'mesh_10',
    tier: 'extra',
    codeKey: 'achievements.code_mesh_10',
    titleKey: 'achievements.mesh_10',
    descKey: 'achievements.mesh_10_desc',
    check: (s) => (s.peersMaxOnline || 0) >= 10,
  },
  {
    id: 'online_4h',
    tier: 'extra',
    codeKey: 'achievements.code_online_4h',
    titleKey: 'achievements.online_4h',
    descKey: 'achievements.online_4h_desc',
    check: () => sessionOnlineHours() >= 4,
  },

  // —— 5 legendary ——
  {
    id: 'messages_5000',
    tier: 'legendary',
    codeKey: 'achievements.code_messages_5000',
    titleKey: 'achievements.messages_5000',
    descKey: 'achievements.messages_5000_desc',
    check: (s) => (s.messagesSent || 0) >= 5000,
  },
  {
    id: 'mesh_32',
    tier: 'legendary',
    codeKey: 'achievements.code_mesh_32',
    titleKey: 'achievements.mesh_32',
    descKey: 'achievements.mesh_32_desc',
    check: (s) => (s.peersMaxOnline || 0) >= 32,
  },
  {
    id: 'files_100',
    tier: 'legendary',
    codeKey: 'achievements.code_files_100',
    titleKey: 'achievements.files_100',
    descKey: 'achievements.files_100_desc',
    check: (s) => (s.filesSent || 0) >= 100,
  },
  {
    id: 'calls_50',
    tier: 'legendary',
    codeKey: 'achievements.code_calls_50',
    titleKey: 'achievements.calls_50',
    descKey: 'achievements.calls_50_desc',
    check: (s) => (s.callsStarted || 0) >= 50,
  },
  {
    id: 'online_100h',
    tier: 'legendary',
    codeKey: 'achievements.code_online_100h',
    titleKey: 'achievements.online_100h',
    descKey: 'achievements.online_100h_desc',
    check: () => sessionOnlineHours() >= 100,
  },
];

function isProgressMet(def, stats, config) {
  if (def.checkConfig) return !!def.checkConfig(config);
  return !!def.check?.(stats);
}

export function getAchievementStates(config) {
  const stats = getSessionStats();
  return ACHIEVEMENT_DEFS.map((def) => {
    const progressMet = isProgressMet(def, stats, config);
    return {
      def,
      progressMet,
      unlocked: isAchievementUnlocked(def.id),
    };
  });
}

function createAchievementCard({ def, unlocked, progressMet }) {
  const card = document.createElement('div');
  const tier = def.tier || 'core';
  card.className = `ach-card ach-card--${tier}${unlocked ? ' ach-card--unlocked' : ''}${
    progressMet && !unlocked ? ' ach-card--ready' : ''
  }`;
  card.dataset.achId = def.id;
  card.dataset.achTier = tier;

  const iconWrap = document.createElement('div');
  iconWrap.className = 'ach-card__icon';
  if (unlocked) {
    appendAchievementIcon(iconWrap, def, { unlocked: true });
  } else {
    const hiddenBtn = document.createElement('button');
    hiddenBtn.type = 'button';
    hiddenBtn.className = 'ach-icon-slot ach-icon-slot--empty ach-icon-slot--locked';
    hiddenBtn.setAttribute('aria-label', t('achievements.icon_unlock_to_see'));
    hiddenBtn.addEventListener('click', () => {
      showAppToast({
        title: t('achievements.icon_unlock_to_see'),
        durationMs: 4000,
      });
    });
    iconWrap.appendChild(hiddenBtn);
  }

  const body = document.createElement('div');
  body.className = 'ach-card__body';
  if (tier === 'legendary') {
    const badge = document.createElement('div');
    badge.className = 'ach-card__tier';
    badge.dataset.i18n = 'achievements.tier_legendary';
    badge.textContent = t('achievements.tier_legendary');
    body.appendChild(badge);
  } else if (tier === 'extra') {
    const badge = document.createElement('div');
    badge.className = 'ach-card__tier ach-card__tier--extra';
    badge.dataset.i18n = 'achievements.tier_extra';
    badge.textContent = t('achievements.tier_extra');
    body.appendChild(badge);
  }
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
  mark.textContent = unlocked ? 'OK' : progressMet ? '…' : '—';

  card.appendChild(iconWrap);
  card.appendChild(body);
  card.appendChild(mark);
  return card;
}

function buildAchievementsSection(titleKey, items, sectionClass) {
  const section = document.createElement('section');
  section.className = `ach-section ${sectionClass}`;

  const head = document.createElement('h3');
  head.className = 'ach-section__title section-subtitle';
  head.dataset.i18n = titleKey;
  head.textContent = t(titleKey);

  const grid = document.createElement('div');
  grid.className = 'ach-grid';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'hint ach-section__empty';
    empty.dataset.i18n =
      sectionClass === 'ach-section--unlocked'
        ? 'achievements.section_unlocked_empty'
        : 'achievements.section_locked_empty';
    empty.textContent = t(empty.dataset.i18n);
    grid.appendChild(empty);
  } else {
    for (const item of items) grid.appendChild(createAchievementCard(item));
  }

  section.appendChild(head);
  section.appendChild(grid);
  return section;
}

export function renderAchievementsGrid(root, config) {
  root.innerHTML = '';
  const states = getAchievementStates(config);
  const unlocked = states.filter((s) => s.unlocked);
  const locked = states.filter((s) => !s.unlocked);

  root.appendChild(
    buildAchievementsSection('achievements.section_unlocked', unlocked, 'ach-section--unlocked'),
  );
  root.appendChild(
    buildAchievementsSection('achievements.section_locked', locked, 'ach-section--locked'),
  );
}
