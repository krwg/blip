# [FEATURE] Optional screen / window capture track in WebRTC sessions

## Type
Feature · Calls · High complexity

## Summary
Add opt-in screen share alongside existing audio path using `getDisplayMedia` with explicit UX surface and hang-up semantics independent of microphone.

## Background
LAN classroom / coworking demos parity with mainstream messengers albeit bandwidth heavier.

## Scope
- Negotiation path adds video m-line gated by mutual consent handshake (offer flag already partially present — extend thoughtfully).
- UI affordance distinguish share vs webcam future placeholder.
- Windows capture constraints documented; DPI scaling caveats surfaced as known issues readme section.

## Acceptance criteria
- [ ] Recipient sees shared track in call window scalable surface.
- [ ] Stopping share removes sender track without nuking mic session.
- [ ] CPU guard (lower max frame rate presets).

## Technical notes
Plan for Electron `desktopCapturer` fallbacks vs pure web path.

## Definition of done
Stress test simultaneous audio + moderate motion screen on same machine two-instance setup.
