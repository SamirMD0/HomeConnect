import React from 'react';
import { businessLabels } from '../../../shared/labels/business-labels';
import { MessageLanguage, MessageTone, MessageType } from '../types/communication.types';
import {
  MESSAGE_TONES,
  MESSAGE_TYPES,
  messageToneLabels,
  messageTypeLabels,
} from '../utils/message-templates';

const languageOptions: Array<{ value: MessageLanguage; label: string }> = [
  { value: 'AR', label: 'AR / عربي' },
  { value: 'EN', label: 'EN' },
  { value: 'AR_EN', label: 'AR + EN' },
];

interface MessageTemplateSelectorProps {
  type: MessageType;
  language: MessageLanguage;
  tone: MessageTone;
  onTypeChange: (type: MessageType) => void;
  onLanguageChange: (language: MessageLanguage) => void;
  onToneChange: (tone: MessageTone) => void;
}

export const MessageTemplateSelector: React.FC<MessageTemplateSelectorProps> = ({
  type,
  language,
  tone,
  onTypeChange,
  onLanguageChange,
  onToneChange,
}) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <label className="block text-sm">
      <span className="font-medium text-slate-700">{businessLabels.communication.messageType}</span>
      <select
        value={type}
        onChange={(event) => onTypeChange(event.target.value as MessageType)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      >
        {MESSAGE_TYPES.map((option) => (
          <option key={option} value={option}>
            {messageTypeLabels[option]}
          </option>
        ))}
      </select>
    </label>

    <div className="text-sm">
      <span className="font-medium text-slate-700">{businessLabels.communication.language}</span>
      <div className="mt-1 flex rounded-lg border border-slate-300 p-0.5" role="group">
        {languageOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onLanguageChange(option.value)}
            aria-pressed={language === option.value}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
              language === option.value
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>

    <label className="block text-sm">
      <span className="font-medium text-slate-700">{businessLabels.communication.tone}</span>
      <select
        value={tone}
        onChange={(event) => onToneChange(event.target.value as MessageTone)}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      >
        {MESSAGE_TONES.map((option) => (
          <option key={option} value={option}>
            {messageToneLabels[option]}
          </option>
        ))}
      </select>
    </label>
  </div>
);
