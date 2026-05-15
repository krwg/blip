# [FEATURE] Theme, accent colors, and optional animated wallpaper support

## Type
Enhancement · UX · Settings

## Summary
Expose user-selectable themes (minimum: light/dark/high-contrast + accent hue), persisted in app config; allow optional animated or static wallpaper behind the chrome with performance-safe toggles.

## Background
Custom appearance increases engagement and aligns expectations with polished messengers without requiring server-side infrastructure.

## Scope
- Persist theme keys in Electron `userData` config (reuse existing pattern).
- CSS variables driven by preset tokens; avoid per-control inline colors.
- Optional wallpaper layer (`<video>` or CSS animation) gated by perf toggle and reduced-motion OS preference (`prefers-reduced-motion`).
- Respect frameless layout and existing typography (Minecraft font stack).

## Out of scope
- Marketplace / downloadable themes beyond built-in presets.
- Per-peer theming.

## Acceptance criteria
- [ ] User can switch at least three built-in themes; choice survives restart.
- [ ] Accent colour or preset applies consistently across nav, borders, CTAs.
- [ ] Turning off animated wallpaper restores static/default background instantly.
- [ ] No CSP regression in packaged build.

## Technical notes
- Prefer `prefers-reduced-motion: reduce` → disable animations automatically.
- Test both Vite dev and `loadFile` production paths.

## Definition of done
Manual QA checklist passed; settings survive cold start.
