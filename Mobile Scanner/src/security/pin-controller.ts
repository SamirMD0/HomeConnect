import { PIN_KEY, type SecretStorage } from './storage';
import { derivePin, PIN_ITERATIONS, sameHash, validPin } from './pin-crypto';
export const TOO_MANY_PINS = 'Too many wrong PINs. Pair this phone again from the shop PC.';
export interface PinRecord {
  owner: string;
  salt: string;
  hash: string;
  iterations: number;
  failedCount: number;
  lockedUntil: number;
  biometric: boolean;
  minutes: 1 | 5 | 15;
  lastUnlockAt: string | null;
}
export interface LockState {
  phase: 'loading' | 'setup' | 'locked' | 'unlocked' | 'wiping' | 'error';
  hidden: boolean;
  record: PinRecord | null;
  error: string | null;
}
export interface PinDependencies {
  storage: SecretStorage;
  random: () => Promise<string>;
  derive?: typeof derivePin;
  now?: () => number;
  wipe: (message: string) => Promise<void>;
  biometric: () => Promise<boolean>;
}
export function parsePin(raw: string | null, owner: string): PinRecord | null {
  if (!raw) return null;
  const value = JSON.parse(raw) as PinRecord;
  if (value.owner !== owner) return null;
  if (
    !/^[a-f0-9]{32}$/.test(value.salt) ||
    !/^[a-f0-9]{64}$/.test(value.hash) ||
    !Number.isInteger(value.iterations) ||
    value.iterations < PIN_ITERATIONS ||
    value.iterations > 10000000 ||
    !Number.isInteger(value.failedCount) ||
    value.failedCount < 0 ||
    value.failedCount > 10 ||
    !Number.isFinite(value.lockedUntil) ||
    value.lockedUntil < 0 ||
    ![1, 5, 15].includes(value.minutes) ||
    typeof value.biometric !== 'boolean' ||
    (value.lastUnlockAt !== null && !Number.isFinite(Date.parse(value.lastUnlockAt)))
  )
    throw new Error('Security settings could not be read. Pair this phone again.');
  return value;
}
export const pinWait = (failedCount: number) =>
  failedCount < 5 ? 0 : Math.min(900000, 30000 * 2 ** (failedCount - 5));
