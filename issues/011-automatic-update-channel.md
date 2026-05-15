# [INFRA] Auto-update discovery via electron-updater targeting GitHub Releases

## Type
Infrastructure · Releases

## Summary
Wire `electron-updater` (or equivalent) with publish pipeline producing signed artifacts; user toggle for beta channel optional.

## Background
Manual GitHub zip friction drops retention.

## Scope
- NSIS + portable update matrix tested.
- Code signing certificate strategy documented (self-funded vs none).
- Silent download + prompt install pattern.

## Acceptance criteria
- [ ] Newer semver from `latest.yml` triggers prompt.
- [ ] Failure states (no network) non-blocking.
- [ ] SHA512 verification honored.

## Technical notes
Portable updates differ — document skip or custom flow.

## Definition of done
Dry-run against private test release bucket or staging tag.
