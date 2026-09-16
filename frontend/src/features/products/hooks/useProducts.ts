import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { productsApi } from '../api/products.api';
import {
  CreateProductInput,
  ProductActionInput,
  ProductBrandNormalizeInput,
  ProductDuplicateQuery,
  ProductFilters,
  UpdateProductInput,
  UpdateProductPricingInput,
  UpdateProductSkuInput, UpdateProductStockInput,
} from '../types/product.types';

export const productKeys = {
  all: ['products'] as const,
  brands: () => [...productKeys.all, 'brands'] as const,
  list: (filters: ProductFilters) => [...productKeys.all, 'list', filters] as const,
  detail: (id: string) => [...productKeys.all, 'detail', id] as const,
  label: (id: string, includePriceCode = false, includePrice = true) => [...productKeys.all, 'label', id, includePriceCode, includePrice] as const,
  labels: (ids: string[], includePriceCode = false, includePrice = false) =>
    [...productKeys.all, 'labels', [...ids].sort().join(','), includePriceCode, includePrice] as const,
  audit: (id: string) => [...productKeys.all, 'audit', id] as const,
  serviceJobs: (id: string, page: number) => [...productKeys.all, 'service-jobs', id, page] as const,
  pricing: (id:string,months?:number)=>[...productKeys.all,'pricing',id,months] as const,
  image: (id: string, version: string) => [...productKeys.all, 'image', id, version] as const,
  duplicate: (query: ProductDuplicateQuery | null) => [...productKeys.all, 'duplicate', query] as const,
};

/**
 * Every cached product query except the image blobs.
 *
 * `productKeys.image` is nested under `productKeys.all`, so invalidating the
 * `products` prefix also dropped every cached image — one product edit made the
 * catalogue re-download the authenticated bytes of all ~25 products on screen.
 * The blobs never needed it: their key carries the image's `updatedAt`, so
 * replacing an image produces a new key and the stale entry simply ages out of
 * `gcTime`. Removing one likewise leaves `image` null, and the component stops
 * mounting the query at all.
 */
export const isRefreshableProductQuery = (query: { queryKey: readonly unknown[] }) =>
  query.queryKey[0] === productKeys.all[0] && query.queryKey[1] !== 'image';

const refreshProducts = (queryClient: Pick<QueryClient, 'invalidateQueries'>) =>
  queryClient.invalidateQueries({ predicate: isRefreshableProductQuery });

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
    onSuccess: () => refreshProducts(queryClient),
  });
}

export function useRemoveProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => productsApi.removeImage(id),
    onSuccess: () => refreshProducts(queryClient),
  });
}

export function useProducts(filters: ProductFilters = {}) {
  return useQuery({ queryKey: productKeys.list(filters), queryFn: () => productsApi.list(filters) });
}
export function useProductBrands() {
  return useQuery({ queryKey: productKeys.brands(), queryFn: productsApi.brands, retry: false });
}
export function useProductPricing(id:string,months?:number){return useQuery({queryKey:productKeys.pricing(id,months),queryFn:()=>productsApi.pricingPreview(id,months),enabled:Boolean(id)});}
export function useUpdateProductPricing(){const queryClient=useQueryClient();return useMutation({mutationFn:({id,input}:{id:string;input:UpdateProductPricingInput})=>productsApi.updatePricing(id,input),onSuccess:()=>refreshProducts(queryClient)});}
export function useProduct(id: string) {
  return useQuery({ queryKey: productKeys.detail(id), queryFn: () => productsApi.get(id), enabled: Boolean(id) });
}
export function useProductLabel(id: string, includePriceCode = false, includePrice = true) {
  return useQuery({ queryKey: productKeys.label(id, includePriceCode, includePrice), queryFn: () => productsApi.label(id, includePriceCode, includePrice), enabled: Boolean(id) });
}
/**
 * One request for the whole sheet, replacing a per-product fan-out.
 * Ids are sorted in the key so reordering a selection reuses the cache.
 */
