# [MAINT] Keep CONTRIBUTING.md, README, and `.nvmrc` aligned with tooling

## Type
Maintenance · Documentation

## Summary
Whenever `package.json` scripts, Node `engines`, or dev commands change, refresh **CONTRIBUTING.md**, **README** (EN + RU Quick start), and **`.nvmrc`** so first-time contributors never hit version skew.

## Acceptance criteria
- [ ] Single source of truth for Node: `package.json` `engines` + `.nvmrc` + README tables match.
- [ ] New npm script added → CONTRIBUTING documents it or links to `package.json` discovery.
- [ ] PR template checkbox references this policy.

## Notes
Low-effort hygiene; batch with any tooling PR.
