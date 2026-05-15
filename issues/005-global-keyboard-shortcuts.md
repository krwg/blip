# [FEATURE] Configurable global hotkeys for mute/deafen/answer/end

## Type
Enhancement · Productivity · Calls

## Summary
Expose non-conflicting accelerator registration via Electron `globalShortcut` (or localized menu accelerators fallback) allowing quick mute toggle while focused outside BLIP windows.

## Background
Matches competitive UX for voice-heavy applications.

## Scope
- Default sane bindings documented; collisions detected with OS-reserved combos.
- Store user overrides in JSON config; sanitize parse errors.
- Unregister cleanly on blur / quit to release OS grabs.

## Acceptance criteria
- [ ] Toggle mute works when game/app foreground (Windows verified).
- [ ] Failed registration surfaces actionable toast/snackbar once.
- [ ] Disabling shortcuts feature releases all grabs without restart requirement.

## Technical notes
Privileged shortcut APIs differ by OS — document unsupported combos on macOS if deferred.

## Definition of done
Zero leaked registered shortcuts post `app.quit` path.
