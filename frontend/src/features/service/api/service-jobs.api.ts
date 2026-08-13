import { api } from '../../../services/api';
import {
  CreateServiceJobInput, PaginationMeta, ServiceAudit, ServiceJob,
  ServiceJobFilters, ServiceJobStatus, ServiceSummary, UpdateServiceJobInput,
} from '../types/service.types';

export function serviceJobParams(filters: ServiceJobFilters = {}) {
  return Object.fromEntries(Object.entries(filters).flatMap(([key, value]) => {
    if (value === undefined || value === '') return [];
    return [[key, Array.isArray(value) ? value.join(',') : value]];
  }));
}

export const serviceJobsApi = {
  list: async (filters: ServiceJobFilters = {}): Promise<{ items: ServiceJob[]; pagination: PaginationMeta }> => {
    const response = await api.get('/service-jobs', { params: serviceJobParams(filters) });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  listCustomer: async (customerId: string, filters: ServiceJobFilters = {}): Promise<{ items: ServiceJob[]; pagination: PaginationMeta }> => {
    const response = await api.get(`/customers/${customerId}/service-jobs`, { params: serviceJobParams(filters) });
    return { items: response.data.data, pagination: response.data.meta.pagination };
  },
  get: async (id: string): Promise<ServiceJob> => (await api.get(`/service-jobs/${id}`)).data.data,
  create: async (input: CreateServiceJobInput): Promise<ServiceJob> => (await api.post('/service-jobs', input)).data.data,
  update: async (id: string, input: UpdateServiceJobInput): Promise<ServiceJob> => (await api.patch(`/service-jobs/${id}`, input)).data.data,
  status: async (id: string, input: { status: ServiceJobStatus; sentToCompanyDate?: string | null; receivedFromCompanyDate?: string | null; returnedToCustomerDate?: string | null }): Promise<ServiceJob> => (await api.post(`/service-jobs/${id}/status`, input)).data.data,
  cancel: async (id: string, input: { reason: string; accountPassword: string }): Promise<ServiceJob> => (await api.post(`/service-jobs/${id}/cancel`, input)).data.data,
  reopen: async (id: string, input: { status: ServiceJobStatus; reason: string; accountPassword: string }): Promise<ServiceJob> => (await api.post(`/service-jobs/${id}/reopen`, input)).data.data,
  audit: async (id: string): Promise<ServiceAudit[]> => (await api.get(`/service-jobs/${id}/audit`)).data.data,
  summary: async (): Promise<ServiceSummary> => (await api.get('/service-jobs/summary')).data.data,
};
