import { api } from '../../../services/api';

export type CustomerStandingTier =
  | 'NO_ACTIVITY'
  | 'CURRENT'
  | 'WATCH'
  | 'LATE'
  | 'SEVERE'
  | 'CRITICAL';

/**
 * Per-customer money, sent only when the caller asks for `include: 'financial'`.
 *
 * Every amount is a decimal string straight from the backend's receivables
 * computation. Format it, compare it, but never total these client-side — the
 * server is the only place allowed to add money up.
 */
export interface CustomerFinancialSnapshot {
  customerId: string;
  tier: CustomerStandingTier;
  tierReason: string;
  totalObligated: string;
  totalPaid: string;
  outstanding: string;
  overdueAmount: string;
  openDebtCount: number;
  activePlanCount: number;
  overdueItemCount: number;
  maxOverdueDays: number;
  nextDueDate: string | null;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Present only on searched list responses. */
  matchedInNotesOnly?: boolean;
  /** Present only when the request opted into `include: 'financial'`. */
  financial?: CustomerFinancialSnapshot | null;
}

export interface CustomersResponse {
  success: boolean;
  data: Customer[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
    };
  };
}

export interface CustomerResponse {
  success: boolean;
  data: Customer;
}

export interface CustomerSearchSuggestion { query: string; count: number }
export interface CustomerActivityItem { id: string; type: string; at: string; label: string; amount: string | null; actor: string | null; recordId: string }
export type CustomerListFilter = 'withBalance' | 'overdue' | 'noDebt' | 'inactive';
export interface CustomerListParams {
  page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: string;
  include?: 'financial'; filter?: CustomerListFilter;
}

export const customersApi = {
  getCustomers: async (params?: CustomerListParams) => {
    const response = await api.get<CustomersResponse>('/customers', { params });
    return response.data;
  },

  getSearchSuggestions: async (q: string) => {
    const response = await api.get<{ success: boolean; data: { suggestions: CustomerSearchSuggestion[] } }>('/customers/search-suggestions', { params: { q, limit: 3 } });
    return response.data.data.suggestions;
  },
  getActivity: async (customerId: string) => {
    const response = await api.get<{ data: { items: CustomerActivityItem[] } }>(`/customers/${customerId}/activity`, { params: { limit: 50 } });
    return response.data.data.items;
  },

  getCustomer: async (id: string) => {
    const response = await api.get<CustomerResponse>(`/customers/${id}`);
    return response.data.data;
  },

  createCustomer: async (data: { name: string; phone: string; address?: string; notes?: string }) => {
    const response = await api.post<CustomerResponse>('/customers', data);
    return response.data.data;
  },

  updateCustomer: async (id: string, data: { name?: string; phone?: string; address?: string | null; notes?: string | null; isActive?: boolean }) => {
    const response = await api.put<CustomerResponse>(`/customers/${id}`, data);
    return response.data.data;
  },

  deleteCustomer: async (id: string) => {
    const response = await api.delete(`/customers/${id}`);
    return response.data;
  },
};
