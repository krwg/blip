# [FEATURE] Input/output device pickers plus lightweight call health indicators

## Type
Enhancement · Calls · QoS UX

## Summary
Enumerate `navigator.mediaDevices.enumerateDevices()` respecting permission states; expose select inputs in call UI persist last choice; derive simple latency/bitrate gauges from RTCPeerConnection stats where available.

## Background
LAN still suffers from mismatched headsets and OS default churn.

## Scope
Hot-swap constrained to before / after negotiated session with safe renegotiation path OR explicit “Reconnect media” destructive action documented.
Expose packet loss thresholds color-coded subtly (non-alarming palette).

## Acceptance criteria
- [ ] User can bind mic + speaker distinct from OS default.
- [ ] Selection persists restart.
- [ ] Stats panel collapsible advanced section or compact chips.

## Technical notes
Enumerate again on `devicechange` event listeners.

## Definition of done
Manual cross-check unplug/replug USB headset mid idle call state.
