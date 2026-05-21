# BLIP · MESH+

MESH+ is a **license tier** (`BLIP-XXXX-…` full key, Ed25519 verify in main). FREE users keep the full baseline chat, calls, and LAN mesh.

## Shipped (high level)

| Area | MESH+ |
|------|--------|
| Premium animated backgrounds & sound packs | ✦ |
| Theme editor (custom `#RRGGBB` accent) | ✦ |
| App icons `mesh-1` … `mesh-6` | ✦ |
| Profile status GIF (LAN cloud) | ✦ |
| Signal Corps: Board, Canvas, Pad history, Clipboard 500 + search | ✦ |
| Chat export PDF/HTML with BLIP theme | ✦ |
| Badge on peers (`meshPlus` in UDP announce) | ✦ |

## Not in app yet (marketing only)

- LAN relay, MESH+ Bridge, bandwidth priority — carousel slide only; implementation deferred.

## Settings layout

- **MESH+** — activation + benefits carousel.
- **Network** — session stats + activity bars (all users).
- **Achievements** — optional, **off by default**; Steam-style cards; set `iconAsset` per achievement in `renderer/achievements.js`.

## Code

- Gates: `shared/mesh-plus-gates.js`
- License: `main/mesh-plus-license.js`
- UI: `renderer/mesh-plus-settings.js`, `renderer/mesh-plus.js`

*No ROOT build switcher in public repo.*
