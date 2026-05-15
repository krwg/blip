# [FEATURE] Local conversation search and JSON export (complementing clear history)

## Type
Enhancement · Chat · Data portability

## Summary
Incremental search across `localStorage` backed transcript model with debounced substring match; optional per-peer JSON export sanitized for sharing.

## Background
Parity with archival expectations absent cloud sync.

## Scope
Virtualized scrolling future optional — initial simple filter pass acceptable up to capped history lengths already enforced (`MAX_PER_PEER`).
Export excludes binary attachments (none presently) marker field `schema: blip_chat_export_v1`.

## Acceptance criteria
- [ ] Search box filters visible transcript non-destructively.
- [ ] Export writes valid JSON reproducible round-trip importer stub optional backlog.
- [ ] Performance acceptable ≤10k msgs aggregate synthetic bench local only.

## Technical notes
Maintain existing storage key versioning `blip_chat_v1`; future migrations isolated.

## Definition of done
Clear + export interaction doesn't orphan partial files / temp blobs.
