# BEACON multi-peer swarm (design)

Tracking: [#68](https://github.com/krwg/blip/issues/68).

## Goal

Move LAN file distribution beyond one-uploader TCP seeding toward **BitTorrent-like swarming inside a mesh/group**: chunk hashes, have-bitmaps, parallel requests from multiple peers.

## Current building blocks

| Module | Role today |
|--------|------------|
| `beacon-store.js` | Local seed meta, chunk files, have-bitmap helpers |
| `beacon-mesh.js` / UDP announce | Seed discovery on LAN |
| `beacon-tcp-serve.js` / `file-tcp-send.js` | One peer serves chunks over TCP |
| `tcp-framing.js` | NDJSON framing |

IPC already exposes `beacon-have-bitmap`, chunk read/write batch, and `beacon-serve-chunks-tcp` (extracted to `main/ipc/beacon.js`).

## Wire types (proposed)

All messages stay newline-delimited JSON on the mesh TCP channel (or dedicated seed streams).

### `seed-have` (extend)

```json
{
  "type": "seed-have",
  "seedId": "…",
  "totalChunks": 128,
  "bitmap": "base64-or-hex",
  "chunkSize": 1048576,
  "infoHash": "sha256-of-ordered-chunk-hashes"
}
```

- `bitmap`: bit i set ⇒ peer has chunk i (same encoding as `buildSeedHaveBitmap`).
- `infoHash`: integrity root for the whole seed (computed at publish).

### `seed-have-request`

Ask a peer for their bitmap (lightweight poll when UDP announce is stale).

### `seed-chunk-request` / `seed-chunk` / `seed-chunks-batch`

Already partially present for single-source fetch. Swarm mode:

- Client picks **rarest-first** or **sequential-window** among peers with bits set.
- Cap concurrent sources (e.g. 3) and concurrent chunks per source (e.g. 4).
- Verify each chunk hash before setting the local bit.

## Stages

1. **Announce bitmap** — every seeder includes bitmap in UDP / TCP `seed-have`; UI shows “N peers have file / % complete”.
2. **Multi-source fetch** — downloader fans out missing indices using bitmaps; fall back to single peer if alone.
3. **Resume** — local bitmap + on-disk chunks; restart continues from unset bits.
4. **UI** — BEACON row: peer count, aggregate speed, swarm badge.

## Non-goals (v1)

- Internet DHT / tracker
- Piece encryption beyond existing MESH TCP crypto
- Fairness / choking algorithms beyond simple concurrency caps

## Integrity

- Per-chunk SHA-256 (or BLAKE3 later) stored in seed meta at publish.
- Assembled file verified by concatenating chunk hashes → `infoHash`.
- Corrupt chunk ⇒ clear bit and re-request from another peer.

## Next implementation PR

- Extend announce payload + peer UI “have %”
- Parallel fetch scheduler in `beacon-mesh.js` using existing batch IPC
- Tests for bitmap merge / rarest-first selection (pure helpers)
