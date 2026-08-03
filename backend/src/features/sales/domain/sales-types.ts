import { Role } from '@prisma/client';

export interface SalesMutationUser {
  userId: string;
  role: Role | string;
}

export interface SalesRequestContext {
  requestId?: string | null;
  ipAddress?: string | null;
}

export interface SalesOrderLineMoneyInput {
  quantity: number;
  unitPrice: string;
  discountAmount?: string | null;
}

export interface SalesOrderMoneyInput {
  items: SalesOrderLineMoneyInput[];
  deliveryFee?: string | null;
  paidAmount?: string | null;
}

export interface SalesOrderMoneyTotals {
  lineTotals: string[];
  itemsSubtotal: string;
  deliveryFee: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
}
