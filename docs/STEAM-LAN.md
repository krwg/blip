# SteamLAN

SteamLAN is an optional BLIP network path that reaches peers through Steam
when classic LAN or VPN broadcast is unavailable. Local UDP/TCP discovery
stays the default.

## Product UX

- **Settings → Network** exposes a single **On / Off** control (plus a short status line).
- When SteamLAN is on, Steam friends who also run BLIP with SteamLAN enabled
  appear in the existing **Peers** list — no separate Steam session screen for
  everyday use.
- Chat, dial, and call signalling use the same UI as LAN peers.
- Dual-path peers (LAN + SteamLAN) keep one identity; BLIP prefers the LAN
  socket and falls back to Steam when LAN dial fails.
- **Settings → Developer → SteamLAN (advanced)** keeps Friends / Invite host,
  join-by-address, Steam invite overlay, leave, and copy address for testing
  and power users.

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
discovery list so the Peers view needs no special layout. Call signalling
(`call-offer`, answer, candidates, hangup) rides the same framed tunnel;
WebRTC media stays peer-to-peer.

## Packaging

- `steam_appid.txt` ships next to the app and under `extraResources`
- `steamworks.js` native bindings are listed in `asarUnpack`
- Windows x64 is the first supported desktop; other platforms follow once the binding is stable

## Two-machine verification checklist

1. Steam desktop signed in on both machines; BLIP builds match.
2. Enable **Settings → Network → SteamLAN** on both (no shared LAN / VPN required).
3. Confirm each side shows ready status with the Steam persona name.
4. Peer appears once in **Peers** (SteamLAN subline when Steam-only).
5. Exchange a text message.
6. Place a voice call; confirm signalling connects and media flows on WebRTC.
7. (Optional) On a dual-homed LAN, confirm a single peer identity and LAN preference.
8. (Developer) Host Invite-only, copy `b-….steam`, join from the guest; invite overlay works.
9. Quit Steam on one side; BLIP degrades to unavailable without crashing.

## Requirements

- Steam desktop installed, running, and signed in
- Matching BLIP builds on both peers
- Windows x64 first; other desktops follow once the native binding is stable

## Related

- Ports and framing: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Product overview: root `README.md`
- Roadmap: issues #155–#160
