# [FEATURE] First-run / About enrichment — changelog deep link & release notes UX

## Type
Enhancement · Product polish

## Summary
Extend existing About surfaces with changelog anchor (same GitHub Releases), SPDX / license succinct line, contributor CTA parity.

## Background
Reduces support duplicates asking “what changed”.

## Scope
- Derived version string already centralized — unify display in splash optional.
- Secondary link `CHANGELOG.md` or tagged compare view.
- Localized tooltip strings verifying external navigation uses hardened `openExternal` path.

## Acceptance criteria
- [ ] Links open externally with single user gesture.
- [ ] Broken network does not crash UI (guard fetch if later inline notes added).
- [ ] Mirrors EN/RU i18n keys.

## Technical notes
If inline release notes fetched later — sign or pin commit hash.

## Definition of done
Copy review with maintainer persona under 120s onboarding path video script optional.
