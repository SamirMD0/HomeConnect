export type TransactionType = 'SALE' | 'PAYMENT' | 'ADJUSTMENT';

export interface Transaction {
  id: string;
  customerId: string;
  type: TransactionType;
  amount: number;
  description: string;
  date: string;
  dueDate?: string | null;
  referenceNumber: string | null;
  metadata: Record<string, any> | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  runningBalance?: number;
  customer?: {
    id: string;
    name: string;
    phone: string;
  };
  user?: {
    id: string;
    fullName: string;
    username: string;
  };
}

export interface CreateTransactionDto {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  type: TransactionType;
  amount: number;
  description: string;
  date?: string;
  dueDate?: string | null;
  referenceNumber?: string;
  metadata?: Record<string, any>;
}

export interface UpdateTransactionDto {
  amount?: number;
  description?: string;
  date?: string;
  dueDate?: string | null;
  referenceNumber?: string | null;
  metadata?: Record<string, any> | null;
}

export interface TransactionQueryOptions {
  page?: number;
  limit?: number;
  customerId?: string;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
}

export interface TransactionResponse {
  success: boolean;
  data: Transaction;
  meta: {
    timestamp: string;
  };
}

export interface TransactionListResponse {
  success: boolean;
  data: Transaction[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
    timestamp: string;
  };
}
