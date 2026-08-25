import React from 'react';
import { ChevronDown, ChevronUp, Copy, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { businessLabels } from '../../../shared/labels/business-labels';
import { formatCustomerPhone } from '../../customers/utils/format-customer-phone';
import { MessageType } from '../types/communication.types';
import { useWhatsAppMessage } from '../hooks/useWhatsAppMessage';
import { WhatsAppMessageComposer } from './WhatsAppMessageComposer';

interface CustomerCommunicationSectionProps {
  customer: { id: string; name: string; phone: string };
  /** Controlled by the profile page so the header shortcut can expand it. */
  isExpanded: boolean;
  onToggle: () => void;
  presetType?: MessageType;
}

export const CustomerCommunicationSection: React.FC<CustomerCommunicationSectionProps> = ({
  customer,
  isExpanded,
  onToggle,
  presetType,
}) => {
  const { state, actions } = useWhatsAppMessage({
    customer,
    presetType,
    enabled: isExpanded,
  });

  return (
    <section
      aria-labelledby="customer-communication-title"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="customer-communication-title" className="font-semibold text-slate-900">
              {businessLabels.communication.section}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
              <span className="user-text" dir="auto">
                {customer.name}
              </span>
              <span dir="ltr">{formatCustomerPhone(customer.phone)}</span>
              <button
                type="button"
                aria-label={businessLabels.customer.copyPhone}
                onClick={() => {
                  void navigator.clipboard?.writeText(customer.phone);
                  toast.success('Phone copied / تم نسخ الهاتف');
                }}
                className="rounded-md bg-emerald-50 p-1 text-emerald-600 transition-colors hover:bg-emerald-600 hover:text-white"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {businessLabels.communication.subtitle}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls="customer-communication-body"
          className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          {isExpanded ? 'Hide / إخفاء' : 'Open / فتح'}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Collapsed by default: it is an action, but a long one, and it must not
          push the financial tabs below the fold when unused. */}
      {isExpanded && (
        <div id="customer-communication-body" className="mt-5 border-t border-slate-100 pt-5">
          <WhatsAppMessageComposer state={state} actions={actions} />
        </div>
      )}
    </section>
  );
};
