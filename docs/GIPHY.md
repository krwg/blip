# Giphy API key distribution

Tracking: [#63](https://github.com/krwg/blip/issues/63).

## Decision

**Shared optional maintainer key for demo builds; empty key disables Giphy in the UI.**

| Path | Role |
|------|------|
| `BLIP_GIPHY_API_KEY` / `GIPHY_API_KEY` env | Preferred at runtime (dev & CI) |
| `giphy-api-key.local` (gitignored) | Local maintainer file → synced into `build/giphy-api-key.txt` at build |
| Packaged `resources/giphy-api-key.txt` | Optional bundled demo key from that sync |
| `%APPDATA%/BLIP/giphy-api-key.txt` | Per-user override after install |

Resolution order is implemented in [`main/giphy-key.js`](../main/giphy-key.js). If no key is found, **Settings → Profile GIF → Giphy** stays unavailable (`isGiphyConfigured() === false`).

## Why not “secret in installer”

A Giphy API key next to the exe is **extractable**. Treat any bundled key as a **public demo credential** with rate limits and possible revocation — not as a private secret. Production / personal keys should use env or the AppData override file, never commit them.

## Packaging

- `npm run prebuild` / electron build scripts run `scripts/sync-giphy-key.mjs`.
- Empty sync → empty resource file → Giphy off (safe default for forks without a key).
- Maintainers who want Giphy in official installers set `giphy-api-key.local` or CI secrets before build.

## Abuse / privacy

- GIF search hits Giphy’s API (network). Local mesh chat never sends the key to peers.
- If the demo key is abused, rotate it and cut a new build; users can always supply their own key via AppData.
