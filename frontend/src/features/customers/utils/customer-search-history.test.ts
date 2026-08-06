import { beforeEach, describe, expect, it } from 'vitest';
import { clearCustomerSearchHistory, readCustomerSearchHistory, saveCustomerSearch } from './customer-search-history';
import { normalizeCustomerSearch } from './arabic-normalize';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
}, configurable: true });

describe('customer search history', () => {
  beforeEach(() => store.clear());
  it('deduplicates normalized Arabic variants and keeps the applied spelling', () => {
    saveCustomerSearch('أحمد'); saveCustomerSearch('احمد');
    expect(readCustomerSearchHistory().map((item) => item.query)).toEqual(['احمد']);
  });
  it('ignores short terms and clears safely', () => {
    saveCustomerSearch('ا'); clearCustomerSearchHistory();
    expect(readCustomerSearchHistory()).toEqual([]);
  });
  it('mirrors the documented Arabic normalization rules', () => {
    expect(normalizeCustomerSearch('إحمَد عَمّـار')).toBe('احمد عمار');
  });
});
