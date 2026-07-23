export interface TransactionQueryParams {
  skip?: number;
  take?: number;
  customerId?: string;
  type?: 'SALE' | 'PAYMENT' | 'ADJUSTMENT';
  startDate?: Date;
  endDate?: Date;
}
