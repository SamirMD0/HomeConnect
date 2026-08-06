import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { CustomerSearchSuggestion } from '../api/customers.api';
import { clearCustomerSearchHistory, readCustomerSearchHistory, removeCustomerSearch } from '../utils/customer-search-history';
import { businessLabels } from '../../../shared/labels/business-labels';

export const CustomerSearchInput: React.FC<{
  value: string; onChange: (value: string) => void; suggestions?: CustomerSearchSuggestion[];
  isLoading?: boolean; resultCount?: number;
}> = ({ value, onChange, suggestions = [], isLoading, resultCount }) => {
  const [focused, setFocused] = useState(false);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(-1);
  const [historyVersion, setHistoryVersion] = useState(0);
  const history = useMemo(() => readCustomerSearchHistory(), [historyVersion, focused]);
  return <div className="relative">
    <Search className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
    <input type="search" dir="auto" className="user-text-input block w-full rounded-lg border border-slate-300 py-2 pl-10 pr-10 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20" value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 150)} onKeyDown={(event) => { if (!focused || value || history.length === 0) return; if (event.key === 'ArrowDown') { event.preventDefault(); setActiveHistoryIndex((index) => (index + 1) % history.length); } else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveHistoryIndex((index) => index <= 0 ? history.length - 1 : index - 1); } else if (event.key === 'Enter' && activeHistoryIndex >= 0) { event.preventDefault(); onChange(history[activeHistoryIndex].query); setFocused(false); } else if (event.key === 'Escape') setFocused(false); }} placeholder={businessLabels.customer.searchPlaceholder} />
    {value && <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-3 top-2.5 text-slate-400"><X className="h-4 w-4" /></button>}
    <span className="sr-only" aria-live="polite">{isLoading ? 'Loading' : resultCount === undefined ? '' : `${resultCount} results`}</span>
    {focused && !value && history.length > 0 && <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <div className="mb-2 flex justify-between text-xs text-slate-500"><span>{businessLabels.customer.recentSearches}</span><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { clearCustomerSearchHistory(); setHistoryVersion((v) => v + 1); }}>{businessLabels.customer.clearHistory}</button></div>
      <div className="flex flex-wrap gap-2">{history.map((item, index) => <span key={item.at} className={`inline-flex rounded-full text-xs ${index === activeHistoryIndex ? 'bg-emerald-100' : 'bg-slate-100'}`}><button type="button" className="px-3 py-1" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange(item.query)}>{item.query}</button><button type="button" aria-label={`Remove ${item.query}`} className="pr-2" onMouseDown={(event) => event.preventDefault()} onClick={() => { removeCustomerSearch(item.query); setHistoryVersion((v) => v + 1); }}>×</button></span>)}</div>
    </div>}
    {suggestions.length > 0 && <div className="mt-2 text-sm text-slate-600">{businessLabels.customer.didYouMean} {suggestions.map((suggestion) => <button type="button" key={suggestion.query} className="mx-1 font-semibold text-emerald-700" onClick={() => onChange(suggestion.query)}>{suggestion.query} ({suggestion.count})</button>)}</div>}
  </div>;
};
