import { api } from '../../../services/api';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

export const customersApi = {
  getCustomers: async (params?: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: string }) => {
    const response = await api.get<CustomersResponse>('/customers', { params });
    return response.data;
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
