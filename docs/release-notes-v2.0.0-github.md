# BLIP [2.0.0] — Morse

One of the largest updates in the project’s history. Morse is the next line after **Beacon (1.1.1)**: a quieter mesh, clearer signal, and a desktop that feels finished on every platform you actually use.

---

## Part 1 — What’s new

### Hello, Morse

BLIP still does what it always promised: **no accounts, no cloud relay — just peers on your network.**  
Morse makes that promise hold under real conditions — VPN routes, mixed client versions, long calls, and large mesh files — while the interface gets out of the way.

This is not a cosmetic bump. It is a **signal integrity** release: transport, trust, packaging, and the everyday surface of chat, calls, and files.

| | |
|---|---|
| **Codename** | Morse |
| **Version** | `2.0.0` |
| **From** | `1.1.1` Beacon |
| **Focus** | Mesh integrity · multiplatform · polish · maintainability |

---

### The mesh got quieter — and stronger

**Encrypted mesh TCP (modern peers).**  
After handshake, Morse peers speak **X25519 ECDH + AES-256-GCM** on application payloads. Legacy peers stay on a clear, labeled plaintext path — never a silent surprise.

**Signed discovery.**  
Peers that cannot prove their UDP announce (Ed25519) simply do not appear. The contact list is for people who are really there.

**Handshake that respects the past.**  
Talking to **≤1.1.x** no longer means “ping works, chat dies.” Morse uses **handshake v1** for legacy peers, keeps warm sockets alive through call setup, and retries plaintext when the wire says so. Calls and messages are meant to work **the first time**.

**Errors you can act on.**  
The old umbrella *Socket closed* is gone. Numbered codes (**117–129** and friends) tell you *where* the line broke — EOF, crypto, auth gate, wait-for-ack — so Settings, logs, and support stop guessing.

**Mesh Pulse that stays calm.**  
Latency on the contacts list updates smoothly. Transient ping misses no longer flash the whole row back to “pending.” The list no longer rebuilds on every harmless announce heartbeat.

---

### Calls that keep their signal

| Improvement | Why it matters |
|-------------|----------------|
| Reuse authenticated inbound sockets | Dial uses an already-open mesh path when the peer already reached you |
| TOFU rebind on key rotate | Dev rebuilds / key rotation no longer dead-end the call with a hard pubkey mismatch |
| Legacy plaintext path | Morse ↔ 1.1.x calls with explicit unencrypted-mesh consent |
| Mic-linked waveform | Bars follow real input level; mute flattens them |
| Optional STUN/TURN | Off by default; for VPN / Tailscale topologies when pure LAN ICE is not enough |
| Higher LAN media bitrates | Clearer camera and screen share on the same subnet |

---

### BEACON — still the mesh library, now more honest

BEACON remains a **Developer** feature (off by default) — intentional power, not noise in the nav.

What Morse adds on top of Beacon:

- **Swarm awareness** — row badge with peer count and chunk coverage %
- **Integrity** — per-chunk SHA-256 + `infoHash`; verify on download and on assemble
- **Rarest-first multi-peer fetch** — pull missing chunks from several seeders in parallel
- **Publish path fixes** — large ZIP / video / installer ingest from disk in the main process (no more “could not be read” from stuffing files into the renderer)
- **Throughput** — chunk serve from main, single-pass ingest, transfer hub overlays that match what the mesh is actually doing

---

### Chat & presence

- **GitHub-flavored Markdown** in DMs and groups — tables, lists, code, task lists — sanitized (`marked` + DOMPurify)
- **Release notes in-app** — Settings → Updates renders full GitHub release bodies; open a release for a top sheet with tables and images
- **Groups always on** — conferences are no longer buried behind a Developer toggle
- **Developer unlock** — tap the About version line seven times (hide again from the panel)
- **Overlay HUD** — Shift+Alt+O: call timer, clock, game/app session; game-priority status + pin app
- **Soft motion** — short view / panel / nav / modal animation; Settings → Appearance; system Reduce Motion wins
- **NestUI** — optional soft skin via shared Floke design tokens; Nest achievements with square slots and new mid / legendary goals

---

### Every desktop, one mesh

| Platform | What you get |
|----------|----------------|
| **Windows** | NSIS Setup + Portable · assisted installer wizard · `latest.yml` auto-update |
| **macOS 12+** | Styled DMG + zip (Intel & Apple silicon) · `latest-mac.yml` |
| **Linux** | AppImage + deb · `latest-linux.yml` |

