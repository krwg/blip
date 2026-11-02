/**
 * Append-only local event log with lazy aggregation into a cached summary.
 * No network I/O — inject `storage` only.
 */

function defaultReduce(summary, event) {
  const t = event?.type;
  if (!t) return;
  if (t === 'set_max' && event.key != null) {
    const n = Number(event.value) || 0;
    const key = String(event.key);
    summary[key] = Math.max(Number(summary[key]) || 0, n);
    return;
  }
  if (t === 'set' && event.key != null) {
    summary[String(event.key)] = event.value;
    return;
  }
  summary[t] = (Number(summary[t]) || 0) + 1;
}

function emptyState() {
  return { events: [], summary: {}, lastAggregatedIndex: 0 };
}

function loadState(storage, storageKey) {
  try {
    const raw = storage.getItem(storageKey);
    const o = raw ? JSON.parse(raw) : null;
    if (o && typeof o === 'object' && Array.isArray(o.events)) {
      return {
        events: o.events,
        summary: o.summary && typeof o.summary === 'object' ? o.summary : {},
        lastAggregatedIndex: Number(o.lastAggregatedIndex) || 0,
      };
    }
  } catch {
    /* corrupt or unavailable storage */
  }
  return emptyState();
}

/**
 * @param {object} options
 * @param {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} options.storage
 * @param {string} [options.storageKey='local_stats_v1']
 * @param {(summary: Record<string, unknown>, event: Record<string, unknown>) => void} [options.reduceEvent]
 */
export function createLocalStatsStore({
  storage,
  storageKey = 'local_stats_v1',
  reduceEvent = defaultReduce,
}) {
  if (!storage?.getItem || !storage?.setItem) {
    throw new Error('createLocalStatsStore requires storage with getItem/setItem');
  }

  let state = loadState(storage, storageKey);

  function persist() {
    try {
      storage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* quota or private mode */
    }
  }

  function tickAggregate() {
    const { events, summary } = state;
    for (let i = state.lastAggregatedIndex; i < events.length; i++) {
      reduceEvent(summary, events[i]);
    }
    state.lastAggregatedIndex = events.length;
    persist();
    return { ...state.summary };
  }

  return {
    appendEvent(event) {
      const e = { ...(event && typeof event === 'object' ? event : {}), ts: event?.ts ?? Date.now() };
      state.events.push(e);
      persist();
      return e;
    },

    getSummary() {
      if (state.lastAggregatedIndex < state.events.length) {
        tickAggregate();
      }
      return { ...state.summary };
    },

    tickAggregate,
  };
}
