import { api } from '../../../services/api';
export const importFields = [
  'name',
  'phone',
  'address',
  'notes',
  'creditLimit',
  'openingBalance',
  'currency',
  'dueDate',
  'isActive',
] as const;
export type ImportField = (typeof importFields)[number];
export type ImportMapping = Partial<Record<ImportField, number | null>>;
export interface CustomerImportDecision {
  rowNumber: number;
  action: 'CREATE' | 'UPDATE' | 'SKIP';
  targetCustomerId?: string;
  updateFields?: Array<'name' | 'address' | 'notes' | 'creditLimit'>;
  skipOpeningBalance?: boolean;
}
export interface CustomerImportResult {
  created: number;
  updated: number;
  skipped: number;
  invalid?: number;
  openingDebts: number;
  openingDebtTotalUsd: string;
  reportCsv?: string;
}
export interface CustomerImportPreview {
  id: string;
  branchId: string;
  branch: { id: string; name: string };
  fileName: string;
  status: 'DRAFT' | 'COMMITTED';
  headers: string[];
  columnMapping: ImportMapping;
  previousCommittedImport: { id: string; fileName: string } | null;
  summary: { total: number; ready: number; conflicts: number; invalid: number };
  planned: CustomerImportResult;
  rows: Array<{
    rowNumber: number;
    phoneKey: string;
    name: string;
    phone: string;
    address?: string;
    notes?: string;
    creditLimit?: string | null;
    openingBalance: string;
    currency: 'USD' | 'LBP';
    status: 'READY' | 'CONFLICT' | 'INVALID';
    issues: string[];
    conflicts: Array<{ kind: string; message: string; blocking: boolean }>;
    matches: Array<{ id: string; name: string; hasImportedOpeningDebt: boolean }>;
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
    data: { columnMapping?: ImportMapping; decisions?: CustomerImportDecision[] }
  ) => (await api.patch<{ data: CustomerImportPreview }>(base + '/' + id, data)).data.data,
  commit: async (id: string, decisions: CustomerImportDecision[], accountPassword?: string) =>
    (
      await api.post<{ data: CustomerImportResult }>(base + '/' + id + '/commit', {
        decisions,
        ...(accountPassword ? { accountPassword } : {}),
      })
    ).data.data,
};
