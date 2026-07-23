import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '../api/customers.api';
import toast from 'react-hot-toast';

export const useCustomers = (params?: { page?: number; limit?: number; search?: string; sortBy?: string; sortOrder?: string }) => {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => customersApi.getCustomers(params),
    placeholderData: (previousData) => previousData, // keep previous data while fetching new (e.g. for pagination/search)
  });
};

export const useCustomer = (id: string) => {
  return useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersApi.getCustomer(id),
    enabled: !!id,
  });
};

export const useCreateCustomer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: customersApi.createCustomer,
    onSuccess: () => {
      toast.success('Customer created successfully');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to create customer';
      toast.error(message);
    },
  });
};

export const useUpdateCustomer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof customersApi.updateCustomer>[1] }) => 
      customersApi.updateCustomer(id, data),
    onSuccess: (_data, variables) => {
      toast.success('Customer updated successfully');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer', variables.id] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to update customer';
      toast.error(message);
    },
  });
};

export const useDeleteCustomer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: customersApi.deleteCustomer,
    onSuccess: () => {
      toast.success('Customer deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (error: any) => {
      const message = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to delete customer';
      toast.error(message);
    },
  });
};
