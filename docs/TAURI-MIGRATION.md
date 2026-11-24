# BLIP 3.0.0 Rust — migration map

Milestone: [3.0.0 Rust](https://github.com/krwg/blip/milestone/4)  
Stack: **Tauri 2 + Rust + Vite/React/TypeScript** (Electron removed at cutover).  
Wire-compat with Electron BLIP: **no**.

## Keep / cut matrix

| Area | 3.0.0 Rust | Notes |
|------|------------|-------|
| UDP + mDNS discovery | Keep | Ports default UDP `42069`, TCP `42070` |
| Peer list / BLIP ID 1–64 | Keep | Soft product limit |
| Mesh identity / trust / block | Keep | No MESH+ license |
| 1:1 chat | Keep | Text, receipts, reactions, typing, images, search, export |
| 1:1 calls + screen share | Keep | WebRTC in webview; SDP/ICE over TCP |
| Chunked file transfer 1:1 | Keep | Disk-backed receive |
| Settings panels | Keep | Strip cut-feature toggles |
| Tray / shortcuts / notify / autostart / single-instance / updater | Keep | Tauri plugins |
| Ex-MESH+ appearance content | Keep (free) | `ember`/`rift`, `wire`/`static`, `beacon`/`chime`, theme editor, profile GIF, themed export, icon variants |
| BEACON / Маяк | **Cut** | All `beacon-*`, seed UDP, `.blip` seeds |
| Signal Corps / Projects | **Cut** | `projects-*`, `mesh-proj-*` |
| Groups (all) | **Cut** | Chat, community, voice channels, group-call |
| MESH+ subscription | **Cut** | License, gates UI, badge, activate |
| Overlay | **Cut** | Overlay window + IPC |
| SteamLAN | **Cut** | Deferred beyond 3.0.0 |

## Settings inventory (3.0.0)

Profile · Privacy · Appearance · Network · Shortcuts · Call · Transfer · Sound · Notifications · Language · System · About · Developer  
**Removed from settings:** MESH+, Beacon, Projects toggles, SteamLAN, Overlay controls.

## TCP message allowlist (3.0.0)

Allowed `type` values:

- `mesh-handshake`, `mesh-handshake-ack`
- `message`, `receipt`, `reaction`, `typing`
- `ping`, `pong`
- `call-offer`, `call-answer`, `call-candidate`, `call-reject`, `call-hangup`, `call-state`, `call-renegotiate`, `call-renegotiate-answer`
- `file-offer`, `file-chunk`, `file-done`, `file-abort`
- `clipboard-push` (optional LAN clipboard)
- `avatar-offer` / profile GIF sync (if implemented)

**Forbidden (cut):** `seed-*`, `group-*`, `group-call-*`, `voice-ch-*`, `mesh-proj-*`, SteamLAN tunnel types.

Framing: `\n`-delimited JSON (same product shape; crypto may be simplified vs Electron proto 2).

## Layout after scaffold

| Path | Role |
|------|------|
| `ui/` | Vite + React + TS frontend |
| `ui/src-tauri/` | Tauri 2 Rust backend |
| `docs/TAURI-MIGRATION.md` | This map |
| `main/`, `preload.cjs`, `electron-builder.yml`, Electron scripts | **Deleted at P12 cutover** |

## Electron paths that die at cutover

- `main/` (entire Electron main process)
- `preload.cjs`, `shared/preload-api.d.ts` (Electron bridge)
- `renderer/` (legacy vanilla UI — replaced by `ui/src`)
- `electron-builder.yml`, `scripts/run-electron-builder.mjs`, `scripts/electron-dev*.mjs`, `scripts/after-pack.cjs`, `scripts/obfuscate-after-pack.cjs`, `scripts/publish-mac.mjs`
- Root Electron `package.json` scripts/deps (`electron`, `electron-builder`, `electron-updater`, `steamworks.js`, …) — replaced by `ui/package.json` + Cargo
- Vite multi-page Electron entries (`call-window.html`, `group-call-window.html` under old root)

## Architecture (target)

```
React (main + call windows)
    │  invoke / listen
Rust commands + AppState
    ├── discovery (UDP/mDNS)
    ├── tcp mesh (framing, handshake, chat/call/file)
    ├── config / trust
    ├── files / avatar / gif
    └── tray / shortcuts / notify / updater
```

WebRTC media stays in the webview; signalling rides Rust TCP.

## Commit policy

- Author: `krwg` only
- Never add `Co-authored-by: Cursor <cursoragent@cursor.com>`
- Work branch: `tauri/3.0.0-rust` → PR into `main`
