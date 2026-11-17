import { describe, expect, it, vi } from 'vitest';
import { pbkdf2Sync } from 'node:crypto';
import { PinController, pinWait, TOO_MANY_PINS } from './pin-controller';
import { derivePin, PIN_ITERATIONS } from './pin-crypto';
import { PIN_KEY, type SecretStorage } from './storage';
function fixture() {
  let clock = 1000;
  const map = new Map<string, string>();
  const storage: SecretStorage = {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
    remove: async (key) => {
      map.delete(key);
    },
  };
  const wipe = vi.fn(async () => {}),
    biometric = vi.fn(async () => false),
    derive = vi.fn(async (pin: string) => (pin === '1234' ? 'a'.repeat(64) : 'b'.repeat(64)));
  const deps = {
    storage,
    random: async () => 'c'.repeat(32),
    derive,
    now: () => clock,
    wipe,
    biometric,
  };
  const create = () => new PinController('device:user', deps);
  return {
    map,
    storage,
    wipe,
    biometric,
    derive,
    deps,
    create,
    tick: (value: number) => {
      clock += value;
    },
  };
}
describe('phone PIN protection', () => {
  it('uses real PBKDF2-SHA256 at 150,000 iterations, matching the platform implementation', async () => {
    const salt = '01'.repeat(16);
    expect(await derivePin('1234', salt)).toBe(
      pbkdf2Sync('1234', Buffer.from(salt, 'hex'), PIN_ITERATIONS, 32, 'sha256').toString('hex')
    );
  });
  it('requires matching digits and stores only the salt/hash, never the PIN', async () => {
    const f = fixture(),
      pin = f.create();
    await pin.load();
    expect(pin.getState().phase).toBe('setup');
    await expect(pin.setup('123', '123')).rejects.toThrow('4–6');
    await expect(pin.setup('1234', '1111')).rejects.toThrow('match');
    await pin.setup('1234', '1234');
    const saved = JSON.parse(f.map.get(PIN_KEY)!);
    expect(saved).toMatchObject({ salt: 'c'.repeat(32), hash: 'a'.repeat(64), iterations: 150000 });
    expect(f.map.get(PIN_KEY)).not.toContain('1234');
    expect(saved).not.toHaveProperty('pin');
  });
  it('starts locked on every cold start and accepts the correct PIN', async () => {
    const f = fixture(),
      setup = f.create();
    await setup.load();
    await setup.setup('1234', '1234');
    const cold = f.create();
    await cold.load();
    expect(cold.getState().phase).toBe('locked');
    expect(await cold.unlockPin('9999')).toBe(false);
    expect(await cold.unlockPin('1234')).toBe(true);
    expect(cold.getState().record?.failedCount).toBe(0);
  });
  it('persists the fifth-failure delay, doubles each later wait and wipes on the tenth failure', async () => {
    const f = fixture(),
      pin = f.create();
    await pin.load();
    await pin.setup('1234', '1234');
    pin.lock();
    for (let count = 1; count <= 10; count++) {
      expect(await pin.unlockPin('9999')).toBe(false);
      expect(pin.getState().record?.failedCount).toBe(count);
      if (count >= 5 && count < 10) {
        await expect(pin.unlockPin('9999')).rejects.toThrow('wait');
        const cold = f.create();
        await cold.load();
        await expect(cold.unlockPin('9999')).rejects.toThrow('wait');
        f.tick(pinWait(count));
      }
    }
    expect(f.wipe).toHaveBeenCalledExactlyOnceWith(TOO_MANY_PINS);
    expect(pinWait(20)).toBe(900000);
  });
  it('serializes concurrent checks so wrong attempts cannot race the wipe threshold', async () => {
    const f = fixture(),
      pin = f.create();
    await pin.load();
    await pin.setup('1234', '1234');
    pin.lock();
    await Promise.allSettled(Array.from({ length: 12 }, () => pin.unlockPin('9999')));
    expect(pin.getState().record?.failedCount).toBe(5);
    expect(f.derive).toHaveBeenCalledTimes(6);
  });
  it('hides data immediately while away, and locks only after the chosen timer', async () => {
    const f = fixture(),
      pin = f.create();
    await pin.load();
    await pin.setup('1234', '1234');
    await pin.preferences({ minutes: 1 });
    pin.appState('background');
    expect(pin.getState().hidden).toBe(true);
    f.tick(59000);
    pin.appState('active');
    expect(pin.getState()).toMatchObject({ hidden: false, phase: 'unlocked' });
    pin.appState('inactive');
    f.tick(61000);
    pin.appState('active');
    expect(pin.getState().phase).toBe('locked');
  });
  it('keeps PIN fallback when biometrics cancel, and unlocks on a successful enrolled biometric', async () => {
    const f = fixture(),
      pin = f.create();
    await pin.load();
    await pin.setup('1234', '1234');
    f.biometric.mockResolvedValue(true);
    await pin.preferences({ biometric: true });
    pin.lock();
    f.biometric.mockResolvedValue(false);
    expect(await pin.unlockBiometric()).toBe(false);
    expect(pin.getState().phase).toBe('locked');
    f.biometric.mockResolvedValue(true);
    expect(await pin.unlockBiometric()).toBe(true);
  });
  it('cannot apply a stale PIN check after the background timer has locked the phone', async () => {
    const f = fixture(),
      pin = f.create();
    await pin.load();
    await pin.setup('1234', '1234');
    pin.lock();
    let finish: (value: string) => void = () => {};
    let started = false;
    f.derive.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
          started = true;
        })
    );
    const attempt = pin.unlockPin('1234');
    await vi.waitFor(() => expect(started).toBe(true));
    pin.appState('background');
    f.tick(5 * 60000);
    pin.appState('active');
    finish('a'.repeat(64));
    await expect(attempt).rejects.toThrow('locked while checking');
    expect(pin.getState().phase).toBe('locked');
    expect(await pin.unlockPin('1234')).toBe(true);
  });
  it('requires the old PIN to change the hash and never applies a late credential write after stopping', async () => {
    const f = fixture(),
      pin = f.create();
    await pin.load();
    await pin.setup('1234', '1234');
    await expect(pin.changePin('9999', '5678', '5678')).rejects.toThrow('current PIN');
    expect(JSON.parse(f.map.get(PIN_KEY)!).hash).toBe('a'.repeat(64));
    await pin.changePin('1234', '5678', '5678');
    expect(JSON.parse(f.map.get(PIN_KEY)!).hash).toBe('b'.repeat(64));
    await pin.stop();
    await expect(pin.unlockPin('1234')).rejects.toThrow('pairing changed');
  });
});
