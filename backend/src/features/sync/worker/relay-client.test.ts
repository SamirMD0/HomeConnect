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
