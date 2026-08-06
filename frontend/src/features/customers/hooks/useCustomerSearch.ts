import { useEffect, useState } from 'react';
import { CustomerListParams } from '../api/customers.api';
import { saveCustomerSearch } from '../utils/customer-search-history';
import * as customerHooks from './useCustomers';

export const CUSTOMER_SEARCH_DEBOUNCE_MS = 300;

export function useCustomerSearch(params: Omit<CustomerListParams, 'search'> = {}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), CUSTOMER_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);
  const customers = customerHooks.useCustomers({ ...params, search: debouncedQuery });
  const noResults = Boolean(debouncedQuery && customers.data && customers.data.data.length === 0 && !customers.isFetching);
  const suggestions = typeof customerHooks.useCustomerSearchSuggestions === 'function'
    ? customerHooks.useCustomerSearchSuggestions(debouncedQuery, noResults)
    : { data: undefined };
  useEffect(() => {
    if (debouncedQuery.length >= 2 && customers.data && !customers.isFetching) saveCustomerSearch(debouncedQuery);
  }, [debouncedQuery, customers.data, customers.isFetching]);
  return { query, setQuery, debouncedQuery, customers, suggestions };
}
