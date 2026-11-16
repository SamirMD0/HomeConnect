export class RelayFailure extends Error {
  constructor(readonly status: number, readonly code?: string) { super('Cloud sync request failed'); }
}
export class CycleExpired extends Error {}

export class WorkerRelay {
  private first = true;
  constructor(private readonly url: string, private readonly secret: string,
    private readonly deadline: number, private readonly fetcher: typeof fetch = fetch) {}

  async request(path: string, body?: unknown, raw = false): Promise<any> {
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
    if (response.status !== 200) {
      const data = await response.json().catch(() => ({})) as { code?: string; error?: { code?: string } };
      throw new RelayFailure(response.status, data.code ?? data.error?.code);
    }
    if (raw) return { bytes: await response.arrayBuffer(), mime: response.headers.get('content-type')?.split(';')[0] };
    return response.json();
  }
}
