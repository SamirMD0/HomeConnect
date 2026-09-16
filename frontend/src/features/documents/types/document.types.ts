export interface BusinessSettings {
  id: string;
  shopName: string | null;
  address: string | null;
  phone: string | null;
  taxNumber: string | null;
  logoUrl: string | null;
  email: string | null;
  returnWindowDays: number;
  updatedAt: string | null;
}

export type UpdateBusinessSettingsInput = Pick<
  BusinessSettings,
  'shopName' | 'address' | 'phone' | 'taxNumber' | 'logoUrl' | 'email' | 'returnWindowDays'
>;

export interface DocumentPdfOptions {
  suggestedName: string;
  paper: 'A4' | 'LETTER';
  orientation: 'portrait' | 'landscape';
}

export interface PaymentReceiptUser {
  id: string;
  name: string;
  username: string;
}

export interface PaymentReceipt {
  id: string;
  customer: { id: string; name: string; phone: string; address: string | null } | null;
  sourceSnapshot?: Record<string, unknown> | null;
  sourceSalesOrder?: { id: string; orderNumber: string } | null;
  totalAmount: string;
  currency: 'USD' | 'LBP';
  exchangeRate: string;
  baseAmount: string;
  paymentDate: string;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
  reference: string | null;
  notes: string | null;
  createdAt: string;
  receivedBy: PaymentReceiptUser;
  allocations: Array<{
    id: string;
    targetType: 'DEBT' | 'INSTALLMENT';
    targetId: string;
    obligationId: string;
    description: string;
    amount: string;
    currency: 'USD' | 'LBP';
    paymentAmount: string;
    paymentCurrency: 'USD' | 'LBP';
    exchangeRate: string;
  }>;
  remainingBalances: Array<{
    obligationType: 'DEBT' | 'INSTALLMENT_PLAN';
    obligationId: string;
    description: string;
    amount: string;
    currency: 'USD' | 'LBP';
  }>;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: PaymentReceiptUser | null;
}

export type CustomerStatementEntryStatus = 'POSTED' | 'VOIDED' | 'CANCELLED';

export interface CustomerStatement {
  businessDate: string;
  currency: 'USD';
  customer: { id: string; name: string; phone: string; address: string | null };
  range: { from: string; to: string };
  openingBalance: string;
  entries: Array<{
    id: string;
    type: 'DEBT' | 'INSTALLMENT' | 'PAYMENT' | 'RETURN';
    date: string;
    description: string;
    reference: string | null;
    originalAmount: string;
    currency: 'USD' | 'LBP';
    exchangeRate: string;
    baseAmount: string;
    balanceEffect: string;
    runningBalance: string;
    status: CustomerStatementEntryStatus;
    dueDate: string | null;
    reason: string | null;
  }>;
  closingBalance: string;
  aging: {
    asOf: string;
    total: string;
    buckets: Array<{ key: string; label: string; amount: string }>;
  };
}
