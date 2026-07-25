export interface TransactionQueryParams {
  skip?: number;
  take?: number;
  customerId?: string;
  type?: 'ONE_TIME' | 'INSTALLMENT' | 'PAYMENT' | 'ADJUSTMENT';
  startDate?: Date;
  endDate?: Date;
}
