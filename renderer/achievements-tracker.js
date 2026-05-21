import { ACHIEVEMENT_DEFS } from './achievements.js';
import { getSessionStats } from './session-stats.js';
import { isAchievementUnlocked, unlockAchievement } from './achievements-store.js';
import { t } from './i18n.js';
import { showAppToast } from './toasts.js';

/**
 * @param {object} [config]
 * @returns {import('./achievements.js').AchievementDef[]}
 */
export function syncAchievements(config) {
  if (!config?.achievementsEnabled) return [];
  const stats = getSessionStats();
  const newly = [];
  for (const def of ACHIEVEMENT_DEFS) {
    if (!def.check(stats)) continue;
    if (isAchievementUnlocked(def.id)) continue;
    if (unlockAchievement(def.id)) newly.push(def);
  }
  if (newly.length && config.achievementsNotify !== false) {
    for (const def of newly) {
      showAppToast({
        title: t('achievements.unlocked_title'),
        body: t(def.titleKey),
        variant: 'accent',
        durationMs: 5500,
      });
    }
  }
  return newly;
}
