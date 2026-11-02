# SteamLAN

SteamLAN is an optional BLIP network path that reaches peers through Steam
when classic LAN or VPN broadcast is unavailable. Local UDP/TCP discovery
stays the default; SteamLAN is enabled from Settings when Steam is running
and the user is signed in.

## Behavior

| | |
|---|---|
| **Identity** | Steam account already signed into the Steam desktop client |
| **Reachability** | Steam P2P with Valve relay fallback |
| **App namespace** | Steamworks test App ID **480** (Spacewar), shared with other tools — BLIP frames carry a product magic so foreign traffic is ignored |
| **What tunnels** | Existing BLIP discovery and framed TCP (chat, signalling). Media remains WebRTC peer-to-peer once signalling succeeds |
| **What it is not** | A system VPN; it does not expose the whole host network |

## Session modes

- **Friends** — compatible BLIP peers who are Steam friends with the host
- **Invite only** — peers invited to the current Steam session

Hosts can invite through Steam or share a short session address for the
active share generation. Closing the session invalidates the address.

## Architecture

```
BLIP (Electron main)          Steam desktop
  discovery / TCP  ──►  SteamLAN runtime  ──►  P2P / relays
       ▲                                            │
       └──────── mapped peer + framed packets ──────┘
```

The SteamLAN runtime lives in the main process: initialize App ID 480,
lobby/session lifecycle, reliable send/recv, and a transport adapter that
maps Steam identities to BLIP peers while reusing the existing mesh
handshake and message types.

## Requirements

- Steam desktop installed, running, and signed in
- Matching BLIP builds on both peers
- Windows x64 first; other desktops follow once the native binding is stable

## Related

- Ports and framing: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Product overview: root `README.md`
