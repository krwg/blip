import { describe, expect, it, vi } from 'vitest';
import { classifyActivity } from '../main/presence-detect.js';

describe('presence detect activity classifier', () => {
  it('treats BLIP window reported as explorer as self activity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const first = classifyActivity(
      { app: 'chrome', title: 'Docs', pid: 100, at: Date.now() },
      { excludeSelf: true }
    );
    expect(first?.current).toBe(true);

    vi.advanceTimersByTime(15_000);

    const selfLike = classifyActivity(
      { app: 'explorer', title: 'BLIP - messenger', pid: 200, at: Date.now() },
      { excludeSelf: true }
    );

    expect(selfLike?.current).toBe(false);
    expect(selfLike?.key).toBe(first?.key);

    vi.useRealTimers();
  });

  it('keeps elapsed timer growing in app status line', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    classifyActivity(
      { app: 'notepad', title: 'Notes', pid: 100, at: Date.now() },
      { excludeSelf: true, preferGames: false }
    );
    vi.advanceTimersByTime(13_000);

    const next = classifyActivity(
      { app: 'notepad', title: 'Notes', pid: 100, at: Date.now() },
      { excludeSelf: true, preferGames: false }
    );

    expect(next?.statusLine).toContain('0:13');
    vi.useRealTimers();
  });
});
