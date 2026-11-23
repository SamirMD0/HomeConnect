import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryDb } from './testing/memory-db';
import { applyRecords } from './record-store';
import { CloudDataSource } from './data-source';
import { configureCloudReader, setCloudMode } from './cloud-mode';
import { setSelectedBranch } from '../branches/branch-selection';
import { listPurchases } from '../api/supplier-lookup-api';
import { listRecentPayments } from '../suppliers/bills-inbox';
import { buildCloudMovementPayload } from '../stock/stock-logic';

const client = { baseUrl: 'https://relay.example', token: 'cloud-local-session' };
const purchase = { id: 'purchase', receiptNumber: 'INV-7', description: 'Fans', transactionDate: '2026-11-20', amount: '120.00', currency: 'USD', status: 'ACTIVE', supplierReceivingId: null };
const payment = { id: 'payment', type: 'SUPPLIER_PAYMENT', status: 'ACTIVE', transactionDate: '2026-11-21', amount: '50.00', currency: 'USD', description: 'Cash' };

async function seed(supplier: Record<string, unknown>) {
  const db = await memoryDb();
  await applyRecords(db, 'records', [{ entity: 'supplier', id: 'supplier', branchId: 'a', op: 'upsert', rev: '1', data: supplier }]);
  const source = new CloudDataSource(db, ['a']);
  configureCloudReader((url, init) => source.read(url, init));
}

describe('phase 3: bills linkable away from the shop', () => {
  beforeEach(() => {
    setSelectedBranch('a');
    setCloudMode(true);
    vi.stubGlobal('fetch', vi.fn(() => { throw Error('A cloud screen must never fetch PC data'); }));
  });
  afterEach(() => { setCloudMode(false); configureCloudReader(null); setSelectedBranch(null); vi.unstubAllGlobals(); });

  it("reads a supplier's recent purchases and payments from its synced record", async () => {
    await seed({ id: 'supplier', branchId: 'a', name: 'Supplier', recentPurchases: [purchase], recentPayments: [payment] });
    expect((await listPurchases(client, 'supplier', 1)).items).toEqual([purchase]);
    expect(await listRecentPayments(client, 'supplier')).toEqual([payment]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('says to use the shop Wi-Fi when the PC has not sent the lists yet (PC before 2.4.6)', async () => {
    await seed({ id: 'supplier', branchId: 'a', name: 'Supplier' });
    await expect(listPurchases(client, 'supplier', 1)).rejects.toThrow('shop Wi-Fi');
  });
});

describe('phase 3: cloud stock change payload', () => {
  it('sends no expected-before stock and no password, and checks quantity and reason', () => {
    expect(buildCloudMovementPayload({ productId: 'p', type: 'STOCK_COUNT', quantity: '0', reason: ' Shelf ', note: '' }))
      .toEqual({ productId: 'p', movementType: 'STOCK_COUNT', quantity: 0, reason: 'Shelf', note: null });
    expect(() => buildCloudMovementPayload({ productId: 'p', type: 'MANUAL_ADD', quantity: '0', reason: 'x', note: '' })).toThrow();
    expect(() => buildCloudMovementPayload({ productId: 'p', type: 'MANUAL_ADD', quantity: '2', reason: '  ', note: '' })).toThrow('Reason');
  });
});
