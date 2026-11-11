import { afterEach, describe, expect, it, vi } from 'vitest';
import { type FileSystemUploadResult, uploadAsync } from 'expo-file-system/legacy';
import { setSelectedBranch } from '../branches/branch-selection';
import { uploadReceipt } from './receipts-api';
vi.mock('expo-file-system/legacy', () => ({
  uploadAsync: vi.fn(),
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  FileSystemSessionType: { FOREGROUND: 0 },
}));

const client = { baseUrl: 'http://pc:3011', token: 'private-token' };
const input = {
  supplierPurchaseId: null,
  supplierId: 's',
  localUri: 'file://photo.jpg',
  mime: 'image/jpeg',
  note: 'Page 1 & 2',
};
afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  setSelectedBranch(null);
});
describe('native bill upload', () => {
  it('sends the local file as binary JPEG with auth and branch headers', async () => {
    setSelectedBranch('branch-a');
    vi.mocked(uploadAsync).mockResolvedValueOnce({
      status: 201,
      body: JSON.stringify({ success: true, data: { id: 'bill' } }),
      headers: {},
      mimeType: null,
    });
    expect(await uploadReceipt(client, input)).toEqual({ id: 'bill' });
    expect(uploadAsync).toHaveBeenCalledWith(
      'http://pc:3011/api/v1/suppliers/s/bills?note=Page%201%20%26%202',
      input.localUri,
      expect.objectContaining({
        uploadType: 0,
        httpMethod: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer private-token',
          'X-Branch-Scope': 'branch-a',
          'Content-Type': 'image/jpeg',
        }),
      })
    );
    expect(vi.mocked(uploadAsync).mock.calls[0]?.[0]).not.toContain('private-token');
  });
  it('keeps the purchase receipt route working', async () => {
    vi.mocked(uploadAsync).mockResolvedValueOnce({
      status: 201,
      body: '{"success":true,"data":{"id":"b"}}',
      headers: {},
      mimeType: null,
    });
    await uploadReceipt(client, { ...input, supplierPurchaseId: 'purchase' });
    expect(vi.mocked(uploadAsync).mock.calls[0]?.[0]).toContain(
      '/supplier-purchases/purchase/receipts'
    );
  });
  it.each([
    [400, 'VALIDATION'],
    [401, 'UNAUTHORIZED'],
    [403, 'BRANCH'],
    [404, 'NOT_FOUND'],
    [413, 'TOO_LARGE'],
    [429, 'RATE_LIMITED'],
    [503, 'SERVER'],
  ])('maps HTTP %s and preserves the server message', async (status, kind) => {
    vi.mocked(uploadAsync).mockResolvedValueOnce({
      status: Number(status),
      body: '{"success":false,"error":{"code":"CODE","message":"Actual reason"}}',
      headers: {},
      mimeType: null,
    });
    await expect(uploadReceipt(client, input)).rejects.toMatchObject({
      status,
      kind,
      message: 'Actual reason',
      code: 'CODE',
    });
  });
  it('handles a non-JSON envelope and native network errors', async () => {
    vi.mocked(uploadAsync).mockResolvedValueOnce({
      status: 502,
      body: '<html>bad gateway</html>',
      headers: {},
      mimeType: null,
    });
    await expect(uploadReceipt(client, input)).rejects.toMatchObject({
      status: 502,
      kind: 'SERVER',
    });
    vi.mocked(uploadAsync).mockRejectedValueOnce(new Error('native offline'));
    await expect(uploadReceipt(client, input)).rejects.toMatchObject({ kind: 'NETWORK' });
  });
  it('times out after 60 seconds and joins a still-running native upload on retry', async () => {
    vi.useFakeTimers();
    let finish!: (result: FileSystemUploadResult) => void;
    vi.mocked(uploadAsync).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const first = uploadReceipt(client, input);
    const failure = expect(first).rejects.toMatchObject({
      kind: 'NETWORK',
      message: expect.stringContaining('60 seconds'),
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await failure;
    const retry = uploadReceipt(client, input);
    finish({
      status: 201,
      body: '{"success":true,"data":{"id":"late"}}',
      headers: {},
      mimeType: null,
    });
    expect(await retry).toEqual({ id: 'late' });
    expect(uploadAsync).toHaveBeenCalledTimes(1);
  });
});
