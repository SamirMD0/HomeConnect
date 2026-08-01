import React from 'react';
import { InstallmentPreview } from '../utils/installment-preview';
import { formatBusinessDate, formatMoney } from '../utils/financial-format';

interface InstallmentSchedulePreviewProps {
  preview: InstallmentPreview | null;
  error?: string | null;
}

export const InstallmentSchedulePreview: React.FC<InstallmentSchedulePreviewProps> = ({
  preview,
  error,
}) => {
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
        {error}
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
        Enter a valid amount, start date, and count / أدخل المبلغ وتاريخ البدء وعدد الأقساط.
      </div>
    );
  }

  return (
    <section aria-labelledby="installment-preview-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="installment-preview-heading" className="text-sm font-semibold text-slate-800">
          Schedule Preview / معاينة جدول الأقساط
        </h3>
        <p className="text-sm text-slate-600">
          {preview.rows.length} installments, scheduled {formatMoney(preview.totalScheduled)} of{' '}
          {formatMoney(preview.expectedTotal)}
        </p>
      </div>
      {!preview.isBalanced && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Manual schedule must match the total. Difference: {formatMoney(preview.balanceDifference)}.
        </div>
      )}
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Due Date / تاريخ الاستحقاق</th>
              <th className="px-3 py-2 text-right">Amount / المبلغ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {preview.rows.map((row) => (
              <tr key={row.installmentNumber}>
                <td className="px-3 py-2 font-medium text-slate-900">{row.installmentNumber}</td>
                <td className="px-3 py-2 text-slate-600">{formatBusinessDate(row.dueDate)}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {formatMoney(row.amountDue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
