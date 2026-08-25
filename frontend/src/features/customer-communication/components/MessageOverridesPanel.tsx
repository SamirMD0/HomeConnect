import React from 'react';
import { ChevronDown, ChevronUp, Info, RotateCcw } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';
import { ServiceJobStatus } from '../../service/types/service.types';
import { MessageDefaults, MessageField, MessageOverrides } from '../types/communication.types';
import {
  SERVICE_STATUSES_REQUIRING_NOTE,
  customerFacingServiceStatus,
} from '../utils/service-status-labels';

/**
 * Optional overrides, collapsed by default.
 *
 * Every value in here is already filled from the selected data source, so the
 * employee only opens this when they want the *message* to say something else —
 * a nickname, a partial amount, a different date. Nothing here writes to the
 * customer, debt, payment or installment records.
 */

const overrideFields: Array<{ field: MessageField; label: string }> = [
  { field: 'customerName', label: 'Name in message / الاسم في الرسالة' },
  { field: 'phone', label: 'Phone / رقم الهاتف' },
  { field: 'amount', label: 'Amount / المبلغ' },
  { field: 'remainingAmount', label: 'Remaining amount / المبلغ المتبقي' },
  { field: 'dateAdded', label: 'Date added / تاريخ الإضافة' },
  { field: 'dueDate', label: 'Due date / تاريخ الاستحقاق' },
  { field: 'daysLate', label: 'Days late / أيام التأخير' },
  { field: 'paymentDate', label: 'Payment date / تاريخ الدفع' },
];

const serviceStatuses = Object.keys(customerFacingServiceStatus) as ServiceJobStatus[];

interface MessageOverridesPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  overrides: MessageOverrides;
  defaults: MessageDefaults;
  /** True for a custom message, where the note *is* the message. */
  isCustomMessage: boolean;
  showServiceStatus: boolean;
  serviceStatus: ServiceJobStatus | null;
  resolvedServiceStatus: string;
  onOverrideChange: (field: MessageField, value: string) => void;
  onServiceStatusChange: (status: ServiceJobStatus | null) => void;
  onReset: () => void;
}

export const MessageOverridesPanel: React.FC<MessageOverridesPanelProps> = ({
  isOpen,
  onToggle,
  overrides,
  defaults,
  isCustomMessage,
  showServiceStatus,
  serviceStatus,
  resolvedServiceStatus,
  onOverrideChange,
  onServiceStatusChange,
  onReset,
}) => {
  const needsServiceNote =
    showServiceStatus &&
    serviceStatus !== null &&
    SERVICE_STATUSES_REQUIRING_NOTE.includes(serviceStatus);

  // A custom message has no template to fill, and a service update may *require*
  // a note before Generate will run — neither may hide behind a collapsed toggle.
  const noteOutsidePanel = isCustomMessage || showServiceStatus;

  const noteField = (
    <label className="block text-sm">
      <span className="font-medium text-slate-700">
        {isCustomMessage ? 'Message text / نص الرسالة' : businessLabels.communication.customNote}
      </span>
      <textarea
        dir="auto"
        rows={isCustomMessage ? 4 : 2}
        value={overrides.customNote ?? ''}
        onChange={(event) => onOverrideChange('customNote', event.target.value)}
        placeholder={
          isCustomMessage
            ? 'Write your message. Placeholders like [amount] still work / اكتب رسالتك، ويمكنك استخدام [amount]'
            : 'Optional extra sentence / جملة إضافية اختيارية'
        }
        className="user-text-pre mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
      {needsServiceNote && (
        <span className="mt-1 block text-xs font-medium text-amber-800">
          This status needs a written note before Generate / هذه الحالة تحتاج ملاحظة مكتوبة قبل
          الإنشاء
        </span>
      )}
    </label>
  );

  return (
    <div className="space-y-3">
      {noteOutsidePanel && noteField}

      <div className="rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls="communication-overrides"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-700"
          >
            {isOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
            {businessLabels.communication.editMessageValues}
          </button>
          {/* Visible whether the panel is open or shut, so "edit values" can
              never be mistaken for editing the customer's actual record. */}
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2 py-1 text-xs text-sky-900">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {businessLabels.communication.messageOnlyNotice}
          </span>
        </div>

        {isOpen && (
          <div id="communication-overrides" className="border-t border-slate-100 p-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {businessLabels.communication.resetOverrides}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {overrideFields.map(({ field, label }) => (
                <label key={field} className="block text-sm">
                  <span className="font-medium text-slate-700">{label}</span>
                  <input
                    type="text"
                    dir="auto"
                    value={overrides[field] ?? ''}
                    placeholder={defaults[field] || '—'}
                    onChange={(event) => onOverrideChange(field, event.target.value)}
                    className="user-text mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                  <span className="mt-0.5 block text-xs text-slate-400" dir="auto">
                    {businessLabels.communication.defaultValue}: {defaults[field] || '—'}
                  </span>
                </label>
              ))}

              {showServiceStatus && (
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">
                    {businessLabels.communication.serviceStatus}
                  </span>
                  <select
                    value={serviceStatus ?? ''}
                    onChange={(event) =>
                      onServiceStatusChange((event.target.value || null) as ServiceJobStatus | null)
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">— </option>
                    {serviceStatuses.map((status) => (
                      <option key={status} value={status}>
                        {customerFacingServiceStatus[status].EN} /{' '}
                        {customerFacingServiceStatus[status].AR}
                      </option>
                    ))}
                  </select>
                  <span className="mt-0.5 block text-xs text-slate-400" dir="auto">
                    {businessLabels.communication.defaultValue}: {resolvedServiceStatus || '—'}
                  </span>
                </label>
              )}
            </div>

            {!noteOutsidePanel && <div className="mt-3">{noteField}</div>}
          </div>
        )}
      </div>
    </div>
  );
};
