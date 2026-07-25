import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Customer } from '../../customers/api/customers.api';
import { useCustomers } from '../../customers/hooks/useCustomers';

interface CustomerPickerProps {
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer) => void;
}

export const CustomerPicker: React.FC<CustomerPickerProps> = ({ selectedCustomer, onSelect }) => {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useCustomers({ search, limit: 10 });
  const customers = data?.data ?? [];

  return (
    <section aria-labelledby="customer-picker-heading" className="space-y-3">
      <div>
        <h3 id="customer-picker-heading" className="text-sm font-semibold text-slate-900">
          Select existing customer
        </h3>
        <p className="mt-1 text-sm text-slate-500">Search by customer name or phone number.</p>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Customer search
        <span className="relative mt-1 block">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="block w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Name or phone"
          />
        </span>
      </label>
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
        {isLoading ? (
          <p className="p-3 text-sm text-slate-500">Loading customers...</p>
        ) : customers.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">No customers found.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {customers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => onSelect(customer)}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50 ${
                  selectedCustomer?.id === customer.id ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'
                }`}
              >
                <span className="font-semibold">{customer.name}</span>
                <span className="ml-2 text-slate-500">{customer.phone}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
