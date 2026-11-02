# Overlay & activity presence

Discord-style **always-on-top overlay** and opt-in **foreground app/game** detection for mesh status ([#82](https://github.com/krwg/blip/issues/82), [#86](https://github.com/krwg/blip/issues/86)).

## Privacy

- Off by default.
- Detection is **local-only** (no cloud, no telemetry).
- Status text shared on the LAN only when **Share activity in status** is enabled.
- Windows: foreground window title + process name via PowerShell.
- macOS: frontmost app name via `osascript`.
- Linux: best-effort via `xdotool` (X11) or GNOME `gdbus`; Wayland without helpers stays empty.

## Overlay window

1. Enable **Enable desktop overlay** in Settings → System.
2. Toggle visibility with **Shift+Alt+O** (not shown continuously).
3. HUD shows:
   - Self name + BLIP ID
   - Clock + date
   - Status / mesh peer count (unread only when > 0)
   - Current game/app + window title (no duplicate session timer in chips)
   - Active call card: peer avatar, voice/video + timer, mute/end actions, mesh + ping, mic meter, Legacy pill
   - Live file-transfer progress when a transfer is running
   - Footer: foreground app (+ elapsed) or DND — no permanent app version stamp

Skin follows the main window: **pixel** (slate, square) or **NestUI** (soft radii).

Click-through is on while idle; during an active call the panel accepts clicks for mute/end.
Window size is **360×380**.

## Status (mesh presence)

| Option | Default | Meaning |
|--------|---------|---------|
| Prefer games | on | If a game is detected → `Playing …` in status |
| Pin app | empty | Force that process as the status focus + session timer |
| Share activity | off | Write the line into `presenceText` for peers |

## Config keys

| Key | Default | Meaning |
|-----|---------|---------|
| `overlayEnabled` | `false` | Feature armed (hotkey works) |
| `presenceDetectEnabled` | `false` | Poll foreground app |
| `presenceShareEnabled` | `false` | Write into mesh status |
| `presencePreferGames` | `true` | Game priority |
| `presencePinnedApp` | `''` | Optional process name |
