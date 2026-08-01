import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../api/products.api';
import {
  CreateProductInput,
  ProductActionInput,
  ProductDuplicateQuery,
  ProductFilters,
  UpdateProductInput,
  UpdateProductPricingInput,
  UpdateProductSkuInput, UpdateProductStockInput,
} from '../types/product.types';

export const productKeys = {
  all: ['products'] as const,
  list: (filters: ProductFilters) => [...productKeys.all, 'list', filters] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
  label: (id: string, includePriceCode = false, includePrice = true) => [...productKeys.all, 'label', id, includePriceCode, includePrice] as const,
  audit: (id: string) => [...productKeys.all, 'audit', id] as const,
  serviceJobs: (id: string, page: number) => [...productKeys.all, 'service-jobs', id, page] as const,
  pricing: (id:string,months?:number)=>[...productKeys.all,'pricing',id,months] as const,
  image: (id: string, version: string) => [...productKeys.all, 'image', id, version] as const,
};

/**
 * Uploaded images are behind Bearer auth, so the bytes are fetched and exposed as
 * an object URL. `version` is the image's updatedAt, which busts the cache on replace.
 */
export function useProductImageUrl(id: string, version: string | null) {
  const query = useQuery({
    queryKey: productKeys.image(id, version ?? ''),
    queryFn: () => productsApi.imageBlob(id),
    enabled: Boolean(id && version),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!query.data) { setObjectUrl(null); return; }
    const url = URL.createObjectURL(query.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [query.data]);

  return { url: objectUrl, isLoading: query.isLoading, isError: query.isError };
}

export function useUploadProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => productsApi.uploadImage(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useRemoveProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productsApi.removeImage(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useProducts(filters: ProductFilters = {}) {
  return useQuery({ queryKey: productKeys.list(filters), queryFn: () => productsApi.list(filters) });
}
export function useProductPricing(id:string,months?:number){return useQuery({queryKey:productKeys.pricing(id,months),queryFn:()=>productsApi.pricingPreview(id,months),enabled:Boolean(id)});}
export function useUpdateProductPricing(){const queryClient=useQueryClient();return useMutation({mutationFn:({id,input}:{id:string;input:UpdateProductPricingInput})=>productsApi.updatePricing(id,input),onSuccess:()=>queryClient.invalidateQueries({queryKey:productKeys.all})});}
export function useProduct(id: string) {
  return useQuery({ queryKey: productKeys.detail(id), queryFn: () => productsApi.get(id), enabled: Boolean(id) });
}
export function useProductLabel(id: string, includePriceCode = false, includePrice = true) {
  return useQuery({ queryKey: productKeys.label(id, includePriceCode, includePrice), queryFn: () => productsApi.label(id, includePriceCode, includePrice), enabled: Boolean(id) });
}
export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateProductInput) => productsApi.create(input), onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }) });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) => productsApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useArchiveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductActionInput }) => productsApi.archive(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useRestoreProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductActionInput }) => productsApi.restore(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productKeys.all }),
  });
}

const invalidateProducts = (queryClient: ReturnType<typeof useQueryClient>) =>
  queryClient.invalidateQueries({ queryKey: productKeys.all });

export function useUpdateProductSku() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateProductSkuInput }) => productsApi.updateSku(id, input), onSuccess: () => invalidateProducts(queryClient) });
}
export function useRegenerateProductSku() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: ProductActionInput }) => productsApi.regenerateSku(id, input), onSuccess: () => invalidateProducts(queryClient) });
}
export function useUpdateProductStock() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateProductStockInput }) => productsApi.updateStock(id, input), onSuccess: () => invalidateProducts(queryClient) });
}

export function useProductAudit(id: string, enabled = true) {
  return useQuery({
    queryKey: productKeys.audit(id),
    queryFn: () => productsApi.audit(id),
    enabled: Boolean(id) && enabled,
  });
}

export function useProductServiceJobs(id: string, page = 1) {
  return useQuery({
    queryKey: productKeys.serviceJobs(id, page),
    queryFn: () => productsApi.serviceJobs(id, page),
    enabled: Boolean(id),
  });
}

export function useCheckProductDuplicate() {
  return useMutation({ mutationFn: (query: ProductDuplicateQuery) => productsApi.checkDuplicate(query) });
}
