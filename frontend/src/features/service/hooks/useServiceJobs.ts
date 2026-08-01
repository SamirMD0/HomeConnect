import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serviceJobsApi } from '../api/service-jobs.api';
import { CreateServiceJobInput, ServiceJobFilters, UpdateServiceJobInput } from '../types/service.types';

export const serviceJobKeys = {
  all: ['service-jobs'] as const,
  list: (filters: ServiceJobFilters) => [...serviceJobKeys.all, 'list', filters] as const,
  detail: (id: string) => [...serviceJobKeys.all, 'detail', id] as const,
  customer: (id: string, filters: ServiceJobFilters) => [...serviceJobKeys.all, 'customer', id, filters] as const,
  summary: () => [...serviceJobKeys.all, 'summary'] as const,
};

export function useServiceJobs(filters: ServiceJobFilters = {}) { return useQuery({ queryKey: serviceJobKeys.list(filters), queryFn: () => serviceJobsApi.list(filters) }); }
export function useCustomerServiceJobs(customerId: string, filters: ServiceJobFilters = {}) { return useQuery({ queryKey: serviceJobKeys.customer(customerId, filters), queryFn: () => serviceJobsApi.listCustomer(customerId, filters), enabled: Boolean(customerId) }); }
export function useServiceJob(id: string) { return useQuery({ queryKey: serviceJobKeys.detail(id), queryFn: () => serviceJobsApi.get(id), enabled: Boolean(id) }); }
export function useServiceSummary() { return useQuery({ queryKey: serviceJobKeys.summary(), queryFn: serviceJobsApi.summary, refetchInterval: 30000 }); }
export function useServiceAudit(id: string, enabled: boolean) { return useQuery({ queryKey: [...serviceJobKeys.detail(id), 'audit'], queryFn: () => serviceJobsApi.audit(id), enabled: Boolean(id) && enabled }); }

function useRefreshServiceJobs() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: serviceJobKeys.all });
}
export function useCreateServiceJob() { const refresh = useRefreshServiceJobs(); return useMutation({ mutationFn: (input: CreateServiceJobInput) => serviceJobsApi.create(input), onSuccess: refresh }); }
export function useUpdateServiceJob(id: string) { const refresh = useRefreshServiceJobs(); return useMutation({ mutationFn: (input: UpdateServiceJobInput) => serviceJobsApi.update(id, input), onSuccess: refresh }); }
export function useChangeServiceStatus(id: string) { const refresh = useRefreshServiceJobs(); return useMutation({ mutationFn: (input: Parameters<typeof serviceJobsApi.status>[1]) => serviceJobsApi.status(id, input), onSuccess: refresh }); }
export function useCancelServiceJob(id: string) { const refresh = useRefreshServiceJobs(); return useMutation({ mutationFn: (input: Parameters<typeof serviceJobsApi.cancel>[1]) => serviceJobsApi.cancel(id, input), onSuccess: refresh }); }
export function useReopenServiceJob(id: string) { const refresh = useRefreshServiceJobs(); return useMutation({ mutationFn: (input: Parameters<typeof serviceJobsApi.reopen>[1]) => serviceJobsApi.reopen(id, input), onSuccess: refresh }); }
