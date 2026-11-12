import { authedHeaders, requestJson, type AuthedClient } from '../api/hc-client';
import { lookupGet } from '../api/lookup-http';
import { decimalInput } from '../sales/payloads';

/**
 * Prepaid purchases: a customer pays ahead for an item the shop delivers later.
 * Same routes and payloads as the desktop prepaid page and the customer
 * financial page (frontend/src/features/prepaid, customer-financial).
 * Creating, delivering and converting are administrator actions on the PC.
 */

export type PrepaidStatus = 'PENDING' | 'DELIVERED' | 'CANCELLED';
export type PrepaidStatusFilter = 'ALL' | PrepaidStatus;

export interface PrepaidPayment {
  id: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  isVoided: boolean;
}

export interface PrepaidPurchase {
  id: string;
  branchId?: string;
  customer: { id: string; name: string; phone: string };
  itemName: string;
  fullAmount: string;
  amountPaid: string;
  remainingToCollect: string;
  isFullyPaid: boolean;
  status: PrepaidStatus;
  notes: string | null;
  deliveredAt: string | null;
  deliveryNotes: string | null;
  remainderDebtId: string | null;
  remainderInstallmentPlanId: string | null;
  payments: PrepaidPayment[];
  createdAt: string;
}

export interface PrepaidList {
  summary: { totalRemainingToCollect: string; pendingCount: number; deliveredCount: number };
  items: PrepaidPurchase[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export const statusLabels: Record<PrepaidStatus, string> = {
  PENDING: 'Awaiting delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

// ------------------------------------------------------------------ payloads

export interface CreatePrepaidPayload {
  itemName: string;
  paymentAmount: string;
  fullAmount: string;
  notes: string | null;
}

export function buildCreatePayload(form: {
  itemName: string;
  paymentAmount: string;
  fullAmount: string;
  notes: string;
}): CreatePrepaidPayload {
  const itemName = form.itemName.trim();
  if (!itemName) throw new Error('Enter the item name.');
  if (itemName.length > 200) throw new Error('Item name is too long.');
  const fullAmount = decimalInput(form.fullAmount);
  const paymentAmount = decimalInput(form.paymentAmount);
  if (fullAmount === '0.00') throw new Error('The full price must be greater than zero.');
  if (paymentAmount === '0.00') throw new Error('The first payment must be greater than zero.');
  if (cents(paymentAmount) > cents(fullAmount)) throw new Error('The payment cannot exceed the full price.');
  const notes = form.notes.trim();
  if (notes.length > 1000) throw new Error('Notes are too long.');
  return { itemName, paymentAmount, fullAmount, notes: notes || null };
}

export interface DeliverPayload {
  remainderDueDate: string | null;
  deliveryNotes: string | null;
}

/** A due date is needed only when money is still owed after handing the item over. */
export function buildDeliverPayload(
  item: Pick<PrepaidPurchase, 'isFullyPaid' | 'status'>,
  form: { remainderDueDate: string; deliveryNotes: string }
): DeliverPayload {
  if (item.status !== 'PENDING') throw new Error('Only items awaiting delivery can be delivered.');
  const due = form.remainderDueDate.trim();
  if (!item.isFullyPaid) {
    if (!isDate(due)) throw new Error('Enter the due date for the unpaid remainder (YYYY-MM-DD).');
  }
  const notes = form.deliveryNotes.trim();
  if (notes.length > 1000) throw new Error('Delivery notes are too long.');
  return { remainderDueDate: item.isFullyPaid ? null : due, deliveryNotes: notes || null };
}

export type ConvertPayload =
  | { mode: 'DEBT'; dueDate: string }
  | { mode: 'INSTALLMENT'; startDate: string; installmentCount: number; frequency: 'MONTHLY' | 'WEEKLY' };

/** Convert hands the item over and turns the unpaid remainder into a debt or installments. */
export function buildConvertPayload(item: Pick<PrepaidPurchase, 'isFullyPaid' | 'status'>, form: {
  mode: 'DEBT' | 'INSTALLMENT';
  date: string;
  installmentCount: string;
  frequency: 'MONTHLY' | 'WEEKLY';
}): ConvertPayload {
  if (item.status !== 'PENDING') throw new Error('Only items awaiting delivery can be converted.');
  if (item.isFullyPaid)
    throw new Error('This item is fully paid, so there is nothing to convert. Mark it as delivered instead.');
  const date = form.date.trim();
  if (!isDate(date)) throw new Error('Enter a date as YYYY-MM-DD.');
  if (form.mode === 'DEBT') return { mode: 'DEBT', dueDate: date };
  const count = Number(form.installmentCount.trim());
  if (!Number.isInteger(count) || count < 1 || count > 120)
    throw new Error('Installments must be a whole number from 1 to 120.');
  return { mode: 'INSTALLMENT', startDate: date, installmentCount: count, frequency: form.frequency };
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cents(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole ?? '0') * 100n + BigInt(fraction.padEnd(2, '0'));
}

// ---------------------------------------------------------------------- API

export const listPrepaid = (
  client: AuthedClient,
  filters: { status: PrepaidStatusFilter; search?: string; customerId?: string; page?: number }
) =>
  lookupGet<PrepaidList>(client, '/prepaid-purchases', {
    status: filters.status,
    ...(filters.search ? { search: filters.search } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    page: filters.page ?? 1,
    pageSize: 25,
  });

export const getPrepaid = (client: AuthedClient, id: string) =>
  lookupGet<PrepaidPurchase>(client, `/prepaid-purchases/${encodeURIComponent(id)}`);

function post<T>(client: AuthedClient, path: string, body: object, branchId?: string) {
  return requestJson<T>(`${client.baseUrl}/api/v1${path}`, {
    method: 'POST',
    headers: { ...authedHeaders(client), ...(branchId ? { 'X-Branch-Scope': branchId } : {}) },
    body: JSON.stringify(body),
  });
}

export const createPrepaid = (client: AuthedClient, customerId: string, payload: CreatePrepaidPayload) =>
  post<{ id: string }>(client, `/customers/${encodeURIComponent(customerId)}/prepaid-purchases`, payload);

export const deliverPrepaid = (client: AuthedClient, item: PrepaidPurchase, payload: DeliverPayload) =>
  post<PrepaidPurchase>(client, `/prepaid-purchases/${encodeURIComponent(item.id)}/deliver`, payload, item.branchId);

export const convertPrepaid = (client: AuthedClient, item: PrepaidPurchase, payload: ConvertPayload) =>
  post<PrepaidPurchase>(client, `/prepaid-purchases/${encodeURIComponent(item.id)}/convert`, payload, item.branchId);
