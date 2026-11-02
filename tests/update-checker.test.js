import { describe, expect, it, vi } from 'vitest';
import { buildUpdateStatusToastOptions } from '../renderer/update-checker.js';

const t = (key) => key;

describe('buildUpdateStatusToastOptions', () => {
  it('returns null for missing state', () => {
    expect(buildUpdateStatusToastOptions(null, t)).toBeNull();
    expect(buildUpdateStatusToastOptions({ state: 'unknown' }, t)).toBeNull();
  });

  it('maps checking and none states', () => {
    expect(buildUpdateStatusToastOptions({ state: 'checking' }, t)).toMatchObject({
      title: 'toast.update_checking',
      durationMs: 5000,
    });
    expect(buildUpdateStatusToastOptions({ state: 'none' }, t)).toMatchObject({
      title: 'toast.update_latest',
      durationMs: 5000,
    });
  });

  it('includes version in available body and wires settings action', () => {
    const onOpenUpdatesSettings = vi.fn();
    const translate = (key) =>
      key === 'toast.update_available_body' ? 'Version {v}' : key;
    const opts = buildUpdateStatusToastOptions(
      { state: 'available', version: '2.0.1' },
      translate,
      { onOpenUpdatesSettings },
    );
    expect(opts.body).toContain('2.0.1');
    expect(opts.actions).toHaveLength(1);
    opts.actions[0].onClick();
    expect(onOpenUpdatesSettings).toHaveBeenCalledOnce();
  });

  it('maps progress and downloaded install action', () => {
    const onQuitAndInstall = vi.fn();
    const progress = buildUpdateStatusToastOptions({ state: 'progress', percent: 42 }, t);
    expect(progress.body).toBe('42%');
    expect(progress.durationMs).toBe(0);

    const ready = buildUpdateStatusToastOptions(
      { state: 'downloaded', version: '2.0.0' },
      t,
      { onQuitAndInstall },
    );
    ready.actions[0].onClick();
    expect(onQuitAndInstall).toHaveBeenCalledOnce();
  });

  it('maps error variant', () => {
    expect(
      buildUpdateStatusToastOptions({ state: 'error', message: 'network' }, t),
    ).toMatchObject({
      title: 'toast.update_error',
      body: 'network',
      variant: 'danger',
    });
  });
});
