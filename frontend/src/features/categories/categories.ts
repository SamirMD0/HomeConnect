import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  assignable: boolean;
  path: string;
  productCount: number;
  childCount: number;
  level: number;
}
export interface CategoryInput {
  name: string;
  parentId: string | null;
  isActive: boolean;
}
export const categoriesApi = {
  list: async (): Promise<Category[]> => (await api.get('/categories')).data.data,
  create: async (input: CategoryInput) => (await api.post('/categories', input)).data.data,
  update: async (id: string, input: CategoryInput) =>
    (await api.patch(`/categories/${id}`, input)).data.data,
  remove: async (id: string) => (await api.delete(`/categories/${id}`)).data.data,
};
export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
export const useCategoryMutation = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: { id?: string; input?: CategoryInput; remove?: boolean }) =>
      command.remove
        ? categoriesApi.remove(command.id!)
        : command.id
          ? categoriesApi.update(command.id, command.input!)
          : categoriesApi.create(command.input!),
    onSuccess: async () => {
      await Promise.all([
        ...[['categories'], ['reports']].map((queryKey) => client.invalidateQueries({ queryKey })),
        client.invalidateQueries({
          predicate: (query) => query.queryKey[0] === 'products' && query.queryKey[1] !== 'image',
        }),
      ]);
    },
  });
};
