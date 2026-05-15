# [FEATURE] In-app diagnostics view for LAN connectivity health

## Type
Enhancement · Diagnostics

## Summary
Read-only surfaced panel exposing selected runtime facts (bound UDP/TCP ports, reachable broadcast flag self-test TTL, firewall hints) — NOT an external port scanner replacing OS tools.

## Background
Users misattribute application bugs to Windows Defender rules.

## Scope
- Surface last discovery announce timestamp deltas.
- Show active peer sockets count and last TCP error string if any.
- Link to distilled troubleshooting doc excerpt.

## Acceptance criteria
- [ ] Accessible from Settings → Advanced collapsible requiring explicit expand.
- [ ] Sensitive paths redacted (`userData` shortened).
- [ ] Refresh button clears transient probe cache.

## Technical notes
Run lightweight self-ping optionally on user click only — never automatic aggressive scanning.

## Definition of done
Simulate blocked UDP log line surfaces human actionable string.
