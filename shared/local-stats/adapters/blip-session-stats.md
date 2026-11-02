# BLIP adapter: `renderer/session-stats.js`

Maps today’s session counters onto `createLocalStatsStore` without changing achievement hooks or panel APIs.

## Event types (proposed)

| Current API            | Event |
|------------------------|-------|
| `ensure()` first run   | `{ type: 'set', key: 'sessionStartedAt', value: Date.now() }` once |
| `recordMessageSent()`  | `{ type: 'messagesSent' }` — default reducer increments `summary.messagesSent` |
| `recordFileSent()`     | `{ type: 'filesSent' }` |
| `recordCallStarted()`  | `{ type: 'callsStarted' }` |
| `recordPeersOnline(n)` | `{ type: 'set_max', key: 'peersMaxOnline', value: n }` |

Keep storage key `blip_session_stats_v1` until a deliberate migration.

## Sketch (not wired in tree yet)

```js
// renderer/session-stats.js — optional future import
// import { createLocalStatsStore } from '../shared/local-stats/local-stats-store.js';

const STORAGE_KEY = 'blip_session_stats_v1';

// const store = createLocalStatsStore({
//   storage: localStorage,
//   storageKey: STORAGE_KEY,
//   reduceEvent(summary, event) {
//     if (event.type === 'set' && event.key === 'sessionStartedAt' && summary.sessionStartedAt == null) {
//       summary.sessionStartedAt = event.value;
//       return;
//     }
//     // inline default rules: increment by type, set / set_max for keyed fields
//   },
// });

// export function recordMessageSent() {
//   store.appendEvent({ type: 'messagesSent' });
//   tickAchievements();
// }

// export function getSessionStats() {
//   const s = store.getSummary();
//   if (!s.sessionStartedAt) {
//     store.appendEvent({ type: 'set', key: 'sessionStartedAt', value: Date.now() });
//     return store.getSummary();
//   }
//   return s;
// }
```

`sessionOnlineHours()` stays derived: `(Date.now() - summary.sessionStartedAt) / 3_600_000`.

Call `tickAggregate()` on a timer only if you want to decouple writes from rollup work; `getSummary()` already aggregates pending events lazily.
