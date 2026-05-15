# [INFRA] Extend CI with Windows smoke (packaged `dir` or minimal Electron launch)

## Type
Infrastructure · CI

## Summary
Current **CI** (`ubuntu-latest`) validates `npm ci` + `npm run build` (Vite). Add an optional **Windows** job that installs deps and runs **`electron-builder --dir`** or equivalent to catch Windows-only packaging regressions before tagging.

## Acceptance criteria
- [ ] New workflow job `windows` (or matrix) on PR + main.
- [ ] Caches npm; runtime &lt; ~15 min on cold start where possible.
- [ ] Document secrets requirement if code signing introduced later.

## Out of scope (for first iteration)
Fully headless codec / WebRTC E2E.
