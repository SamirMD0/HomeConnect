import { describe, expect, it, vi } from 'vitest';
import { WorkerRelay } from './relay-client';
describe('relay batch size', () => {
  it('splits large record batches and acknowledges only after every part succeeds', async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('{}'));
    const relay = new WorkerRelay('https://relay.example', 'worker-secret', Date.now() + 120000, fetcher);
    await relay.request('/records', { pcSeq: '42', records: [{ data: 'x'.repeat(900000) }, { data: 'y'.repeat(900000) }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, options] of fetcher.mock.calls) {
      expect(Buffer.byteLength(options.body)).toBeLessThan(1500000);
      expect(JSON.parse(options.body).pcSeq).toBe('42');
    }
    fetcher.mockReset().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(relay.request('/records', { pcSeq: '43', records: [{ data: 'x'.repeat(900000) }, { data: 'y'.repeat(900000) }] })).rejects.toMatchObject({ status: 503 });
  });
});
describe('relay rate limit', () => {
  it('waits as long as the relay asks and then retries', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '7' } }))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    const wait = vi.fn(async () => undefined);
    const relay = new WorkerRelay('https://relay.example', 'worker-secret', Date.now() + 120000, fetcher, wait);
    await expect(relay.request('/records', { pcSeq: '1', records: [] })).resolves.toEqual({ ok: true });
    expect(wait).toHaveBeenCalledWith(7000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('gives up after three waits, or when the wait would pass the cycle deadline', async () => {
    const limited = () => new Response('{}', { status: 429, headers: { 'Retry-After': '1' } });
    const fetcher = vi.fn().mockImplementation(async () => limited());
    const wait = vi.fn(async () => undefined);
    await expect(new WorkerRelay('https://relay.example', 's', Date.now() + 120000, fetcher, wait).request('/records', { records: [] }))
      .rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(4);
    fetcher.mockClear(); wait.mockClear();
    fetcher.mockImplementation(async () => new Response('{}', { status: 429, headers: { 'Retry-After': '60' } }));
    await expect(new WorkerRelay('https://relay.example', 's', Date.now() + 30000, fetcher, wait).request('/records', { records: [] }))
      .rejects.toMatchObject({ status: 429 });
    expect(wait).not.toHaveBeenCalled();
  });
});
