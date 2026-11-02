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
  branchId: string;
}
export type BalanceChangeKind =
  | 'NEW'
  | 'NONE'
  | 'NO_INFO'
  | 'INCREASE'
  | 'DECREASE'
  | 'CURRENCY_MISMATCH';
export interface BalanceChange {
  kind: BalanceChangeKind;
  current: string;
  file: string | null;
  difference: string;
}
export interface CustomerImportResult {
  created: number;
  updated: number;
  skipped: number;
  invalid?: number;
  openingDebts: number;
  openingDebtTotalUsd: string;
  balanceIncreases: number;
  balanceIncreaseTotalUsd: string;
  balancePayments: number;
  balancePaymentTotalUsd: string;
  dueDateRequired?: boolean;
  reportCsv?: string;
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
    currency: 'USD' | 'LBP';
    dueDate?: string | null;
    branchId: string;
    branchName: string;
    balance: BalanceChange;
    status: 'READY' | 'CONFLICT' | 'INVALID';
    issues: string[];
    conflicts: Array<{ kind: string; message: string; blocking: boolean }>;
    matches: Array<{ id: string; name: string }>;
    decision: CustomerImportDecision;
  }>;
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
      rowBranches?: RowBranch[];
    }
  ) => (await api.patch<{ data: CustomerImportPreview }>(base + '/' + id, data)).data.data,
  commit: async (
    id: string,
    decisions: CustomerImportDecision[],
    accountPassword?: string,
    dueDate?: string
  ) =>
    (
      await api.post<{ data: CustomerImportResult }>(base + '/' + id + '/commit', {
        decisions,
        ...(accountPassword ? { accountPassword } : {}),
        ...(dueDate ? { dueDate } : {}),
      })
    ).data.data,
};
