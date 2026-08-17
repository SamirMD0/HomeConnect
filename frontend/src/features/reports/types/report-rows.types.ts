import type { MonthlyReviewMeta, MonthlyReviewQuery } from './monthly-review.types';

export type ReportSlice =
  | 'customers-new' | 'customers-debts' | 'customers-payments'
  | 'customers-aging' | 'customers-not-paid' | 'customers-paid'
  | 'suppliers-debts' | 'suppliers-receiving'
  | 'sales-orders' | 'sales-unpaid'
  | 'inventory-movements' | 'inventory-reconciliation'
  | 'products-bought';

export interface ReportRowsEnvelope<Row = ReportRow> {
  meta: MonthlyReviewMeta;
  data: { summary: Record<string, string | number | boolean | Record<string, unknown>>; rows: Row[]; operationalSnapshot?: boolean };
}

export interface NamedParty { id: string; name: string; phone?: string; companyName?: string | null }

export type ReportRow =
  | { id: string; name: string; phone: string; isActive: boolean; createdOn: string }
  | { customer: NamedParty; totalOutstanding: string; amountDueByCutoff: string; overdueAmountAtCutoff: string; lastPaymentDate: string | null }
  | { id: string; customer: NamedParty; amount: string; paymentDate: string; paymentMethod: string; reference: string | null }
  | { id: string; supplier: NamedParty; type: string; direction: string; amount: string; transactionDate: string; description: string; reference: string | null; receiptNumber: string | null }
  | { id: string; supplier: NamedParty | null; referenceNumber: string | null; receivedOn: string; status: string; lineCount: number; totalQuantity: number; linkedDebt: { id: string; amount: string } | null }
  | { id: string; orderNumber: string; orderDate: string; customer: NamedParty | null; paymentStatus: string; fulfillmentStatus: string; totalAmount: string; paidAmount: string; remainingAmount: string }
  | { id: string; product: { id: string; name: string; sku: string }; movementType: string; quantityChange: number; quantityBefore: number; quantityAfter: number; reason: string; createdAt: string }
  | { receivingId: string; referenceNumber: string | null; receivedOn: string; supplier: NamedParty | null; sku: string; productName: string; quantity: number; status: 'OK' | 'MISMATCH'; issues: string[] }
  | { debtId: string; customer: NamedParty; description: string; reference: string | null; createdOn: string; dueDate: string; originalAmount: string; paidAmount: string; remainingAmount: string; daysUnpaid: number; bucket: string; lastPaymentDate: string | null; status: string }
  | { customer: NamedParty; openingBalance: string; newDebt: string; paidInPeriod: string; closingBalance: string; paymentCount: number; unpaidDebtCount: number; lastPaymentDate: string | null; daysSinceLastPayment: number | null; riskLabels: string[] }
  | { itemId: string; product: { id: string; name: string; sku: string }; sku: string; barcode: string | null; currentStock: number; supplier: NamedParty | null; receivingId: string; referenceNumber: string | null; receivedOn: string; quantity: number; status: 'ACTIVE' | 'REVERSED'; soldInPeriod: number; linkedDebt: { id: string; amount: string } | null };

export type ReportRowsQuery = MonthlyReviewQuery;

export interface ReportSliceDefinition {
  slice: ReportSlice;
  label: string;
  operational?: boolean;
}
