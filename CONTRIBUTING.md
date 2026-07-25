# Contributing to BLIP

Thanks for helping improve BLIP. This project is **GPL-3.0** — your contributions will be under the same license.

## Prerequisites

- **Node.js** ≥ 20 (see `.nvmrc`). Use `nvm use` if you use nvm.
- **npm** (ships with Node).
- **Windows** is the primary day-to-day target; **Linux** and **macOS 12+** are supported packaging targets (see [`docs/PACKAGING.md`](docs/PACKAGING.md)).

## GitHub Pages

The static landing page lives in **`docs/index.html`**. To publish:

1. Repo **Settings** → **Pages** → **Build and deployment** → source: **Deploy from a branch**.
2. Branch: **`main`**, folder: **`/docs`**, Save.
3. Site URL: `https://krwg.github.io/blip/` (repo: `https://github.com/krwg/blip`).

Update the hardcoded clone URL in `docs/index.html` only if the repo moves.

## Quick setup

```bash
git clone https://github.com/krwg/blip.git
cd blip
npm ci
```

## Development

```bash
npm run electron:dev
```

This runs Vite and Electron with `BLIP_VITE_DEV=1`. The UI loads from `http://localhost:5173`.

**Second instance** (separate config directory — see `scripts/electron-dev-peer2.mjs`):

```bash
npm run electron:dev:peer2
```

## Production-like run

```bash
npm start
```

Builds the renderer first (`prestart` → `vite build`), then launches Electron against `dist/`.

## Building installers

See **[`docs/PACKAGING.md`](docs/PACKAGING.md)** for Windows / Linux / macOS 12+ details (styled DMG, tray & login-item limits, Gatekeeper).

```bash
npm run electron:build          # Windows NSIS
npm run electron:build:portable
npm run electron:build:win      # Setup + portable + latest.yml
npm run electron:build:mac      # DMG + zip (on macOS)
npm run electron:build:linux    # AppImage + deb (on Linux)
```

Outputs go to `dist-electron/` (see `electron-builder.yml`).

### Publishing a GitHub Release

In-app updates need the matching channel file on the **same** release tag as `app-metadata.json`:

| Platform | Manifest |
|----------|----------|
| Windows | `latest.yml` + Setup exe |
| macOS | `latest-mac.yml` + dmg/zip |
| Linux | `latest-linux.yml` + AppImage/deb |

| Method | Command |
|--------|---------|
| **CI (recommended)** | Push git tag → [`.github/workflows/release.yml`](.github/workflows/release.yml) builds win/linux/mac |
| **Local publish** | `$env:GH_TOKEN = "ghp_…"; npm run electron:publish:win` (or `:mac` / `:linux`) |
| **Manual upload** | Build locally then `npm run release:assets` — attach listed files to the GitHub Release |

Copy release notes from [`docs/release-notes-v1.1.1-github.md`](docs/release-notes-v1.1.1-github.md) (update per version).

**Portable** Windows builds do not receive in-app updates — users must download a new portable or install Setup once.

**Dev vs packaged UI:** `npm run electron:dev` loads live sources from Vite; packaging snapshots `dist/` into the app. Always run `npm run build` before shipping (the build scripts do this automatically).

## Release metadata

Version and codename live in [`app-metadata.json`](app-metadata.json) (synced into `package.json` on `npm run build`). Update [`CHANGELOG.md`](CHANGELOG.md) when shipping.

**MESH+** tier notes: [`docs/MESH-PLUS.md`](docs/MESH-PLUS.md) — test subscription, free keys via blipteam@icloud.com; plan to graduate features to FREE. Do not break FREE behavior when gating MESH+ features.

Release builds: run `npm run setup:build-secrets` once, then configure maintainer build secrets before `electron:build:*` (see `ENTITLEMENT-MAP.local.md`, gitignored).

## TCP payloads (renderer ↔ main)

Chat and signalling use newline-delimited JSON on TCP port **42070**. Common `type` values: `message`, `typing`, `ping`/`pong`, `call-*`, `group-*`, `group-call-*`, `file-*`, `clipboard-push`, `seed-*` (BEACON). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The renderer Vite build produces three HTML entry points: `index.html`, `call-window.html`, `group-call-window.html`.

## Version / metadata

- Release version and display metadata live in **`app-metadata.json`** (see current version/codename there).
- `npm run build` runs `scripts/sync-app-metadata.mjs` so `package.json`’s `version` stays in sync.
- User-facing release notes go in **`CHANGELOG.md`** before tagging.

## Code style

- Match existing patterns in `main/` and `renderer/`.
- Prefer small, focused PRs with a clear **what** and **why**.
- If you change user-visible strings, update **EN + RU** in `renderer/i18n.js` when applicable.

## Pull requests

1. Fork → branch → push → open PR against `main`.
2. Ensure **CI is green** (see `.github/workflows/ci.yml`).
3. Describe behavior change, testing done, and screenshots for UI changes.

## Security

Do **not** open public issues for sensitive vulnerabilities. See [SECURITY.md](SECURITY.md).

## Questions

Open a GitHub issue. If **Discussions** are enabled for this repo, you may ask broader questions there instead.
