import { AuthedClient, authedHeaders, requestJson } from './hc-client';

export type LedgerEntryType = 'PU' | 'PV' | 'ADJ' | 'OPENING' | 'OTHER';

export interface SupplierLedgerEntry {
  id: string;
  date: string;
  maturityDate: string | null;
  type: LedgerEntryType;
  rawType: string;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  currency: 'USD' | 'LBP';
  branch: string | null;
}

export interface SupplierLedgerResult {
  supplierId: string;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  entries: SupplierLedgerEntry[];
  page: number;
  totalPages: number;
}

export interface FetchLedgerInput {
  supplierId: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  balanceBeforePage?: number;
}

interface ServerEntry {
  id: string;
  type: string;
  direction: 'INCREASE_OWED' | 'DECREASE_OWED';
  baseAmount: string;
  transactionDate: string;
  dueDate: string | null;
  reference: string | null;
  description: string;
}

interface ServerLedger {
  summary: { totalOwed: string; balance: string };
  items: ServerEntry[];
  pagination: { page: number; totalPages: number };
}

function entryType(rawType: string): LedgerEntryType {
  switch (rawType) {
    case 'PU':
    case 'SUPPLIER_DEBT': return 'PU';
    case 'PV':
    case 'SUPPLIER_PAYMENT': return 'PV';
    case 'ADJ':
    case 'SUPPLIER_ADJUSTMENT':
    case 'SUPPLIER_CREDIT': return 'ADJ';
    case 'OPENING': return 'OPENING';
    default: return 'OTHER';
  }
}

function previousDate(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

function ledgerUrl(client: AuthedClient, input: FetchLedgerInput, to?: string): string {
  const query = new URLSearchParams({
    supplierId: input.supplierId,
    page: String(input.page ?? 1),
    pageSize: String(input.pageSize ?? 25),
    sortBy: 'transactionDate',
    sortOrder: 'asc',
  });
  if (input.from && to === undefined) query.set('dateFrom', input.from);
  if (to ?? input.to) query.set('dateTo', to ?? input.to!);
  return `${client.baseUrl}/api/v1/supplier-ledger?${query.toString()}`;
}

export async function fetchSupplierLedger(
  client: AuthedClient,
  input: FetchLedgerInput,
): Promise<SupplierLedgerResult> {
  const init = { headers: authedHeaders(client) };
  const [ledger, prior] = await Promise.all([
    requestJson<ServerLedger>(ledgerUrl(client, input), init),
    input.from
      ? requestJson<ServerLedger>(ledgerUrl(client, { ...input, page: 1, pageSize: 1 }, previousDate(input.from)), init)
      : Promise.resolve(null),
  ]);

  // Supplier ledger totals and running balances use its USD baseAmount, even
  // when a transaction was originally entered in LBP.
  const openingBalance = Number(prior?.summary.balance ?? 0);
  const totalDebit = Number(ledger.summary.totalOwed);
  const change = Number(ledger.summary.balance);
  let balance = input.balanceBeforePage ?? openingBalance;
  const entries = ledger.items.map((item): SupplierLedgerEntry => {
    const amount = Number(item.baseAmount);
    const debit = item.direction === 'INCREASE_OWED' ? amount : 0;
    const credit = item.direction === 'DECREASE_OWED' ? amount : 0;
    balance = Math.round((balance + debit - credit) * 100) / 100;
    return {
      id: item.id,
      date: item.transactionDate,
      maturityDate: item.dueDate,
      type: entryType(item.type),
      rawType: item.type,
      reference: item.reference,
      description: item.description,
      debit,
      credit,
      balance,
      currency: 'USD',
      branch: null,
    };
  });

  return {
    supplierId: input.supplierId,
    openingBalance,
    closingBalance: Math.round((openingBalance + change) * 100) / 100,
    totalDebit,
    totalCredit: Math.round((totalDebit - change) * 100) / 100,
    entries,
    page: ledger.pagination.page,
    totalPages: ledger.pagination.totalPages,
  };
}
