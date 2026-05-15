# BLIP — architecture overview

High-level map of how pieces fit together. For build and contribution workflow see [CONTRIBUTING.md](../CONTRIBUTING.md).

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron main process                     │
│  main/index.js  — IPC, tray, BrowserWindows, orchestration       │
│  main/discovery.js  — UDP (+ mDNS) peer presence                  │
│  main/tcp-server.js | tcp-client.js  — line-delimited JSON       │
└─────────────────────────────────────────────────────────────────┘
          ▲ preload.cjs (contextBridge → window.blip)
          │
┌─────────┴─────────────────────────────────────────────────────────┐
│ Renderer (Vite bundles)                                             │
│  renderer/main.js · ui.js · chat.js · call.js …                    │
│  renderer/call-window.html + call-window-main.js (call window)   │
└─────────────────────────────────────────────────────────────────┘

WebRTC signalling (SDP, ICE candidates) travels over the same TCP
connection as chat messages; media is peer-to-peer in the renderer.
```

## Processes & windows

| Piece | Role |
|--------|------|
| **Main** | TCP server/client coordination, discovery, IPC to all renderers. |
| **Main window** | Chat, dial, peers, settings (`dist/index.html` or Vite dev URL). |
| **Call window** | Separate `BrowserWindow` loads `call-window.html` — WebRTC UI isolation. |

## Networking

| Mechanism | Default port | Purpose |
|-----------|---------------|---------|
| UDP broadcast (+ optional multi-port fan-out) | 42069 (config/env) | `announce` payloads: `blipId`, display name, IPs, advertised TCP/UDP. |
| TCP | 42070 (config/env) | Framed `\n`-delimited JSON: chat, pings, WebRTC signalling. |
| mDNS | — | Auxiliary discovery (`_blip._udp.local` TXT records). |

Environment overrides: `BLIP_UDP_PORT`, `BLIP_TCP_PORT`. Separate user data dirs support side-by-side dev instances (`BLIP_USER_DATA_DIR`).

## Persistence

| Data | Location |
|------|-----------|
| User config (`blipId`, name, language, …) | Electron `userData` → `blip-config.json`. |
| Chat history | Renderer `localStorage` key `blip_chat_v1`. |
| Release metadata | `app-metadata.json` (version, codename, repo URL). |

## Security posture (today)

- `contextIsolation: true`, preload exposes a narrow API (`preload.cjs`).
- `openExternal` is restricted to http(s) URLs in main.
- LAN trust model: peers are whoever answers on your network segment.

See [SECURITY.md](../SECURITY.md) for reporting expectations.

## Future seams (tracked as GitHub issues / `issues/*.md`)

- Auto-update channel, richer diagnostics UI, hardened trust UX, CI packaging smoke jobs.
