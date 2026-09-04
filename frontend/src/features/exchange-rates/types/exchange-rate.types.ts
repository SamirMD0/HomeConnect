export interface ExchangeRateRecord {
  id: string;
  fromCurrency: 'USD';
  toCurrency: 'LBP';
  rate: string;
  effectiveFrom: string;
  createdAt: string;
  note: string | null;
  createdBy: { id: string; fullName: string; username: string };
}

export interface CreateExchangeRateInput {
  rate: string;
  effectiveFrom: string;
  note?: string | null;
}

export interface ApiResponse<T> { success: boolean; data: T }
