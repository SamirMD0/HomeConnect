import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useCustomers } from '../../customers/hooks/useCustomers';
import { businessLabels } from '../../../shared/labels/business-labels';

export const CustomerPicker: React.FC<{ value: string; onChange: (id: string) => void; locked?: boolean }> = ({ value, onChange, locked = false }) => {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const id = window.setTimeout(() => setDebounced(search.trim()), 300); return () => window.clearTimeout(id); }, [search]);
  const customers = useCustomers({ search: debounced, limit: 10 });
  if (locked) {
    const selected = customers.data?.data.find((customer) => customer.id === value);
    return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-medium text-slate-500">{businessLabels.common.customer}</p><p className="user-text font-semibold text-slate-900" dir="auto">{selected?.name ?? 'Selected customer / الزبون المختار'}</p>{selected && <p className="text-sm text-slate-500">{selected.phone}</p>}</div>;
  }
  return <div className="space-y-2"><label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer name or phone / بحث بالاسم أو الهاتف" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3" /></label><div className="max-h-40 divide-y overflow-y-auto rounded-lg border border-slate-200">{customers.data?.data.map((customer) => <button type="button" key={customer.id} onClick={() => onChange(customer.id)} className={`block w-full px-3 py-2 text-left hover:bg-emerald-50 ${value === customer.id ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-300' : ''}`}><span className="user-text font-medium" dir="auto">{customer.name}</span><span className="ml-2 text-sm text-slate-500">{customer.phone}</span></button>)}</div></div>;
};
