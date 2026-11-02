# SteamLAN

SteamLAN is an optional BLIP network path that reaches peers through Steam
when classic LAN or VPN broadcast is unavailable. Local UDP/TCP discovery
stays the default.

## Product UX

- **Settings → Network** exposes a single **On / Off** control (plus a short status line).
- When SteamLAN is on, Steam friends who also run BLIP with SteamLAN enabled
  appear in the existing **Peers** list — no separate Steam session screen,
  address field, or invite chrome.
- Chat and dial use the same UI as LAN peers.

## Behavior

| | |
|---|---|
| **Identity** | Steam account already signed into the Steam desktop client |
| **Reachability** | Steam P2P with Valve relay fallback |
| **App namespace** | Steamworks test App ID **480** (Spacewar), shared with other tools — BLIP frames carry a product magic so foreign traffic is ignored |
| **What tunnels** | Existing BLIP discovery and framed TCP (chat, signalling). Media remains WebRTC peer-to-peer once signalling succeeds |
| **What it is not** | A system VPN; it does not expose the whole host network |

## Architecture

```
BLIP (Electron main)          Steam desktop
  discovery / TCP  ──►  SteamLAN runtime  ──►  P2P / relays
       ▲                                            │
       └──────── mapped peer + framed packets ──────┘
```

With SteamLAN enabled, the main process keeps a friends-visible mesh presence,
exchanges BLIP hellos over Steam, and upserts those peers into the normal
discovery list so the Peers view needs no special layout.

## Requirements

- Steam desktop installed, running, and signed in
- Matching BLIP builds on both peers
- Windows x64 first; other desktops follow once the native binding is stable

## Related

- Ports and framing: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Product overview: root `README.md`
