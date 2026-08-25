import React from 'react';
import { AlertTriangle, Copy, MessageCircle, RefreshCw } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';
import {
  MessageBodies,
  NormalizedWhatsAppPhone,
  TemplateLanguage,
} from '../types/communication.types';
import { ActionGate, OpenBlockReason } from '../utils/composer-state';

const blockMessages: Record<OpenBlockReason, string> = {
  NO_PHONE: 'No phone number saved for this customer / لا يوجد رقم هاتف محفوظ لهذا الزبون',
  INVALID_PHONE: 'This phone number cannot be read for WhatsApp / تعذّرت قراءة الرقم لواتساب',
  EMPTY_MESSAGE: 'Generate or write the message first / أنشئ أو اكتب الرسالة أولاً',
  MESSAGE_TOO_LONG: 'Message is too long for a WhatsApp link — copy it instead / الرسالة طويلة، انسخها بدل ذلك',
  URL_TOO_LONG: 'Message is too long for a WhatsApp link — copy it instead / الرسالة طويلة، انسخها بدل ذلك',
  PHONE_NOT_CONFIRMED: 'Confirm the different phone number first / أكّد الرقم المختلف أولاً',
};

const rejectionMessages: Record<string, string> = {
  EMPTY: 'No phone number saved / لا يوجد رقم هاتف',
  MULTIPLE_NUMBERS: 'This field holds more than one number / الحقل يحتوي أكثر من رقم',
  UNPARSEABLE: 'Unrecognised phone format / صيغة رقم غير مفهومة',
  TOO_SHORT: 'Phone number is too short / الرقم قصير جداً',
  TOO_LONG: 'Phone number is too long / الرقم طويل جداً',
};

const blockLabels: Record<TemplateLanguage, string> = {
  AR: businessLabels.communication.arabicMessage,
  EN: businessLabels.communication.englishMessage,
};

interface CommunicationPreviewProps {
  bodies: MessageBodies;
  /** Which blocks to show — one for AR or EN, both for AR+EN. */
  bodyLanguages: TemplateLanguage[];
  isCustomMessage: boolean;
  onBodyChange: (language: TemplateLanguage, body: string) => void;
  phone: NormalizedWhatsAppPhone;
  savedPhone: string;
  requiresPhoneConfirmation: boolean;
  phoneConfirmed: boolean;
  onPhoneConfirmedChange: (confirmed: boolean) => void;
  gate: ActionGate;
  awaitingOverwriteConfirm: boolean;
  onGenerate: () => void;
  onConfirmGenerate: () => void;
  onCancelGenerate: () => void;
  onCopy: () => void;
  onOpenWhatsApp: () => void;
}

export const CommunicationPreview: React.FC<CommunicationPreviewProps> = ({
  bodies,
  bodyLanguages,
  isCustomMessage,
  onBodyChange,
  phone,
  savedPhone,
  requiresPhoneConfirmation,
  phoneConfirmed,
  onPhoneConfirmedChange,
  gate,
  awaitingOverwriteConfirm,
  onGenerate,
  onConfirmGenerate,
  onCancelGenerate,
  onCopy,
  onOpenWhatsApp,
}) => (
  <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onGenerate}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {businessLabels.communication.generate}
      </button>
      <span className="text-xs text-slate-500">
        You send the message yourself in WhatsApp / الإرسال يتم منك داخل واتساب
      </span>
    </div>

    {awaitingOverwriteConfirm && (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          Generating will replace your edits / إعادة الإنشاء ستستبدل تعديلاتك
        </span>
        <button
          type="button"
          onClick={onConfirmGenerate}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Replace / استبدال
        </button>
        <button
          type="button"
          onClick={onCancelGenerate}
          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800"
        >
          {businessLabels.common.cancel}
        </button>
      </div>
    )}

    {/* One textarea per language, each in its own direction. Arabic and English
        in a single mixed box renders badly — the paragraphs fight over which
        edge they start from. They are joined only when copying or sending. */}
    <div className="space-y-3">
      {bodyLanguages.map((language) => (
        <label key={language} className="block text-sm">
          <span className="font-medium text-slate-700">
            {isCustomMessage ? businessLabels.communication.preview : blockLabels[language]}
          </span>
          <textarea
            dir={isCustomMessage ? 'auto' : language === 'AR' ? 'rtl' : 'ltr'}
            rows={bodyLanguages.length > 1 ? 7 : 9}
            value={bodies[language]}
            onChange={(event) => onBodyChange(language, event.target.value)}
            placeholder="Press Generate, or write the message here / اضغط إنشاء أو اكتب الرسالة هنا"
            className="user-text-pre mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm leading-relaxed text-slate-900"
          />
        </label>
      ))}
      {bodyLanguages.length > 1 && (
        <p className="text-xs text-slate-500">
          Both blocks are sent together, Arabic first / يتم إرسال النصّين معاً، العربي أولاً
        </p>
      )}
    </div>

    <div className="rounded-lg bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-600">{businessLabels.communication.sendingTo}:</span>
        <span className="font-semibold text-slate-900" dir="ltr">
          {phone.ok ? phone.display : '—'}
        </span>
        {!phone.ok && (
          <span className="text-red-700">{rejectionMessages[phone.reason] ?? phone.reason}</span>
        )}
        {phone.ok && phone.confidence === 'low' && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Assumed international / يُفترض أنه رقم دولي
          </span>
        )}
      </div>

      {requiresPhoneConfirmation && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
          <p className="flex items-start gap-2 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            This differs from the saved number ({savedPhone}) / هذا الرقم مختلف عن الرقم المحفوظ
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs font-medium text-amber-900">
            <input
              type="checkbox"
              checked={phoneConfirmed}
              onChange={(event) => onPhoneConfirmedChange(event.target.checked)}
              className="h-4 w-4"
            />
            I confirm this is the correct number / أؤكد أن هذا هو الرقم الصحيح
          </label>
        </div>
      )}
    </div>

    <div className="flex flex-wrap items-center gap-3">
      {/* Copy is the always-works path, so it carries the same visual weight. */}
      <button
        type="button"
        onClick={onCopy}
        disabled={!gate.canCopy}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600 hover:text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        {businessLabels.communication.copyMessage}
      </button>
      <button
        type="button"
        onClick={onOpenWhatsApp}
        disabled={!gate.canOpenWhatsApp}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {businessLabels.communication.openWhatsApp}
      </button>
      {gate.blockReason && (
        <span className="text-xs text-slate-600">{blockMessages[gate.blockReason]}</span>
      )}
    </div>
  </div>
);
