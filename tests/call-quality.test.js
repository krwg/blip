import { describe, expect, it } from 'vitest';
import { createCallQualityTracker } from '../renderer/call-quality.js';

describe('call quality tracker', () => {
  it('maps low RTT and jitter to good', () => {
    const q = createCallQualityTracker();
    q.noteSample({ rttMs: 40 });
    q.noteSample({ rttMs: 45 });
    q.noteSample({ rttMs: 42 });
    expect(q.snapshot().tier).toBe('good');
  });

  it('maps high jitter to unstable or poor', () => {
    const q = createCallQualityTracker();
    q.noteSample({ rttMs: 50 });
    q.noteSample({ rttMs: 120 });
    q.noteSample({ rttMs: 55 });
    const tier = q.snapshot().tier;
    expect(['unstable', 'poor']).toContain(tier);
  });

  it('throttles identical tier emits', () => {
    const q = createCallQualityTracker();
    q.noteSample({ rttMs: 30 });
    const a = q.snapshotThrottled(10_000);
    const b = q.snapshotThrottled(10_000);
    expect(a.skipped).toBe(false);
    expect(b.skipped).toBe(true);
  });
});
