# Roadmap — 2.0.0 Morse

Development line for **BLIP 2.0.0** (codename **Morse**).  
GitHub Release / installers are **not** cut until explicitly requested — version bumps land on `main` first.

## Themes

| Area | Intent |
|------|--------|
| **Signal integrity** | Harden discovery and transport (signed/encrypted UDP announce, clearer trust UX). |
| **Operator confidence** | Core unit tests, i18n parity checks, safer clipboard sync confirm. |
| **Reach** | Optional STUN/TURN for VPN/Tailscale topologies; keep pure-LAN default. Multiplatform installers (Linux + macOS 12+). |
| **Maintainability** | TypeScript from `shared/` + typed IPC outward. |

## Tracked issues (living list)

- [#41](https://github.com/krwg/blip/issues/41) — core unit tests (UDP / TCP / i18n) ✅
- [#38](https://github.com/krwg/blip/issues/38) — UDP announce reject + clipboard enable warning ✅
- [#46](https://github.com/krwg/blip/issues/46) — NSIS assisted wizard ✅
- [#81](https://github.com/krwg/blip/issues/81) — multiplatform builds (Linux + macOS 12+)
- [#82](https://github.com/krwg/blip/issues/82) — Discord-style overlay + app/game presence
- [#84](https://github.com/krwg/blip/issues/84) — Apple-style UI motion
- [#39](https://github.com/krwg/blip/issues/39) — optional STUN/TURN
- [#40](https://github.com/krwg/blip/issues/40) — TypeScript migration (`shared/` + IPC)

Earlier Beacon scope: [`ROADMAP-1.1-BEACON.md`](ROADMAP-1.1-BEACON.md).

## Out of scope until later

- Mobile client
- Shipping a public `2.0.0` GitHub Release (wait for explicit go)
