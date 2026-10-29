import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  assignedUserCount?: number;
}
export interface BranchInput {
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
}
export interface StaffBranchAccess {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMIN' | 'EMPLOYEE';
  isActive: boolean;
  allBranches: boolean;
  branchIds: string[];
}

export const branchesApi = {
  list: async (): Promise<Branch[]> => (await api.get('/branches')).data.data,
  accessible: async (): Promise<Branch[]> => (await api.get('/branches/accessible')).data.data,
  create: async (input: BranchInput): Promise<Branch> => (await api.post('/branches', input)).data.data,
  update: async (id: string, input: Partial<BranchInput>): Promise<Branch> =>
    (await api.patch(`/branches/${id}`, input)).data.data,
  staffAccess: async (): Promise<StaffBranchAccess[]> => (await api.get('/branches/access')).data.data,
  setUserAccess: async (userId: string, branchIds: string[]) =>
    (await api.put(`/branches/users/${userId}/access`, { branchIds })).data.data,
};

const keys = { all: ['branches'] as const, staff: ['branches', 'staff-access'] as const };

export const useBranches = () => useQuery({ queryKey: keys.all, queryFn: branchesApi.list });
export const useStaffBranchAccess = () => useQuery({ queryKey: keys.staff, queryFn: branchesApi.staffAccess });

export const useBranchMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: { id?: string; input: Partial<BranchInput> }) =>
      command.id ? branchesApi.update(command.id, command.input) : branchesApi.create(command.input as BranchInput),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
};

export const useSetUserBranchAccess = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: { userId: string; branchIds: string[] }) =>
      branchesApi.setUserAccess(command.userId, command.branchIds),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.all }),
  });
};

export function branchErrorMessage(error: unknown, fallback: string): string {
  const response = (error as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response;
  return response?.data?.error?.message || response?.data?.message || fallback;
}
