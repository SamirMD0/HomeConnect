import React, { useState, useEffect } from 'react';
import { Search, Plus, UserPlus, Phone, Loader2 } from 'lucide-react';
import { useCustomers } from '../../customers/hooks/useCustomers';
import { Customer } from '../../customers/api/customers.api';
import { motion } from 'framer-motion';

interface CustomerSearchProps {
  onSelectCustomer: (customer: Customer) => void;
  onCreateNew: (initialSearchTerm: string) => void;
}

export const CustomerSearch: React.FC<CustomerSearchProps> = ({ onSelectCustomer, onCreateNew }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading } = useCustomers({ search: debouncedSearch, limit: 5 });
  const customers = data?.data || [];
  const hasSearched = debouncedSearch.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full"
    >
      <div className="p-6 pb-4 border-b border-slate-100 shrink-0">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Find Customer</h2>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            className="block w-full rounded-xl border-0 py-3 pl-10 pr-3 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-shadow"
            placeholder="Search by name or phone..."
            autoFocus
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Searching...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {customers.map((customer) => (
              <button
                key={customer.id}
                onClick={() => onSelectCustomer(customer)}
                className="w-full text-left bg-white p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {customer.name}
                    </h3>
                    <div className="mt-1 flex items-center text-xs text-slate-500">
                      <Phone className="h-3 w-3 mr-1" />
                      {customer.phone}
                    </div>
                  </div>
                  {customer.isActive === false && (
                    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">
                      Inactive
                    </span>
                  )}
                </div>
              </button>
            ))}

            {hasSearched && customers.length === 0 && (
              <div className="text-center py-8 px-4">
                <div className="mx-auto w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                  <Search className="h-6 w-6 text-slate-400" />
                </div>
                <h3 className="text-sm font-medium text-slate-900 mb-1">No customers found</h3>
                <p className="text-sm text-slate-500 mb-4">
                  We couldn't find anyone matching "{searchTerm}"
                </p>
                <button
                  onClick={() => onCreateNew(searchTerm)}
                  className="inline-flex items-center justify-center px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors focus:ring-2 focus:ring-indigo-500/20 font-medium text-sm"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create New Customer
                </button>
              </div>
            )}
            
            {!hasSearched && customers.length === 0 && (
               <div className="text-center py-8 px-4 text-slate-500 text-sm">
                  Start typing to find a customer.
               </div>
            )}

            {/* Always show "Create New" option at bottom if they have searched but didn't find exactly what they wanted, even if there are results */}
            {hasSearched && customers.length > 0 && (
              <div className="pt-4 mt-2 border-t border-slate-100">
                <button
                  onClick={() => onCreateNew(searchTerm)}
                  className="w-full inline-flex items-center justify-center px-4 py-3 border border-dashed border-slate-300 text-slate-600 rounded-xl hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-300 transition-colors focus:ring-2 focus:ring-indigo-500/20 font-medium text-sm group"
                >
                  <Plus className="w-4 h-4 mr-2 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  Add "{searchTerm}" as new customer
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
