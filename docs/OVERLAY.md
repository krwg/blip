# Overlay & activity presence

Discord-style **always-on-top overlay** and opt-in **foreground app/game** detection for mesh status ([#82](https://github.com/krwg/blip/issues/82)).

## Privacy

- Off by default.
- Detection is **local-only** (no cloud, no telemetry).
- Status text shared on the LAN only when **Share activity in status** is enabled.
- Windows: foreground window title + process name via a short PowerShell probe.
- macOS: frontmost app name via `osascript` (may prompt for Automation / Accessibility later).
- Linux: not wired yet.

## Overlay window

- Frameless, transparent, `alwaysOnTop`, shown when **Overlay** is enabled in Settings → System (or Appearance linkage).
- Displays current activity line, online peer count, unread badge.
- Click-through / hotkey polish can follow in later PRs.

## Config keys

| Key | Default | Meaning |
|-----|---------|---------|
| `overlayEnabled` | `false` | Show overlay window |
| `presenceDetectEnabled` | `false` | Poll foreground app |
| `presenceShareEnabled` | `false` | Write detected activity into `presenceText` for peers |
