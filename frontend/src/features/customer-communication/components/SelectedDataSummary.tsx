import React from 'react';
import { Database } from 'lucide-react';
import { MessageDefaults, MessageSourceKind } from '../types/communication.types';

/**
 * Read-only view of what the selected data source already supplies.
 *
 * The point of this card is that the employee should *not* feel like they are
 * typing a message from scratch: everything here came from the backend summary
 * and is already in the message. Overrides stay collapsed behind it.
 */

const titles: Record<MessageSourceKind, string> = {
  TOTAL: 'Total outstanding / إجمالي الرصيد',
  DEBT: 'Selected debt / الدين المحدد',
  INSTALLMENT: 'Selected installment / القسط المحدد',
  MANUAL: 'Manual amount / مبلغ يدوي',
};

const rows: Array<{ key: keyof MessageDefaults; label: string }> = [
  { key: 'amount', label: 'Amount / المبلغ' },
  { key: 'remainingAmount', label: 'Remaining / المتبقي' },
  { key: 'dateAdded', label: 'Added / تاريخ الإضافة' },
  { key: 'dueDate', label: 'Due / الاستحقاق' },
  { key: 'daysLate', label: 'Days late / أيام التأخير' },
  { key: 'lastPaymentDate', label: 'Last payment / آخر دفعة' },
  { key: 'paymentDate', label: 'Payment date / تاريخ الدفع' },
];

interface SelectedDataSummaryProps {
  sourceKind: MessageSourceKind;
  defaults: MessageDefaults;
  isLoading: boolean;
}

export const SelectedDataSummary: React.FC<SelectedDataSummaryProps> = ({
  sourceKind,
  defaults,
  isLoading,
}) => {
  const present = rows.filter(({ key }) => defaults[key].trim() !== '');

  return (
    <section
      aria-label="Selected data summary / ملخص البيانات المحددة"
      className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <Database className="h-4 w-4" aria-hidden="true" />
        {titles[sourceKind]}
      </h4>

      {isLoading ? (
        <p className="mt-2 text-sm text-slate-500">Loading… / جاري التحميل…</p>
      ) : sourceKind === 'MANUAL' ? (
        <p className="mt-2 text-sm text-slate-600">
          Enter the values yourself below / أدخل القيم بنفسك في الأسفل
        </p>
      ) : present.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">
          Nothing outstanding on this selection / لا يوجد مستحقات على هذا الاختيار
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {present.map(({ key, label }) => (
            <div key={key}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-sm font-semibold text-slate-900" dir="auto">
                {defaults[key]}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-2 text-xs text-slate-500">
        Loaded automatically from this customer&apos;s record / تُحمّل تلقائياً من سجل الزبون
      </p>
    </section>
  );
};
