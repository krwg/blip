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
   - Status / mesh peer count / unread (stat row)
   - Current game/app + window title + session time
   - Active call: peer, id, voice/video, mesh crypto/legacy, timer
   - Live file-transfer progress when a transfer is running
   - App version + DND hint

Click-through is on (`setIgnoreMouseEvents`) so the HUD does not steal focus.
Window size is **420×420** so the call block is fully visible.

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