export function useProductLabels(ids: string[], includePriceCode = false, includePrice = false) {
  return useQuery({
    queryKey: productKeys.labels(ids, includePriceCode, includePrice),
    queryFn: () => productsApi.labels(ids, includePriceCode, includePrice),
    enabled: ids.length > 0,
    retry: false,
  });
}
export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (input: CreateProductInput) => productsApi.create(input), onSuccess: () => Promise.all([refreshProducts(queryClient), queryClient.invalidateQueries({ queryKey: ['categories'] })]) });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) => productsApi.update(id, input),
    onSuccess: (_result, { input }) => Promise.all([refreshProducts(queryClient), ...(input.categoryId === undefined ? [] : [['categories'], ['reports']].map((queryKey) => queryClient.invalidateQueries({ queryKey })))]),
  });
}

export function useArchiveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductActionInput }) => productsApi.archive(id, input),
    onSuccess: () => refreshProducts(queryClient),
  });
}

export function useRestoreProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductActionInput }) => productsApi.restore(id, input),
    onSuccess: () => refreshProducts(queryClient),
  });
}

const invalidateProducts = refreshProducts;

export const refreshAfterBrandNormalize = (
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  input: ProductBrandNormalizeInput
) => input.dryRun ? undefined : refreshProducts(queryClient);

export function useNormalizeProductBrands() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductBrandNormalizeInput) => productsApi.normalizeBrands(input),
    // `brands` is nested under `productKeys.all`, so this refreshes both the
    // catalogue and the grouped brand summary after a write. A preview is read-only.
    onSuccess: (_result, input) => refreshAfterBrandNormalize(queryClient, input),
  });
}

export function useUpdateProductSku() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: string; input: UpdateProductSkuInput }) => productsApi.updateSku(id, input), onSuccess: () => invalidateProducts(queryClient) });
}
export function useRegenerateProductSku() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: string) => productsApi.regenerateSku(id), onSuccess: () => invalidateProducts(queryClient) });
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

export const PRODUCT_DUPLICATE_DEBOUNCE_MS = 400;

const trimmed = (value?: string | null) => value?.trim() || undefined;

export function normalizeProductDuplicateQuery(query: ProductDuplicateQuery | null): ProductDuplicateQuery | null {
  if (!query) return null;
  return {
    name: trimmed(query.name),
    model: trimmed(query.model),
    brand: trimmed(query.brand),
    barcode: trimmed(query.barcode),
    sku: trimmed(query.sku)?.toUpperCase(),
    excludeProductId: query.excludeProductId,
  };
}

export function shouldCheckProductDuplicate(query: ProductDuplicateQuery | null): boolean {
  return Boolean(query && ((query.name && query.model) || query.barcode || query.sku));
}

export function scheduleProductDuplicateQuery(query: ProductDuplicateQuery | null, commit: (query: ProductDuplicateQuery | null) => void) {
  const timer = globalThis.setTimeout(() => commit(query), PRODUCT_DUPLICATE_DEBOUNCE_MS);
  return () => globalThis.clearTimeout(timer);
}

export function useCheckProductDuplicate(query: ProductDuplicateQuery | null) {
  const hasQuery = query !== null;
  const name = query?.name;
  const model = query?.model;
  const brand = query?.brand;
  const barcode = query?.barcode;
  const sku = query?.sku;
  const excludeProductId = query?.excludeProductId;
  const current = useMemo(() => normalizeProductDuplicateQuery(hasQuery ? {
    name, model, brand, barcode, sku, excludeProductId,
  } : null), [hasQuery, name, model, brand, barcode, sku, excludeProductId]);
  const [debounced, setDebounced] = useState<ProductDuplicateQuery | null>(null);
  const currentKey = JSON.stringify(current);
  const debouncedKey = JSON.stringify(debounced);

  useEffect(() => scheduleProductDuplicateQuery(current, setDebounced), [current]);

  const result = useQuery({
    queryKey: productKeys.duplicate(debounced),
    queryFn: ({ signal }) => productsApi.checkDuplicate(debounced as ProductDuplicateQuery, signal),
    enabled: shouldCheckProductDuplicate(debounced),
    staleTime: 30_000,
  });

  return {
    ...result,
    data: currentKey === debouncedKey ? result.data : undefined,
    isDebouncing: currentKey !== debouncedKey,
  };
}
