import React from 'react';
import { MonthlyFinancialActivityData, MonthlyFinancialActivityItem } from '../types/monthly-reports.types';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';

export const MonthlyActivityReportTable: React.FC<{ report: MonthlyFinancialActivityData }> = ({
  report,
}) => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.items.map((item) => (
            <ActivityRow key={`${item.type}-${item.id}`} item={item} />
          ))}
        </tbody>
        <tfoot className="bg-slate-50 font-semibold text-slate-900">
          <tr>
            <td className="px-4 py-3" colSpan={3}>
              Customers affected: {report.summary.customerCountAffected}
            </td>
            <td className="px-4 py-3" colSpan={2}>
              Net financial change
            </td>
            <td className="px-4 py-3 text-right">{formatMoney(report.summary.netFinancialChange)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
);

const typeLabels: Record<MonthlyFinancialActivityItem['type'], string> = {
  DEBT_CREATED: 'Debt created',
  INSTALLMENT_PLAN_CREATED: 'Plan created',
  PAYMENT_RECEIVED: 'Payment received',
};

const ActivityRow: React.FC<{ item: MonthlyFinancialActivityItem }> = ({ item }) => (
  <tr>
    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatBusinessDate(item.date)}</td>
    <td className="user-text px-4 py-3 font-medium text-slate-900" dir="auto">{item.customer.name}</td>
    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{item.customer.phone}</td>
    <td className="px-4 py-3">
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
        {typeLabels[item.type]}
      </span>
    </td>
    <td className="user-text px-4 py-3 text-slate-700" dir="auto">{item.description}</td>
    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(item.amount)}</td>
  </tr>
);
