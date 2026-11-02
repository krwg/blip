# Roadmap — 2.0.0 Morse

Development line for **BLIP 2.0.0** (codename **Morse**).  
**GitHub Release 2.0.0** shipped 2026-07-26 — see [`release-notes-v2.0.0-github.md`](release-notes-v2.0.0-github.md).

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
- [#81](https://github.com/krwg/blip/issues/81) — multiplatform builds (Linux + macOS 12+) ✅
- [#82](https://github.com/krwg/blip/issues/82) — Discord-style overlay + app/game presence ✅
- [#84](https://github.com/krwg/blip/issues/84) — UI motion ✅
- [#61](https://github.com/krwg/blip/issues/61) — obfuscator cost ✅ ([`OBFUSCATOR.md`](OBFUSCATOR.md))
- [#63](https://github.com/krwg/blip/issues/63) — Giphy key model ✅ ([`GIPHY.md`](GIPHY.md))
- [#58](https://github.com/krwg/blip/issues/58) / [#60](https://github.com/krwg/blip/issues/60) — split ui.js / main IPC ✅
- [#39](https://github.com/krwg/blip/issues/39) — optional STUN/TURN ✅
- [#40](https://github.com/krwg/blip/issues/40) — TypeScript migration (`shared/` + IPC) ✅ (started)
- [#67](https://github.com/krwg/blip/issues/67) — local-stats pattern package ✅
- [#68](https://github.com/krwg/blip/issues/68) — BEACON multi-peer swarm ✅

Earlier Beacon scope: [`ROADMAP-1.1-BEACON.md`](ROADMAP-1.1-BEACON.md).

## Out of scope until later

- Mobile client
- Deeper TypeScript migration beyond `shared/` + preload channel map
- Authenticode / Apple notarization for quieter OS trust dialogs
