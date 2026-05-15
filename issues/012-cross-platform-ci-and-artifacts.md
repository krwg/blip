# [INFRA] CI matrix for Windows / macOS / Linux builds with reproducible artifacts

## Type
Infrastructure · CI/CD

## Summary
Add GitHub Actions workflow producing versioned artifacts per push tag; cache dependencies; surface artifacts for smoke QA.

## Background
Single-developer projects still benefit from regression signal and contributor friction reduction.

## Scope
- Windows job required; macOS + Linux best-effort staged.
- Cache `npm ci` layers.
- Optional `electron-builder` secrets for notarization placeholders.

## Acceptance criteria
- [ ] Tag `v*` triggers full release build path.
- [ ] PRs run lint + unit placeholder (even noop) under time budget.
- [ ] Build logs retain `dist-electron` artifact upload ≤ retention policy.

## Technical notes
macOS notarization secrets must never log.

## Definition of done
Green workflow on default branch with documented required secrets table in internal CONTRIBUTING (future).
