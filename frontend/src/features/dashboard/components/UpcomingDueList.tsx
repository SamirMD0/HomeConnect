import React from 'react';
import { Link } from 'react-router-dom';
import { DashboardUpcomingDueItem } from '../types';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';

interface UpcomingDueListProps {
  items: DashboardUpcomingDueItem[];
  isLoading?: boolean;
}

export const UpcomingDueList: React.FC<UpcomingDueListProps> = ({ items, isLoading = false }) => (
  <section className="rounded-xl border border-brand-200 bg-brand-50/70 p-6 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-lg font-semibold text-brand-950">Upcoming Due</h3>
      <Link to="/ledger" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        Ledger
      </Link>
    </div>
    {isLoading ? (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    ) : items.length === 0 ? (
      <p className="text-sm text-brand-700">No upcoming financial due items.</p>
    ) : (
      <div className="space-y-3">
        {items.map((item) => (
          <Link
            key={`${item.type}-${item.id}`}
            to={item.type === 'DEBT' ? `/customers/${item.customer.id}` : '/ledger'}
            className="block rounded-lg border border-brand-100 bg-white p-3 hover:bg-brand-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="user-text truncate text-sm font-semibold text-brand-950" dir="auto">
                  {item.description}
                </p>
                <p className="text-xs text-brand-700">
                  <span className="user-text" dir="auto">{item.customer.name}</span> · {formatBusinessDate(item.dueDate)}
                </p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold text-brand-900">
                {formatMoney(item.remainingAmount)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    )}
  </section>
);
