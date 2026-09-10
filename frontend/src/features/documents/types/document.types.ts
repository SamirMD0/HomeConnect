export interface BusinessSettings {
  id: string;
  shopName: string | null;
  address: string | null;
  phone: string | null;
  taxNumber: string | null;
  logoUrl: string | null;
  email: string | null;
  updatedAt: string | null;
}

export type UpdateBusinessSettingsInput = Pick<
  BusinessSettings,
  'shopName' | 'address' | 'phone' | 'taxNumber' | 'logoUrl' | 'email'
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
  customer: { id: string; name: string; phone: string; address: string | null };
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
