import { t } from './i18n.js';
import { formatBlipErrorCode } from '../shared/blip-errors.js';

/** Top shipped codes with short actionable i18n hints (no stacks). */
const HINT_KEYS = Object.freeze({
  100: 'error.hint.100',
  101: 'error.hint.101',
  102: 'error.hint.102',
  103: 'error.hint.103',
  104: 'error.hint.104',
  105: 'error.hint.105',
  111: 'error.hint.111',
  112: 'error.hint.112',
  117: 'error.hint.117',
  200: 'error.hint.200',
  201: 'error.hint.201',
  202: 'error.hint.202',
  203: 'error.hint.203',
  300: 'error.hint.300',
  301: 'error.hint.301',
  302: 'error.hint.302',
  303: 'error.hint.303',
  304: 'error.hint.304',
  320: 'error.hint.320',
  321: 'error.hint.321',
  999: 'error.hint.999',
});

export function resolveBlipErrorCode(errOrCode) {
  if (typeof errOrCode === 'number' && Number.isFinite(errOrCode)) return errOrCode;
  if (typeof errOrCode?.blipCode === 'number') return errOrCode.blipCode;
  if (typeof errOrCode?.errorCode === 'number') return errOrCode.errorCode;
  const raw = errOrCode?.error ?? errOrCode?.message ?? errOrCode;
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits) return Number(digits);
  return 999;
}

export function blipErrorHint(errOrCode) {
  const code = resolveBlipErrorCode(errOrCode);
  const key = HINT_KEYS[code] || HINT_KEYS[999];
  const hint = t(key);
  return hint === key ? t('error.hint.999') : hint;
}

/**
 * Toast title/body for a BLIP error. Title stays short; body = code + hint.
 * @returns {{ code: string, title: string, body: string, hint: string }}
 */
export function formatBlipErrorToast(errOrCode, { titleKey = 'call.signal_lost' } = {}) {
  const code = formatBlipErrorCode(resolveBlipErrorCode(errOrCode));
  const hint = blipErrorHint(errOrCode);
  return {
    code,
    title: t(titleKey),
    hint,
    body: `${t('call.error_code').replace('{code}', code)} · ${hint}`,
  };
}
