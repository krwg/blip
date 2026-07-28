# BLIP [2.0.5-beta] — Morse

**Pre-release / beta.** Not marked stable yet — please test on your LAN and report regressions (peers list, chat hub, presence, overlay, calls).

Patch line after **2.0.3 Morse**. Version in app: **2.0.5**.

## Beta focus (please verify)

- **Peers / chat hub flicker** — lists should stay stable when only latency or presence sublines change; no full-list flash on IP churn.
- **Shared presence** — LAN status shows stable text (`In …` / `Playing …`); live elapsed timer stays in **overlay**, not stuck at `0:12` in peer sublines.
- **Console noise** — no endless `[BLIP dial] reuse inbound authenticated socket` spam during normal chat.
- **Screen share docs** — README troubleshooting for elevated / DRM / WSL and error codes **300–321**.
- **Error toasts** — actionable EN/RU hints for common BLIP error codes.
- **Call overlay quality** — RTT / jitter tier on in-call HUD (beta).

## Beta patch addendum (2.0.5 refresh)

- **Call window UX** — tighter controls and compact peer volume slider; less visual noise while preserving BLIP style.
- **Video calls from UI** — direct `VIDEO` action in dial + peer context menu.
- **Screen/window picker** — better source enumeration; now includes unnamed windows with fallback labels.
- **Capture permission diagnostics** — new code **305** for OS-level screen recording denial (EN/RU hints).
- **Echo guard while sharing system audio** — remote playback is suppressed during mixed desktop+mic share to avoid voice feedback loops.
- **Updates while in call** — check/install are blocked during active call with explicit status text.
- **macOS updater install path** — safer `quitAndInstall` path + fallback invocation.
- **Window controls style (Developer)** — switch between **Auto / Windows / macOS** glyph style for titlebar buttons.
- **Tray call indicator** — stronger call-state visibility; macOS tray title marker added.
- **Settings layout** — reduced hidden empty area at bottom of settings page.

## Beta patch addendum (UI/Audio pass)

- **Nest sound set** — new soft warm pack for notifications + call melodies (`NEST`).
- **Call controls UX** — switched to cleaner 2x2 layout with `ПАНЕЛЬ / TOOLS` dropdown for screen share + peer volume.
- **Video entry flow** — removed duplicate `VIDEO` buttons from app navigation; regular call entry now starts with camera path.
- **Settings UX fixes** — call/shortcuts panel scrolling fixed; developer error catalog viewport expanded.
- **Window button style** — runtime apply in main window after style change (no restart needed for most cases).
- **NestUI 1.2 polish** — more liquid glass transparency, richer shadows, tighter typography spacing.

## Included since 2.0.3 (summary)

- Overlay i18n, PTT, click-through, speaking ring, connection quality hints.
- Peer subline / discovery emit reasons; capture error catalog; peer call volume; tray mic badge.
- Presence detect fixes (BLIP vs Explorer on Windows).

## Upgrade

| From | Action |
|------|--------|
| 2.0.x installed (Setup) | Settings → Developer → **Receive beta releases**, then Updates; or install this pre-release manually |
| Portable / macOS / Linux | Download the asset for your OS below (CI uploads after tag build) |
| Dev checkout | `git pull origin main`, `npm run build`, `npx electron .` — do **not** use an old `main` snapshot without 2.0.5 fixes |

## Assets (GitHub Actions — Windows / Linux / macOS)

| OS | Files |
|----|--------|
| Windows | `BLIP-Setup-2.0.5.exe`, Portable, `latest.yml` |
| macOS 12+ | `BLIP-2.0.5-mac-arm64.dmg`, `BLIP-2.0.5-mac-x64.dmg`, zips, `latest-mac.yml` |
| Linux | AppImage + `.deb`, `latest-linux.yml` |

---

**Codename:** Morse · **Channel:** beta pre-release · **Full changelog:** [`CHANGELOG.md`](https://github.com/krwg/blip/blob/main/CHANGELOG.md)
