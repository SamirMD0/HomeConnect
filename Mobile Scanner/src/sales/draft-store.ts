export interface DraftStorage {
  read(slot: 0 | 1): Promise<string | null>;
  write(slot: 0 | 1, value: string): Promise<void>;
}
export interface DraftRecord<F, P, R> {
  version: 1;
  scope: string;
  revision: number;
  idempotencyKey: string;
  phase: 'editing' | 'submitted' | 'saved' | 'discarded';
  form: F | null;
  payload: P | null;
  result: R | null;
}
/** Two durable slots: a killed/partial write leaves the previous valid record.
 * A submitted payload is persisted and read back BEFORE any network write. */
export class DraftStore<F, P, R> {
  private queue: Promise<void> = Promise.resolve();
  private flight: Promise<R> | null = null;
  private listeners = new Set<() => void>();
  private constructor(
    private storage: DraftStorage,
    public current: DraftRecord<F, P, R>
  ) {}
  static async open<F, P, R>(
    storage: DraftStorage,
    scope: string,
    initial: () => F,
    uuid: () => string
  ) {
    const raw = await Promise.all([storage.read(0), storage.read(1)]);
    const records: DraftRecord<F, P, R>[] = [];
    for (const value of raw) {
      if (value === null) continue;
      try {
        const record = JSON.parse(value) as DraftRecord<F, P, R>;
        if (
          record.version === 1 &&
          record.scope === scope &&
          Number.isSafeInteger(record.revision) &&
          record.revision > 0 &&
          typeof record.idempotencyKey === 'string' &&
          ['editing', 'submitted', 'saved', 'discarded'].includes(record.phase) &&
          ((record.phase === 'editing' && record.form && !record.payload) ||
            (record.phase === 'submitted' && record.form && record.payload) ||
            (record.phase === 'saved' && record.result && !record.form && !record.payload) ||
            record.phase === 'discarded')
        )
          records.push(record);
      } catch {
        /* The other slot may be the last complete write. */
      }
    }
    records.sort((a, b) => b.revision - a.revision);
    if (!records.length && raw.some((value) => value !== null))
      throw new Error(
        'Saved form could not be read. Do not submit again; check the PC before recovering device storage.'
      );
    const existing = records[0];
    const record: DraftRecord<F, P, R> = existing ?? {
      version: 1,
      scope,
      revision: 0,
      idempotencyKey: uuid(),
      phase: 'editing',
      form: initial(),
      payload: null,
      result: null,
    };
    const store = new DraftStore<F, P, R>(storage, record);
    if (!existing || existing.phase === 'discarded')
      await store.persist({
        ...record,
        idempotencyKey: existing ? uuid() : record.idempotencyKey,
        phase: 'editing',
        form: initial(),
        payload: null,
        result: null,
      });
    return store;
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private persist(next: DraftRecord<F, P, R>): Promise<void> {
    const snapshot = { ...next, revision: this.current.revision + 1 };
    this.current = snapshot;
    this.listeners.forEach((listener) => listener());
    const serialized = JSON.stringify(snapshot),
      slot = (snapshot.revision % 2) as 0 | 1;
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        await this.storage.write(slot, serialized);
        if ((await this.storage.read(slot)) !== serialized)
          throw new Error('Could not verify the saved form. Retry before submitting.');
      });
    return this.queue;
  }
  edit(form: F) {
    if (this.current.phase !== 'editing')
      return Promise.reject(new Error('Resolve the previous submission before editing.'));
    return this.persist({ ...this.current, form });
  }
  async discard() {
    if (this.current.phase === 'submitted' || this.flight)
      throw new Error(
        'This may already be saved on the PC. Retry the original submission before starting again.'
      );
    // Clear both copies so an old form cannot reappear after a partial later write.
    await this.persist({
      ...this.current,
      phase: 'discarded',
      form: null,
      payload: null,
      result: null,
    });
    await this.persist({ ...this.current });
  }
  submit(
    build: (form: F, key: string) => P,
    send: (payload: P, form: F) => Promise<R>
  ): Promise<R> {
    if (this.flight) return this.flight;
    if (this.current.phase === 'saved') return Promise.resolve(this.current.result!);
    if (!this.current.form) return Promise.reject(new Error('Open a new form.'));
    const form = this.current.form;
    let payload: P;
    try {
      payload = this.current.payload ?? build(form, this.current.idempotencyKey);
    } catch (error) {
      return Promise.reject(error);
    }
    const run = (async () => {
      await this.persist({ ...this.current, phase: 'submitted', payload });
      const result = await send(payload, form);
      // Remove form/payload from both slots, retaining only the server result for recovery.
      await this.persist({ ...this.current, phase: 'saved', form: null, payload: null, result });
      await this.persist({ ...this.current });
      return result;
    })();
    this.flight = run.finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  async editRejected() {
    if (this.flight || this.current.phase !== 'submitted') return;
    await this.persist({ ...this.current, phase: 'editing', payload: null });
  }
}
