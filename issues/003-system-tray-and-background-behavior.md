# [FEATURE] Tray icon integration and close-to-tray semantics

## Type
Enhancement · Platform integration

## Summary
Elevate tray support from placeholder to parity expectations: contextual menu (Show / Quit), optional “minimize to tray on close”, and single-click restore / double-click semantics per platform guideline.

## Background
Power users keep LAN-first messengers docked indefinitely; quitting from X should be predictable.

## Scope
- Windows-first implementation; defer macOS `TemplateImage` tweaks behind feature flag doc.
- Settings toggle: Close button hides window vs terminates app (`exit` semantics explicit).
- Guard against orphaned processes on Quit from tray vs main window menu.

## Acceptance criteria
- [ ] Tray shows icon with tooltip branding.
- [ ] Context menu restores hidden main window reliably.
- [ ] Tray Quit terminates discovery + TCP + WebRTC cleanly.
- [ ] User-facing copy explains close vs minimize behavior.

## Technical notes
- Reuse electron `Tray` singleton; detach from destroyed `BrowserWindow`.
- Telemetry off by default unless later issue adds opt-in diagnostics.

## Definition of done
No zombie listeners after tray-driven quit (spot-check Activity Monitor / Process Explorer absent).
