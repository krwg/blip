# local-stats (in-repo)

Offline, device-local counters and rollups. **No telemetry** — nothing leaves the machine unless the host app explicitly reads `getSummary()` for its own UI.

## Pattern

1. **Append-only events** — callers record facts with `appendEvent({ type, … })`; the log grows in storage.
2. **Periodic aggregation** — `tickAggregate()` (or lazy aggregation inside `getSummary()`) walks new events and updates a cached summary.
3. **Cached summary** — UI and achievements read `getSummary()` instead of scanning the full event log.

Implementation: [`local-stats-store.js`](./local-stats-store.js).

## Storage

Pass any key/value backend (`localStorage`, Electron `safeStorage` wrapper, file-backed JSON, etc.):

```js
import { createLocalStatsStore } from '../shared/local-stats/local-stats-store.js';

const store = createLocalStatsStore({
  storage: localStorage,
  storageKey: 'my_app_stats_v1',
});
```

## BLIP

First consumer (planned): renderer [`session-stats.js`](../../renderer/session-stats.js). See [`adapters/blip-session-stats.md`](./adapters/blip-session-stats.md).