Tray and launch-at-login behave correctly on Darwin and Linux. Packaging details: [`docs/PACKAGING.md`](https://github.com/krwg/blip/blob/main/docs/PACKAGING.md).

Windows auto-update for **unsigned** Setup builds is fixed end-to-end (download + install complete). Portable builds still point you at a manual install — by design.

---

### Trust, keys, and quieter chrome

- Removed **official / unofficial** client notices and the “needs official build” MESH+ gate — MESH+ follows the license key, not a theater of build seals
- Trust-anchor material lives under gitignored `keys/`; rotate with the keygen script
- Version strings show as **`[2.0.0]`** — no leading `v`
- Clipboard sync from Off requires an explicit risk confirm
- BEACON stays opt-in under Developer

---

### Under the hood (for operators)

- Large **maintainability** pass: settings panels, call/file/beacon IPC, view-router, peer profile, context menus, update checker, peers / mesh-pulse / chat-hub views extracted from the old monolith
- **Vitest** core suite (announce, TCP framing, i18n parity, signalling helpers, …) — `npm test` in CI
- **TypeScript** starts at `shared/` (`blip-errors`, `blip-id`) with typed preload IPC channel map
- **`shared/local-stats`** — offline append → aggregate → summary pattern for Floke apps
- Obfuscator remains afterPack-only; skippable with `BLIP_SKIP_OBFUSCATE=1`

---

### Upgrade

| From | Action |
|------|--------|
| **1.1.x Setup (Windows)** | Settings → Updates → Check, or wait for startup auto-update *(needs `latest.yml` + Setup in Assets)* |
| **1.1.x Portable** | Download the new Portable or Setup from Assets |
| **1.0.x** | Install Setup once if the in-app updater does not offer 2.0.0 |
| **macOS / Linux** | Install the matching DMG / AppImage / deb from Assets (first Morse multiplatform cut) |

**Compatibility:** Morse talks to **1.1.x** peers on the same LAN for chat and calls (legacy handshake + plaintext path when needed). Older clients ignore BEACON / encrypted-mesh frames they do not understand. See mesh compat docs in the repository.

---

### Install

| OS | Recommended asset |
|----|-------------------|
| Windows | `BLIP-Setup-2.0.0.exe` |
| Windows (portable) | `BLIP-2.0.0-Portable.exe` |
| macOS 12+ | `BLIP-2.0.0-mac-*.dmg` |
| Linux | `BLIP-2.0.0-linux-*.AppImage` or `.deb` |

**Auto-update feeds:** `latest.yml` · `latest-mac.yml` · `latest-linux.yml`

> Builds are currently **not code-signed**.  
> Windows SmartScreen: *More info → Run anyway*.  
> macOS Gatekeeper: right-click → Open on first launch if needed.

---

### Links

- Changelog: https://github.com/krwg/blip/blob/main/CHANGELOG.md
- Full notes (repo): https://github.com/krwg/blip/blob/main/docs/release-notes-v2.0.0-github.md
- Compare: https://github.com/krwg/blip/compare/1.1.1...2.0.0
- Issues: https://github.com/krwg/blip/issues
- Site: https://krwg.github.io/blip/

---

BLIP · FREE for everyone · MESH+ by key  

No accounts.  
No cloud relay.  
Just peers on your LAN.

---

## Part 2 — GitHub history (`1.1.1` → `2.0.0`)

Detailed engineering changelog for maintainers and curious peers. Counts are approximate from `1.1.1..2.0.0` on `main`.

| Metric | Value |
|--------|------:|
| Merged pull requests | ~35 |
| Non-merge commits | ~42 |
| Total commits (incl. merges) | ~77 |

### Themes → PRs

| Theme | Highlights | PRs (examples) |
|-------|------------|----------------|
| **Morse line** | Open 2.0.0, docs/version badges | #44, #56 |
| **Security / transport** | Announce reject, clipboard confirm, mesh TCP encrypt, STUN/TURN | #48, #38, #62, #39 |
| **Legacy mesh / calls** | Compat consent, Socket closed → TOFU/reuse, error codes 117–129, handshake v1, pulse/socket reuse | #92–#102 |
| **BEACON swarm** | Design doc, rarest-first, badge + `infoHash`, crypto isolate for Vite | #60/#68 line, #92, #99 |
| **UX / product** | NestUI, Developer unlock, groups always on, waveform, motion, Markdown, overlay | #69–#87 |
| **Multiplatform** | Linux AppImage/deb, macOS 12+ DMG/zip, tray/login | #81 / #83 |
| **Packaging / updates** | NSIS wizard, unsigned updater fix, release Markdown sheet | #46, updater fixes, #54 |
| **Maintainability** | ui/IPC splits, Vitest, TypeScript start, local-stats | #58/#59/#60, #41, #40, #67, #103 |
| **Hygiene** | Strip source comments, README/docs, Giphy/obfuscator docs | #50, #37, #88 |

### Pull requests merged

| PR | Title |
|----|-------|
| #42 | docs: README hygiene |
| #44 | chore: open 2.0.0 Morse line |
| #45 | test: Vitest core suite |
| #47 | packaging: NSIS assisted wizard |
| #48 | security: announce + clipboard confirm |
| #49 | feat: optional STUN/TURN |
| #51 | chore: strip remaining source comments |
| #53 | fix: open-external https URL regex |
| #55 | feat: GitHub release Markdown sheet |
| #57 | docs: Morse version badges |
| #70 | feat: NestUI soft skin |
| #73 | feat: Developer unlock; groups always on |
| #75 | fix: call waveform + `[x.y.z]` versions |
| #76 | feat: mesh TCP encryption after handshake |
| #78 | chore: drop official/unofficial build UX; keys/ |
| #80 | feat: BEACON default off; Nest achievements; MESH+ mint |
| #83 | feat: Linux + macOS 12+ packaging |
| #85 / #87 | feat: UI motion, Markdown, overlay HUD |
| #88 | docs + IPC/UI splits |
| #89–#91 | settings/IPC/signalling continue |
| #92 | cross-version calls + rarest-first BEACON |
| #93 | call Socket closed — TOFU + inbound reuse |
| #94 | view-router extract (#58) |
| #95 | Morse→1.1.x plaintext + numbered errors |
| #96 | group-call signalling (#59) |
| #97 | peer profile view (#58) |
| #98 | context-menus + update-checker (#58) |
| #99 | BEACON swarm badge + infoHash (#68) |
| #100 | Socket closed codes 117–129; plaintext retry |
| #101 | handshake v1 for ≤1.1.x; faster mesh pulse |
| #102 | keep mesh sockets alive; calm peer pulse |
| #103 | close Morse backlog (#58 #67 #40) |

### Non-merge commits (newest first)

| Commit | Summary |
|--------|---------|
| `3aa4fbe` | chore: close remaining Morse backlog (#58 #67 #40) |
| `43bc8e0` | fix: keep mesh sockets alive and stop jerky peer pulse |
| `a00b384` | fix: Morse↔1.1.x via handshake v1; faster mesh pulse |
| `ce54b95` | fix: split Socket closed into 117–129; always retry plaintext on close |
| `43577b0` | fix: context-menus block handler brace mismatch |
| `ed6d2f4` | docs: note beacon-swarm-crypto in BEACON-SWARM (#68) |
| `6165b7b` | Fix Vite build: isolate BEACON swarm Node crypto (#68) |
| `2d8eef9` | Extract context menus and update checker from ui.js (#58) |
| `88358c6` | BEACON swarm badge and infoHash integrity (#68) |
| `b1612aa` | Extract peer profile view helpers from ui.js (#58) |
| `b4c614d` | refactor: extract group-call signalling (#59) |
| `9060ee8` | fix: Morse→1.1.x calls via plaintext skip; numbered error codes |
| `26340ea` | refactor: extract main nav and unread badges to view-router |
| `4b449e6` | fix: call Socket closed via TOFU rebind and inbound reuse |
| `6acf140` | feat: cross-version mesh calls with consent; rarest-first BEACON fetch |
| `40a326c` | refactor: finish settings/IPC splits, Linux presence, voice signalling |
| `113e8b4` | refactor: more settings/IPC splits + call signalling helpers |
| `1ddd416` | refactor: split beacon/file IPC and settings panels; BEACON swarm design |
| `fdacfdf` | chore: document Giphy/obfuscator; extract call IPC + version helpers |
| `12c81af` | feat: soft motion, full chat Markdown, rich overlay HUD |
| `5e0183e` | feat: Apple-style UI motion + overlay/presence slice |
| `7cfb2fc` | feat: Linux + macOS 12+ packaging; Nest soft achievements; overlay issue |
| `749e89d` | feat: hide BEACON by default; Nest square achievements; mint MESH+ keys |
| `9a9f54c` | chore: drop official/unofficial build UX; rotate keys to keys/ |
| `0c57761` | feat: encrypt mesh TCP after handshake (AES-GCM + ECDH) |
| `2086991` | fix: sync call waveform to mic; show versions as `[x.y.z]` |
| `4761164` | feat: unlock Developer via About taps; groups always on |
| `8b4f2d7` | fix: Nest hint, full release sheet, chat Markdown |
| `d629a9a` | style: make NestUI feel more Apple-like |
| `a34014d` | fix: correct floke-kit CSS import path for Vite |
| `e3fb5ca` | feat: NestUI 1.0 soft skin via floke-kit tokens |
| `646aff0` | docs: align Morse version badges and architecture headings |
| `de2045c` | feat: render GitHub release Markdown with top notes sheet |
| `d4c56ac` | fix: restore open-external https URL regex |
| `110ab48` | chore: strip remaining source comments |
| `70026a9` | feat: optional STUN/TURN ICE servers for WebRTC |
| `ae1d4ba` | security: reject unsigned announces and confirm clipboard enable |
| `ed05fba` | packaging: expand NSIS assisted wizard steps |
| `bcce53e` | test: add Vitest suite for announce, TCP framing, i18n |
| `e91d78c` | chore: open 2.0.0 Morse development line |
| `d67a58d` | docs: fix README URLs, version drift, and Troubleshooting |
| `d4787d9` | fix(docs): restore Pages deploy workflow and blip URLs |

### Files to attach (CI)

| Asset | Role |
|-------|------|
| `latest.yml` | Windows in-app auto-update |
| `BLIP-Setup-2.0.0.exe` | Windows installer (required with `latest.yml`) |
| `BLIP-2.0.0-Portable.exe` | Windows portable |
| `latest-mac.yml` | macOS auto-update feed |
| `BLIP-2.0.0-mac-*.dmg` / `*.zip` | macOS 12+ |
| `latest-linux.yml` | Linux auto-update feed |
| `BLIP-2.0.0-linux-*.AppImage` / `.deb` | Linux |

---

*End of release notes — BLIP 2.0.0 Morse*
