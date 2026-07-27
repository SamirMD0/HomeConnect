import React from 'react';
import { Link } from 'react-router-dom';
import { DashboardRecentPayment } from '../types';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';

interface RecentPaymentsPanelProps {
  payments: DashboardRecentPayment[];
  isLoading?: boolean;
}

export const RecentPaymentsPanel: React.FC<RecentPaymentsPanelProps> = ({
  payments,
  isLoading = false,
}) => (
  <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-lg font-semibold text-gray-900">Recent Payments</h3>
      <Link to="/ledger" className="text-sm font-medium text-primary-700 hover:text-primary-800">
        Ledger
      </Link>
    </div>
    {isLoading ? (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    ) : payments.length === 0 ? (
      <p className="text-sm text-gray-500">No payments recorded yet.</p>
    ) : (
      <div className="space-y-3">
        {payments.map((payment) => (
          <Link
            key={payment.id}
            to={`/customers/${payment.customer.id}`}
            className="block rounded-lg border border-gray-100 p-3 hover:bg-gray-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{payment.customer.name}</p>
                <p className="text-xs text-gray-500">
                  {formatBusinessDate(payment.paymentDate)} · {payment.paymentMethod}
                </p>
              </div>
              <p className="whitespace-nowrap text-sm font-semibold text-green-600">
                {formatMoney(payment.amount)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    )}
  </section>
);
