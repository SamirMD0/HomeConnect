import React from 'react';
import { Link } from 'react-router-dom';
import { DashboardOverdueCustomer } from '../types';
import { formatMoney } from '../../customer-financial/utils/financial-format';

interface OverdueCustomersListProps {
  customers: DashboardOverdueCustomer[];
  isLoading?: boolean;
}

export const OverdueCustomersList: React.FC<OverdueCustomersListProps> = ({
  customers,
  isLoading = false,
}) => (
  <section className="rounded-xl border border-red-200 bg-red-50/70 p-6 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-lg font-semibold text-red-950">Overdue Customers</h3>
      <Link to="/reports" className="text-sm font-medium text-red-700 hover:text-red-800">
        Reports
      </Link>
    </div>
    {isLoading ? (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    ) : customers.length === 0 ? (
      <p className="text-sm text-red-700">No overdue customers.</p>
    ) : (
      <div className="space-y-3">
        {customers.map((item) => (
          <Link
            key={item.customer.id}
            to={`/customers/${item.customer.id}`}
            className="block rounded-lg border border-red-100 bg-white p-3 hover:bg-red-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="user-text text-sm font-semibold text-red-950" dir="auto">
                  {item.customer.name}
                </p>
                <p className="text-xs text-red-700">
                  {item.overdueItemCount} overdue item{item.overdueItemCount === 1 ? '' : 's'}
                </p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold text-red-600">
                {formatMoney(item.totalOverdue)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    )}
  </section>
);
