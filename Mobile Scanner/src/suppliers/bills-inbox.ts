import type { BillRead, PurchaseRead } from '@shared/lookup-contracts';
import { authedHeaders, requestJson, type AuthedClient } from '../api/hc-client';
import { lookupGet } from '../api/lookup-http';

/**
 * Bills inbox: supplier bill photos saved without a purchase, across all
 * suppliers in the branch. Same PC routes the desktop Bills tab and badge use.
 */
export type InboxBill = BillRead & { supplierName: string };

export const listUnlinkedBills = (client: AuthedClient, limit = 100) =>
  lookupGet<InboxBill[]>(client, '/supplier-bills', { linked: 'false', limit });

export const countUnlinkedBills = async (client: AuthedClient) =>
  (await lookupGet<{ count: number }>(client, '/supplier-bills/unlinked-count')).count;

/** Link (or unlink with null) — always in the bill's own branch, like the desktop. */
export function linkBill(client: AuthedClient, bill: Pick<BillRead, 'id' | 'branchId'>, receivingId: string | null) {
  return requestJson<BillRead>(`${client.baseUrl}/api/v1/supplier-bills/${encodeURIComponent(bill.id)}`, {
    method: 'PATCH',
    headers: { ...authedHeaders(client), 'X-Branch-Scope': bill.branchId },
    body: JSON.stringify({ supplierReceivingId: receivingId }),
  });
}

/**
 * Link to a ledger entry: a payment, or a purchase. The PC routes a purchase
 * that received stock to its receiving, so any purchase can be chosen.
 * Needs PC 2.3.0 or later.
 */
export function linkBillToEntry(client: AuthedClient, bill: Pick<BillRead, 'id' | 'branchId'>, transactionId: string) {
  return requestJson<BillRead>(`${client.baseUrl}/api/v1/supplier-bills/${encodeURIComponent(bill.id)}`, {
    method: 'PATCH',
    headers: { ...authedHeaders(client), 'X-Branch-Scope': bill.branchId },
    body: JSON.stringify({ supplierTransactionId: transactionId }),
  });
}

/** Link a purchase: through its receiving when it has one (works on older PCs too). */
export function linkBillToPurchase(
  client: AuthedClient,
  bill: Pick<BillRead, 'id' | 'branchId'>,
  purchase: Pick<PurchaseRead, 'id' | 'supplierReceivingId'>
) {
  return purchase.supplierReceivingId
    ? linkBill(client, bill, purchase.supplierReceivingId)
    : linkBillToEntry(client, bill, purchase.id);
}

/** Soft delete on the PC (who and when are kept). With wholeBill, every page goes. */
export function deleteBill(client: AuthedClient, page: Pick<BillRead, 'id' | 'branchId'>, wholeBill: boolean) {
  return requestJson<{ deleted: number }>(
    `${client.baseUrl}/api/v1/supplier-bills/${encodeURIComponent(page.id)}?bill=${wholeBill}`,
    { method: 'DELETE', headers: { ...authedHeaders(client), 'X-Branch-Scope': page.branchId } }
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Same rule as the PC: admins any bill; employees their own unlinked bill under 24 hours. */
export function canDeleteBill(
  bill: Pick<BillRead, 'supplierReceivingId' | 'capturedAt'> & { supplierTransactionId?: string | null; capturedById?: string },
  user: { id: string; role: string } | null | undefined,
  now = Date.now()
) {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.role === 'MANAGER') return true;
  return (
    bill.capturedById === user.id &&
    !bill.supplierReceivingId &&
    !bill.supplierTransactionId &&
    now - Date.parse(bill.capturedAt) < DAY_MS
  );
}

/** The desktop only offers purchases that have a receiving document. */
export function linkablePurchases(purchases: PurchaseRead[]): (PurchaseRead & { supplierReceivingId: string })[] {
  return purchases.filter(
    (purchase): purchase is PurchaseRead & { supplierReceivingId: string } =>
      Boolean(purchase.supplierReceivingId) && purchase.status !== 'REMOVED'
  );
}

/**
 * After "Create purchase from bill": link the bill to the new purchase. A
 * purchase with received stock links through its receiving; one without
 * links to its ledger entry (PC 2.3.0+). Older PCs refuse the second kind, so
 * the bill then stays in the inbox.
 */
export async function linkAfterPurchase(
  client: AuthedClient,
  bill: Pick<BillRead, 'id' | 'branchId'>,
  created: { id?: string; supplierReceivingId: string | null }
): Promise<{ linked: boolean; message: string }> {
  if (!created.supplierReceivingId && !created.id)
    return { linked: false, message: 'The purchase was saved. Link the bill from the bills inbox.' };
  try {
    if (created.supplierReceivingId) await linkBill(client, bill, created.supplierReceivingId);
    else await linkBillToEntry(client, bill, created.id!);
    return { linked: true, message: 'The bill photo is attached to this purchase.' };
  } catch (error) {
    return {
      linked: false,
      message: `The purchase was saved, but the bill could not be attached (${
        error instanceof Error ? error.message : 'unknown error'
      }). It stays in the bills inbox.`,
    };
  }
}

export interface PaymentOption {
  id: string;
  transactionDate: string;
  amount: string;
  currency?: string;
  description: string;
}
/** Recent active payments to this supplier, newest first, to link a bill to. */
export async function listRecentPayments(client: AuthedClient, supplierId: string): Promise<PaymentOption[]> {
  const rows = await lookupGet<(PaymentOption & { type: string; status: string })[]>(
    client,
    `/suppliers/${encodeURIComponent(supplierId)}/transactions`,
    { page: 1, pageSize: 50 }
  );
  return rows.filter((row) => row.type === 'SUPPLIER_PAYMENT' && row.status === 'ACTIVE');
}

/** Every page of a bill. PCs before 2.3.0 send one page per bill. */
export const billPages = (bill: BillRead): BillRead[] => (bill.pages?.length ? bill.pages : [bill]);
export const isBillLinked = (bill: BillRead) => Boolean(bill.supplierReceivingId || bill.supplierTransactionId);
