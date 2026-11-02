# BLIP [2.0.2] — Morse

Patch after **2.0.1 Morse**.

## What's new

### Overlay HUD
- In-call card closer to the mockup: peer **avatar**, **mute / end**, mic meter, **mesh + ping**, Legacy pill
- Dropped clutter: no permanent version stamp, no duplicate session timer, unread only when **> 0**
- Skin follows the app: **pixel** (square slate) or **NestUI** (soft radii)
- Click-through while idle; clickable during an active call (**360×380**)

### NestUI 1.1
- Stronger **accent** borders on rounded buttons, toggles, and nav
- Accent focus rings and selected-peer polish

### LAN discovery
- Announce on **each NIC** (directed broadcast + per-interface send)
- Advertise **all local IPs**; dial alternate peer addresses
- Prefer packet **source IP** — helps Wi‑Fi ↔ Ethernet (e.g. MacBook on Wi‑Fi, PC wired)

## Upgrade

| From | Action |
|------|--------|
| 2.0.x Setup (Windows) | Settings → Updates, or wait for auto-update |
| Portable / macOS / Linux | Download matching asset from this release |

## Assets

| OS | File |
|----|------|
| Windows | `BLIP-Setup-2.0.2.exe`, Portable, `latest.yml` |
| macOS 12+ | `BLIP-2.0.2-mac-arm64.dmg`, `BLIP-2.0.2-mac-x64.dmg`, zips, `latest-mac.yml` |
| Linux | AppImage, deb, `latest-linux.yml` |

BLIP · FREE for everyone · MESH+ by key
