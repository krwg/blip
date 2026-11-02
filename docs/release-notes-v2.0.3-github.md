# BLIP [2.0.3] — Morse

Patch after **2.0.2 Morse**.

## What's new

### Overlay
- Localized HUD (RU/EN)
- Pixel skin: square chips again (App / in call / Legacy)
- Lighter presence loop when the overlay is hidden

### Calls
- Stream view keeps mute / sound / end reachable
- Exit stream → mini PiP (audio continues) → click to re-enter
- NestUI: fullscreen & exit-stream buttons matched
- Missed calls appear in DMs as a red phone line

### LAN / mesh
- Faster dial: race all peer IPs in parallel
- Stronger discovery: burst announce, unicast to known peers, multi-NIC send without hammering every tick
- Less peers/chats UI flicker from IP route updates

### macOS
- Overlay hotkey: **Control+Shift+O** (plus Shift+Alt+O where it works)
- Mic/camera permission prompt on launch
- Auto-update feed ships **zip last** (fixes “ZIP file not provided”)

## Upgrade

| From | Action |
|------|--------|
| 2.0.x Setup (Windows) | Settings → Updates, or wait for auto-update |
| Portable / macOS / Linux | Download matching asset from this release |

## Assets

| OS | File |
|----|------|
| Windows | `BLIP-Setup-2.0.3.exe`, Portable, `latest.yml` |
| macOS 12+ | `BLIP-2.0.3-mac-arm64.dmg`, `BLIP-2.0.3-mac-x64.dmg`, zips, `latest-mac.yml` |
| Linux | AppImage, deb, `latest-linux.yml` |

BLIP · FREE for everyone · MESH+ by key
