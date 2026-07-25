/** UI version labels — bracket form without leading `v`, e.g. `[2.0.0]`. */

export function rawAppVersion(meta) {
  const v = meta?.displayVersion || meta?.version;
  if (!v) return null;
  return String(v).replace(/^v/i, '').trim() || null;
}

/** Bare semver/display string, or `—` if missing. */
export function formatAppVersion(meta) {
  return rawAppVersion(meta) || '—';
}

/**
 * Bracketed label for About / Updates: `[2.0.0]` or `[2.0.0] · Morse`.
 * @param {object|null|undefined} meta
 * @param {{ withCodename?: boolean }} [opts]
 */
export function formatAppVersionBracket(meta, opts = {}) {
  const bare = rawAppVersion(meta);
  const label = bare ? `[${bare}]` : '—';
  if (opts.withCodename && meta?.codename) {
    return `${label} · ${meta.codename}`;
  }
  return label;
}

/** Semver / release channel helpers (pure). */

export function parseSemver(v) {
  const m = String(v || '')
    .replace(/^v/i, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareAppVersions(a, b) {
  const strip = (v) => String(v || '').replace(/^v/i, '').trim();
  const pa = strip(a).split('-');
  const pb = strip(b).split('-');
  const na = pa[0].split('.').map((n) => Number(n) || 0);
  const nb = pb[0].split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    if (na[i] > nb[i]) return 1;
    if (na[i] < nb[i]) return -1;
  }
  const preA = pa[1] || '';
  const preB = pb[1] || '';
  if (!preA && preB) return 1;
  if (preA && !preB) return -1;
  if (preA > preB) return 1;
  if (preA < preB) return -1;
  return 0;
}

export function isVersionNewer(a, b) {
  return compareAppVersions(a, b) > 0;
}

export function filterReleasesForChannel(releases, receiveBeta) {
  if (!releases?.length) return [];
  if (receiveBeta) return releases;
  return releases.filter((r) => !r.prerelease);
}

export function githubRepoBase(meta) {
  const raw = meta?.githubUrl || 'https://github.com/krwg/blip';
  return String(raw).replace(/\/$/, '');
}
