import { describe, expect, it, vi } from 'vitest';
import { checkAndNotify, shouldOfferAlerts, type UpdateAlertDeps } from './update-alert';

function deps(over: Partial<UpdateAlertDeps> = {}) {
  let remembered: string | null = null;
  const d = {
    check: vi.fn(async () => ({ isAvailable: true, id: 'u2' })),
    fetch: vi.fn(async () => ({ id: 'u2' })),
    onScreen: vi.fn(() => false),
    lastNotified: vi.fn(async () => remembered),
    rememberNotified: vi.fn(async (id: string) => {
      remembered = id;
    }),
    notify: vi.fn(async () => {}),
    ...over,
  };
  return d;
}

describe('background update alert', () => {
  it('downloads a new update and tells a closed app once', async () => {
    const d = deps();
    expect(await checkAndNotify(d)).toBe('shown');
    expect(d.fetch).toHaveBeenCalled();
    expect(d.rememberNotified).toHaveBeenCalledWith('u2');
    expect(await checkAndNotify(d)).toBe('already-told');
    expect(d.notify).toHaveBeenCalledTimes(1);
  });

  it('says nothing when there is no update', async () => {
    const d = deps({ check: vi.fn(async () => ({ isAvailable: false })) });
    expect(await checkAndNotify(d)).toBe('none');
    expect(d.fetch).not.toHaveBeenCalled();
    expect(d.notify).not.toHaveBeenCalled();
  });

  it('leaves it to the in-app restart prompt while the app is on screen', async () => {
    const d = deps({ onScreen: vi.fn(() => true) });
    expect(await checkAndNotify(d)).toBe('on-screen');
    expect(d.fetch).toHaveBeenCalled();
    expect(d.notify).not.toHaveBeenCalled();
    expect(d.rememberNotified).not.toHaveBeenCalled();
  });

  it('tells again for a newer update', async () => {
    const d = deps({ lastNotified: vi.fn(async () => 'u1') });
    expect(await checkAndNotify(d)).toBe('shown');
  });

  it('does not mark an update as told when the notification fails', async () => {
    const d = deps({ notify: vi.fn(async () => { throw Error('blocked'); }) });
    await expect(checkAndNotify(d)).rejects.toThrow('blocked');
    expect(d.rememberNotified).not.toHaveBeenCalled();
  });
});

describe('asking to allow notifications', () => {
  it('asks once, only when Android still lets us ask', () => {
    expect(shouldOfferAlerts({ granted: false, canAskAgain: true }, false)).toBe(true);
    expect(shouldOfferAlerts({ granted: false, canAskAgain: true }, true)).toBe(false);
    expect(shouldOfferAlerts({ granted: true, canAskAgain: true }, false)).toBe(false);
    expect(shouldOfferAlerts({ granted: false, canAskAgain: false }, false)).toBe(false);
  });
});
