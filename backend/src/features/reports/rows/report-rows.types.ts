export type ReportSlice =
  | 'customers-new'
  | 'customers-debts'
  | 'customers-payments'
  | 'customers-aging'
  | 'customers-not-paid'
  | 'customers-paid'
  | 'suppliers-debts'
  | 'suppliers-receiving'
  | 'sales-orders'
  | 'sales-unpaid'
  | 'inventory-movements'
  | 'inventory-reconciliation'
  | 'products-bought';

export interface ReportRowsData<Row = unknown, Summary = Record<string, unknown>> {
  summary: Summary;
  rows: Row[];
  operationalSnapshot?: boolean;
}
