import { describe, expect, it } from 'vitest';
import {
  formatAppVersion,
  formatAppVersionBracket,
  rawAppVersion,
} from '../renderer/app-version.js';

describe('app-version', () => {
  it('strips leading v and brackets', () => {
    expect(rawAppVersion({ version: 'v2.0.0' })).toBe('2.0.0');
    expect(formatAppVersion({ version: '2.0.0' })).toBe('2.0.0');
    expect(formatAppVersionBracket({ version: '2.0.0' })).toBe('[2.0.0]');
    expect(
      formatAppVersionBracket({ version: 'v2.0.0', codename: 'Morse' }, { withCodename: true }),
    ).toBe('[2.0.0] · Morse');
  });

  it('prefers displayVersion', () => {
    expect(formatAppVersionBracket({ version: '2.0.0', displayVersion: '2.0.0-dev' })).toBe(
      '[2.0.0-dev]',
    );
  });

  it('handles missing', () => {
    expect(formatAppVersion(null)).toBe('—');
    expect(formatAppVersionBracket(undefined)).toBe('—');
  });
});
