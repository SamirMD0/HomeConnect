import React from 'react';
import { Link } from 'react-router-dom';
import { DashboardUpcomingDueItem } from '../types';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';

interface UpcomingDueListProps {
  items: DashboardUpcomingDueItem[];
  isLoading?: boolean;
}

export const UpcomingDueList: React.FC<UpcomingDueListProps> = ({ items, isLoading = false }) => (
  <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-lg font-semibold text-emerald-950">Upcoming Due</h3>
      <Link to="/ledger" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
        Ledger
      </Link>
    </div>
    {isLoading ? (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    ) : items.length === 0 ? (
      <p className="text-sm text-emerald-700">No upcoming financial due items.</p>
    ) : (
      <div className="space-y-3">
        {items.map((item) => (
          <Link
            key={`${item.type}-${item.id}`}
            to={item.type === 'DEBT' ? `/customers/${item.customer.id}` : '/ledger'}
            className="block rounded-lg border border-emerald-100 bg-white p-3 hover:bg-emerald-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-emerald-950">{item.description}</p>
                <p className="text-xs text-emerald-700">
                  {item.customer.name} · {formatBusinessDate(item.dueDate)}
                </p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold text-emerald-900">
                {formatMoney(item.remainingAmount)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    )}
  </section>
);
