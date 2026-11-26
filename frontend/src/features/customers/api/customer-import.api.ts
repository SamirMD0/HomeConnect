import { api } from '../../../services/api';
export const importFields = [
  'name',
  'phone',
  'accountCode',
  'address',
  'notes',
  'creditLimit',
  'openingBalance',
  'currency',
  'dueDate',
  'isActive',
  'branch',
] as const;
export type ImportField = (typeof importFields)[number];
export type ImportMapping = Partial<Record<ImportField, number | null>>;
export interface CustomerImportDecision {
  rowNumber: number;
  action: 'CREATE' | 'UPDATE' | 'SKIP';
  targetCustomerId?: string;
  updateFields?: Array<'name' | 'address' | 'notes' | 'creditLimit'>;
  /** Make no money change on this row. */
  skipOpeningBalance?: boolean;
}
export interface RowBranch {
  rowNumber: number;
  /** null returns the row to the customer's own branch. */
  branchId: string | null;
}
export type BalanceChangeKind =
  'NEW' | 'NONE' | 'NO_INFO' | 'INCREASE' | 'DECREASE' | 'CURRENCY_MISMATCH';
/** ADD records the difference as a deposit; LOWER is reported only, never applied. */
export interface DepositChange {
  kind: 'NONE' | 'ADD' | 'LOWER';
  current: string;
  file: string;
  difference: string;
}
export interface BalanceChange {
  kind: BalanceChangeKind;
  current: string;
  file: string | null;
  difference: string;
  /** Older drafts predate deposits. */
  deposit?: DepositChange;
}
/** One reconciliation line per destination branch on the Confirm step. */
export interface ImportBranchTotal {
  branchId: string;
  branchName: string;
  rows: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  conflicts: number;
  fileDebtUsd: string;
  fileDepositUsd: string;
  newDebtUsd: string;
  increaseUsd: string;
  paymentUsd: string;
  /** Part of paymentUsd: customers no longer in the file, settled to zero. */
  settledMissingUsd?: string;
  depositUsd: string;
  netDebtChangeUsd: string;
  openBeforeUsd: string;
  openAfterUsd: string;
  /** Old system balance: file debits minus file credits. */
  fileBalanceUsd?: string;
  /** HomeConnect after the import, on the same basis: owed minus deposits held. */
  balanceAfterUsd?: string;
  depositsHeldAfterUsd?: string;
}
/** A main-branch customer the row resembles. Shown for reading only; never changed. */
export interface MainBranchMatch {
  id: string;
  name: string;
  phone: string;
  branchName: string;
  matchedBy: 'ACCOUNT' | 'PHONE' | 'NAME' | 'SIMILAR_NAME';
  balanceUsd: string;
}
export interface CustomerImportResult {
  created: number;
  updated: number;
  skipped: number;
  invalid?: number;
  moved: number;
  openingDebts: number;
  openingDebtTotalUsd: string;
  balanceIncreases: number;
  balanceIncreaseTotalUsd: string;
  balancePayments: number;
  balancePaymentTotalUsd: string;
  deposits?: number;
  depositTotalUsd?: string;
  depositsUsed?: number;
  depositUsedTotalUsd?: string;
  /** Customers no longer in the trial balance whose HomeConnect debt was settled. */
  settledMissing?: number;
  settledMissingTotalUsd?: string;
  branchTotals?: ImportBranchTotal[];
  dueDateRequired?: boolean;
  reportCsv?: string;
}
export type MissingDecision = 'SETTLE' | 'KEEP';
/**
 * A customer an earlier import brought in who still owes in HomeConnect but is not in this
 * trial balance. The old system leaves out accounts at zero, so they most likely paid in full.
 */
export interface MissingCustomer {
  customerId: string;
  name: string;
  branchId: string;
  branchName: string;
  accountCode: string | null;
  owed: Array<{ currency: 'USD' | 'LBP'; amount: string }>;
  lastSeen: { fileName: string; date: string; balance: string; currency: 'USD' | 'LBP' } | null;
  activitySinceLastImport: boolean;
  decision: MissingDecision;
}
export interface MissingChoice {
  customerId: string;
  action: MissingDecision;
}
export interface CustomerImportPreview {
  id: string;
  branchId: string;
  branch: { id: string; name: string };
  fileName: string;
  status: 'DRAFT' | 'COMMITTED';
  headers: string[];
  format?: 'TRIAL_BALANCE';
  columnMapping: ImportMapping;
  branches: Array<{ id: string; code: string; name: string }>;
  previousCommittedImport: { id: string; fileName: string } | null;
  summary: { total: number; ready: number; conflicts: number; invalid: number };
  planned: CustomerImportResult;
  rows: Array<{
    rowNumber: number;
    phoneKey: string;
    accountCode?: string;
    identityKey?: string;
    name: string;
    phone: string;
    address?: string;
    notes?: string;
    creditLimit?: string | null;
    openingBalance: string;
    /** Credit balance in the file, imported as a deposit. */
    deposit?: string;
    currency: 'USD' | 'LBP';
    dueDate?: string | null;
    branchId: string;
    branchName: string;
    chosenBranch: boolean;
    matchedBy: 'ACCOUNT' | 'PHONE' | 'NAME' | 'MOVE' | null;
    moveFrom: { branchId: string; branchName: string } | null;
    existingBranches: Array<{ id: string; name: string }>;
    balance: BalanceChange;
    status: 'READY' | 'CONFLICT' | 'INVALID';
    issues: string[];
    conflicts: Array<{ kind: string; message: string; blocking: boolean }>;
    matches: Array<{ id: string; name: string }>;
    mainMatches?: MainBranchMatch[];
    decision: CustomerImportDecision;
  }>;
  /** Older drafts predate this list. */
  missing?: MissingCustomer[];
  result: CustomerImportResult | null;
}
const base = '/customers/imports';
export const customerImportsApi = {
  create: async (branchId: string, fileName: string, csvText: string) =>
    (await api.post<{ data: CustomerImportPreview }>(base, { branchId, fileName, csvText })).data
      .data,
  update: async (
    id: string,
    data: {
      columnMapping?: ImportMapping;
      decisions?: CustomerImportDecision[];
      missing?: MissingChoice[];
      rowBranches?: RowBranch[];
    }
  ) => (await api.patch<{ data: CustomerImportPreview }>(base + '/' + id, data)).data.data,
  commit: async (
    id: string,
    decisions: CustomerImportDecision[],
    accountPassword?: string,
    dueDate?: string,
    missing?: MissingChoice[]
  ) =>
    (
      await api.post<{ data: CustomerImportResult }>(base + '/' + id + '/commit', {
        decisions,
        ...(missing?.length ? { missing } : {}),
        ...(accountPassword ? { accountPassword } : {}),
        ...(dueDate ? { dueDate } : {}),
      })
    ).data.data,
};
