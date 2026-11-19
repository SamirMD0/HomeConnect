export class RelayFailure extends Error {
  constructor(readonly status: number, readonly code?: string) { super('Cloud sync request failed'); }
}
export class CycleExpired extends Error {}

const MAX_RATE_LIMIT_WAITS = 3;
const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
export class WorkerRelay {
  private first = true;
  constructor(private readonly url: string, private readonly secret: string,
    private readonly deadline: number, private readonly fetcher: typeof fetch = fetch,
    private readonly wait: (ms: number) => Promise<void> = defaultWait) {}

  async request(path: string, body?: unknown, raw = false, waits = 0): Promise<any> {
    // Detail projections can make a count-bounded batch exceed the relay's 2 MB limit.
    const batch = body as { records?: unknown[] } | undefined;
    if (batch?.records && batch.records.length > 1 && Buffer.byteLength(JSON.stringify(body), 'utf8') > 1500000) {
      const middle = Math.ceil(batch.records.length / 2);
      await this.request(path, { ...batch, records: batch.records.slice(0, middle) });
      return this.request(path, { ...batch, records: batch.records.slice(middle) });
    }
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) throw new CycleExpired();
    const timeout = Math.min(remaining, this.first ? 75000 : 20000);
    this.first = false;
    const signal = AbortSignal.timeout(timeout);
    // Refuse redirects: a relay address must never redirect the credential.
    const response = await this.fetcher(`${this.url}/relay/v1/worker${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${this.secret}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    // Rate limited: wait as long as the relay asks, while the cycle still has time.
    if (response.status === 429 && waits < MAX_RATE_LIMIT_WAITS) {
      const seconds = Number(response.headers.get('retry-after'));
      const delay = (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 60) : 5) * 1000;
      if (Date.now() + delay + 1000 < this.deadline) {
        await response.body?.cancel().catch(() => undefined);
        await this.wait(delay);
        return this.request(path, body, raw, waits + 1);
      }
    }
    if (response.status !== 200) {
      const data = await response.json().catch(() => ({})) as { code?: string; error?: { code?: string } };
      throw new RelayFailure(response.status, data.code ?? data.error?.code);
    }
    if (raw) return { bytes: await response.arrayBuffer(), mime: response.headers.get('content-type')?.split(';')[0] };
    return response.json();
  }
}
