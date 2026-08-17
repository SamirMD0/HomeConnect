import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportRowsApi } from './report-rows.api';

const { apiMock } = vi.hoisted(() => ({ apiMock: { get: vi.fn() } }));
vi.mock('../../../services/api', () => ({ api: apiMock }));

describe('reportRowsApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps every report slice to its read endpoint', async () => {
    apiMock.get.mockResolvedValue({ data: { success: true, meta: { preset: 'lastMonth' }, data: { summary: {}, rows: [] } } });
    await reportRowsApi.get('suppliers-receiving', { period: 'lastMonth' });
    expect(apiMock.get).toHaveBeenCalledWith('/reports/suppliers/receiving', { params: { period: 'lastMonth' } });
  });

  it('exports the selected custom slice without changing its range', async () => {
    const blob = new Blob(['csv']);
    apiMock.get.mockResolvedValue({ data: blob });
    const result = await reportRowsApi.exportCsv('inventory-reconciliation', { period: 'custom', from: '2026-07-01', to: '2026-07-31' });
    expect(apiMock.get).toHaveBeenCalledWith('/reports/inventory/reconciliation/export.csv', {
      params: { period: 'custom', from: '2026-07-01', to: '2026-07-31' }, responseType: 'blob',
    });
    expect(result).toBe(blob);
  });
});
