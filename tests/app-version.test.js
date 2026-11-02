import { describe, expect, it } from 'vitest';
import {
  formatAppVersion,
  formatAppVersionBracket,
  rawAppVersion,
  parseSemver,
  compareAppVersions,
  isVersionNewer,
  filterReleasesForChannel,
  githubRepoBase,
} from '../renderer/app-version.js';

describe('app-version labels', () => {
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

describe('app-version compare', () => {
  it('parses semver', () => {
    expect(parseSemver('v2.0.0')).toEqual([2, 0, 0]);
    expect(parseSemver('1.2.3-beta')).toEqual([1, 2, 3]);
  });

  it('compares versions with prerelease', () => {
    expect(compareAppVersions('2.0.0', '1.9.9')).toBe(1);
    expect(isVersionNewer('2.0.1', '2.0.0')).toBe(true);
    expect(isVersionNewer('2.0.0', '2.0.0-beta')).toBe(true);
  });

  it('filters prereleases unless beta channel', () => {
    const list = [
      { tag: '2.0.0', prerelease: false },
      { tag: '2.0.1-beta', prerelease: true },
    ];
    expect(filterReleasesForChannel(list, false)).toHaveLength(1);
    expect(filterReleasesForChannel(list, true)).toHaveLength(2);
  });

  it('normalizes github repo base', () => {
    expect(githubRepoBase({ githubUrl: 'https://github.com/krwg/blip/' })).toBe(
      'https://github.com/krwg/blip',
    );
  });
});
