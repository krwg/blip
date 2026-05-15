# [BUG] Uncaught EADDRINUSE on duplicate TCP/UDP bind (second instance / stale process)

## Type
Bug · Main process startup

## Summary
Second BLIP instance (or another program) binding the same TCP (`0.0.0.0:42070`) / UDP port caused an unhandled `listen` / `bind` error — Electron showed "A JavaScript error occurred in the Main process" instead of exiting cleanly.

## Status
**Fixed** — listen/bind wrapped in Promises; rollback closes partial listeners; user sees `dialog.showErrorBox` with ports and env-var hint, then `app.quit()`.

## Related
Peer list "duplicate self" mitigated by filtering own `blipId` for **any** local IPv4/NIC alias (`getLocalIpv4Set`), not only `getLocalIp()`.

## Acceptance criteria (regression)
- [ ] Second launch with same ports shows dialog, no stack trace modal, process exits.
- [ ] Successful launch still binds TCP then UDP; order rollback on UDP failure.
