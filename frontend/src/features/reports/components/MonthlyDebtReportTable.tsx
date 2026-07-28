import React from 'react';
import { ExternalLink } from 'lucide-react';
import { MonthlyDebtReportData, MonthlyDebtReportRow } from '../types/monthly-reports.types';
import { formatBusinessDate, formatMoney } from '../../customer-financial/utils/financial-format';

interface MonthlyDebtReportTableProps {
  report: MonthlyDebtReportData;
  onOpenCustomer: (customerId: string) => void;
}

export const MonthlyDebtReportTable: React.FC<MonthlyDebtReportTableProps> = ({
  report,
  onOpenCustomer,
}) => (
  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-4 py-3">Customer</th>
            <th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3 text-right">Single Debts</th>
            <th className="px-4 py-3 text-right">Installment Plans</th>
            <th className="px-4 py-3 text-right">Total Outstanding</th>
            <th className="px-4 py-3 text-right">Due by Cutoff</th>
            <th className="px-4 py-3 text-right">Overdue</th>
            <th className="px-4 py-3">Active Obligations</th>
            <th className="px-4 py-3">Last Payment</th>
            <th className="px-4 py-3 text-right print:hidden">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {report.rows.map((row) => (
            <MonthlyDebtReportRowView key={row.customer.id} row={row} onOpenCustomer={onOpenCustomer} />
          ))}
        </tbody>
        <tfoot className="bg-slate-50 font-semibold text-slate-900">
          <tr>
            <td className="px-4 py-3" colSpan={2}>
              Total customers: {report.summary.customerCount}
            </td>
            <td className="px-4 py-3 text-right">{formatMoney(report.summary.singleDebtOutstandingTotal)}</td>
            <td className="px-4 py-3 text-right">
              {formatMoney(report.summary.installmentPlanOutstandingTotal)}
            </td>
            <td className="px-4 py-3 text-right">{formatMoney(report.summary.totalOutstanding)}</td>
            <td className="px-4 py-3 text-right">{formatMoney(report.summary.totalAmountDueByCutoff)}</td>
            <td className="px-4 py-3 text-right">{formatMoney(report.summary.totalOverdueAtCutoff)}</td>
            <td className="px-4 py-3" colSpan={3}>
              Payments received: {formatMoney(report.summary.totalPaymentsReceivedDuringMonth)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
);

const MonthlyDebtReportRowView: React.FC<{
  row: MonthlyDebtReportRow;
  onOpenCustomer: (customerId: string) => void;
}> = ({ row, onOpenCustomer }) => (
  <tr className="align-top">
    <td className="user-text px-4 py-3 font-medium text-slate-900" dir="auto">{row.customer.name}</td>
    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.customer.phone}</td>
    <td className="px-4 py-3 text-right text-slate-700">{formatMoney(row.singleDebtOutstanding)}</td>
    <td className="px-4 py-3 text-right text-slate-700">{formatMoney(row.installmentPlanOutstanding)}</td>
    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(row.totalOutstanding)}</td>
    <td className="px-4 py-3 text-right text-slate-700">{formatMoney(row.amountDueByCutoff)}</td>
    <td className="px-4 py-3 text-right font-medium text-amber-700">
      {formatMoney(row.overdueAmountAtCutoff)}
    </td>
    <td className="px-4 py-3 text-slate-600">
      {row.activeDebtCount} debt{row.activeDebtCount === 1 ? '' : 's'} · {row.activePlanCount} plan
      {row.activePlanCount === 1 ? '' : 's'}
    </td>
    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
      {formatBusinessDate(row.lastPaymentDate)}
      {row.nextDueDateAfterCutoff && (
        <span className="block text-xs text-slate-400">Next {formatBusinessDate(row.nextDueDateAfterCutoff)}</span>
      )}
    </td>
    <td className="px-4 py-3 text-right print:hidden">
      <button
        type="button"
        onClick={() => onOpenCustomer(row.customer.id)}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <ExternalLink className="h-4 w-4" />
        Open
      </button>
    </td>
  </tr>
);
