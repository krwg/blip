# [INFRA] Tagged release automation (changelog → GitHub Release body)

## Type
Infrastructure · Releases

## Summary
Manual Releases are OK for now — automate copying **CHANGELOG.md** section + attaching `dist-electron` artifacts on annotated tag push via GitHub Action (Windows runner).

## Acceptance criteria
- [ ] `v*` tag workflow publishes draft or full Release.
- [ ] Asset checksums surfaced.
- [ ] Signing keys handled via masked secrets documentation.