export class PinController {
  private state: LockState = { phase: 'loading', hidden: false, record: null, error: null };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private writes: Promise<unknown> = Promise.resolve();
  private closed = false;
  private backgroundAt: number | null = null;
  private authenticatedAt = 0;
  constructor(
    readonly owner: string,
    private deps: PinDependencies
  ) {}
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit(value: Partial<LockState>) {
    this.state = { ...this.state, ...value };
    for (const listener of this.listeners) listener();
  }
  private now() {
    return (this.deps.now ?? Date.now)();
  }
  private active() {
    if (this.closed) throw new Error('The phone pairing changed.');
  }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => {
      this.active();
      return work();
    });
    this.queue = next.catch(() => {});
    return next;
  }
  private async persist(record: PinRecord) {
    this.active();
    const value = JSON.stringify(record);
    this.writes = (async () => {
      await this.deps.storage.set(PIN_KEY, value);
      if ((await this.deps.storage.get(PIN_KEY)) !== value)
        throw new Error('Could not verify saved security settings.');
    })();
    await this.writes;
    this.active();
    this.emit({ record });
  }
  async stop() {
    this.closed = true;
    this.emit({ phase: 'wiping' });
    await this.writes.catch(() => {});
  }
  load = () =>
    this.serial(async () => {
      try {
        const record = parsePin(await this.deps.storage.get(PIN_KEY), this.owner);
        this.active();
        this.emit({ record, phase: record ? 'locked' : 'setup', error: null });
        if (record && record.failedCount >= 10) await this.erase(TOO_MANY_PINS);
      } catch (error) {
        if (!this.closed) this.emit({ phase: 'error', error: (error as Error).message });
      }
    });
  setup = (pin: string, again: string) =>
    this.serial(async () => {
      if (this.state.phase !== 'setup') throw new Error('A PIN is already set.');
      if (!validPin(pin)) throw new Error('Use a 4–6 digit PIN.');
      if (pin !== again) throw new Error('The PINs do not match.');
      const salt = await this.deps.random();
      const hash = await (this.deps.derive ?? derivePin)(pin, salt, PIN_ITERATIONS);
      this.active();
      await this.persist({
        owner: this.owner,
        salt,
        hash,
        iterations: PIN_ITERATIONS,
        failedCount: 0,
        lockedUntil: 0,
        biometric: false,
        minutes: 5,
        lastUnlockAt: new Date(this.now()).toISOString(),
      });
      this.authenticatedAt = this.now();
      this.emit({ phase: 'unlocked' });
    });
  private async verify(pin: string, unlock: boolean) {
    const record = this.state.record;
    if (!record) throw new Error('Create a PIN first.');
    if (record.failedCount >= 10) {
      await this.erase(TOO_MANY_PINS);
      return false;
    }
    if (record.lockedUntil > this.now())
      throw new Error('Please wait before trying your PIN again.');
    const correct =
      validPin(pin) &&
      sameHash(
        await (this.deps.derive ?? derivePin)(pin, record.salt, record.iterations),
        record.hash
      );
    this.active();
    if (!correct) {
      const failedCount = record.failedCount + 1;
      await this.persist({
        ...record,
        failedCount,
        lockedUntil: this.now() + pinWait(failedCount),
      });
      if (failedCount >= 10) await this.erase(TOO_MANY_PINS);
      return false;
    }
    await this.persist({
      ...record,
      failedCount: 0,
      lockedUntil: 0,
      lastUnlockAt: unlock ? new Date(this.now()).toISOString() : record.lastUnlockAt,
    });
    if (unlock) {
      this.authenticatedAt = this.now();
      this.emit({ phase: 'unlocked', error: null });
    }
    return true;
  }
  unlockPin = (pin: string) => this.serial(() => this.verify(pin, true));
  changePin = (old: string, pin: string, again: string) =>
    this.serial(async () => {
      if (this.state.phase !== 'unlocked') throw new Error('Unlock the phone first.');
      if (!validPin(pin)) throw new Error('Use a 4–6 digit PIN.');
      if (pin !== again) throw new Error('The PINs do not match.');
      if (!(await this.verify(old, false))) throw new Error('The current PIN is incorrect.');
      const salt = await this.deps.random(),
        hash = await (this.deps.derive ?? derivePin)(pin, salt, PIN_ITERATIONS);
      this.active();
      await this.persist({ ...this.state.record!, salt, hash, iterations: PIN_ITERATIONS });
    });
  unlockBiometric = () =>
    this.serial(async () => {
      if (!this.state.record?.biometric) return false;
      const success = await this.deps.biometric();
      this.active();
      if (!success) return false;
      await this.persist({
        ...this.state.record,
        failedCount: 0,
        lockedUntil: 0,
        lastUnlockAt: new Date(this.now()).toISOString(),
      });
      this.authenticatedAt = this.now();
      this.emit({ phase: 'unlocked' });
      return true;
    });
  preferences = (value: Partial<Pick<PinRecord, 'minutes' | 'biometric'>>) =>
    this.serial(async () => {
      if (this.state.phase !== 'unlocked' || !this.state.record)
        throw new Error('Unlock the phone first.');
      if (value.minutes !== undefined && ![1, 5, 15].includes(value.minutes))
        throw new Error('Choose 1, 5 or 15 minutes.');
      if (value.biometric === true && !(await this.deps.biometric())) return false;
      this.active();
      await this.persist({ ...this.state.record, ...value });
      return true;
    });
  appState = (value: string) => {
    if (this.closed) return;
    if (value !== 'active') {
      if (!this.state.hidden) this.backgroundAt = this.now();
      this.emit({ hidden: true });
      return;
    }
    const expired =
      this.backgroundAt !== null &&
      this.now() - this.backgroundAt >= (this.state.record?.minutes ?? 5) * 60000 &&
      this.authenticatedAt <= this.backgroundAt;
    this.backgroundAt = null;
    this.emit({
      hidden: false,
      ...(expired && this.state.phase === 'unlocked' ? { phase: 'locked' as const } : {}),
    });
  };
  lock = () => this.emit({ phase: this.state.record ? 'locked' : 'setup' });
  private async erase(message: string) {
    this.emit({ phase: 'wiping' });
    await this.deps.wipe(message);
  }
  forget = () =>
    this.serial(() =>
      this.erase('Pair this phone again from the shop PC. Saved action summaries have been kept.')
    );
}
