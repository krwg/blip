# [FEATURE] Per-channel volumes, visual speaker activity indicators, scalable UI text

## Type
Enhancement · Accessibility · Calls

## Summary
Separate master UI volume from call/session volume sliders; visualize remote speaking state if signaling allows; expose optional UI scale/font-size presets.

## Background
Lan parties and open-mic setups need fine volume control without drowning notifications.

## Scope
- Settings section for audio sliders persisting floats in config.
- Call UI metering (local VU simplistic OK; remote only if SDP stats available).
- `font-size`/scale presets using root `rem`.

## Acceptance criteria
- [ ] Persisted volumes apply after reconnect / new call windows.
- [ ] Local mute/deafen state remains obvious with iconography + textual label where space allows.
- [ ] Reduced-motion disables decorative meters if they animate heavily.

## Technical notes
Use `AnalyserNode` sparingly due to CPU; throttle paint.

## Definition of done
Smoke test mute/deaf across pop-out window + simultaneous chat receive.
