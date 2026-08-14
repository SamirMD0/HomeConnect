import { useEffect, useState } from 'react';
import type { ProductFilters } from '../types/product.types';
import * as productHooks from './useProducts';

export const PRODUCT_SEARCH_DEBOUNCE_MS = 300;

export function useProductSearch(params: Omit<ProductFilters, 'search' | 'page' | 'pageSize'> & { limit?: number } = {}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const { limit = 10, ...filters } = params;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), PRODUCT_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const products = productHooks.useProducts({
    ...filters,
    search: debouncedQuery || undefined,
    page: 1,
    pageSize: limit,
  });

  return { query, setQuery, debouncedQuery, products };
}
