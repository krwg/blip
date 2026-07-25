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
