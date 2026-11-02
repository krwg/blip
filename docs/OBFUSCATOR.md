# Obfuscator (afterPack)

Tracking: [#61](https://github.com/krwg/blip/issues/61).

## Scope

[`scripts/obfuscate-after-pack.cjs`](../scripts/obfuscate-after-pack.cjs) runs only as electron-builder **`afterPack`**. It never runs in `electron:dev` / Vite.

Targets (MESH+ sensitive surface only):

- `main/entitlement-codec.js`
- `main/mesh-plus-license.js`
- `main/mesh-plus-public-key.js`
- `main/mesh-plus-public-key-loader.js`
- `shared/mesh-plus-gates.js`

## Measurement (2026-07-25, Windows, Node 24)

Local run of the same obfuscator options on repo sources (no pack):

| File | Time |
|------|------|
| entitlement-codec.js | ~122 ms |
| mesh-plus-license.js | ~136 ms |
| mesh-plus-public-key.js | ~30 ms |
| mesh-plus-public-key-loader.js | ~41 ms |
| mesh-plus-gates.js | ~48 ms |
| **Total** | **~0.38 s** |

This matches the CHANGELOG note (~0.4 s). Full `electron:build` wall time is dominated by Electron download/packaging, not obfuscation.

## Decision

**Keep afterPack obfuscation; optional skip via env.**

```bash
BLIP_SKIP_OBFUSCATE=1 npm run electron:build
```

Do not move obfuscation into the dev loop. Do not expand to the entire renderer unless there is a new threat model requiring it.
