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

/** The desktop only offers purchases that have a receiving document. */
export function linkablePurchases(purchases: PurchaseRead[]): (PurchaseRead & { supplierReceivingId: string })[] {
  return purchases.filter(
    (purchase): purchase is PurchaseRead & { supplierReceivingId: string } =>
      Boolean(purchase.supplierReceivingId) && purchase.status !== 'REMOVED'
  );
}

/**
 * After "Create purchase from bill": link when the new purchase received stock.
 * A purchase without received stock has no receiving document, so the bill
 * cannot be attached to it (same rule as the PC) and stays in the inbox.
 */
export async function linkAfterPurchase(
  client: AuthedClient,
  bill: Pick<BillRead, 'id' | 'branchId'>,
  created: { supplierReceivingId: string | null }
): Promise<{ linked: boolean; message: string }> {
  if (!created.supplierReceivingId)
    return {
      linked: false,
      message:
        'The purchase was saved without receiving stock, so the bill cannot be attached to it. It stays in the bills inbox.',
    };
  try {
    await linkBill(client, bill, created.supplierReceivingId);
    return { linked: true, message: 'The bill photo is attached to this purchase.' };
  } catch (error) {
    return {
      linked: false,
      message: `The purchase was saved, but the bill could not be attached (${
        error instanceof Error ? error.message : 'unknown error'
      }). Link it from the bills inbox.`,
    };
  }
}
