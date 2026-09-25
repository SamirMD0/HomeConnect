import { Printer } from 'lucide-react';
import { ExportPdfButton } from '../../products/components/ExportPdfButton';
import type { PricingCardTemplate } from '../types/pricing-card.types';

interface PricingCardControlsProps {
  templates: PricingCardTemplate[];
  selectedTemplateId: string;
  copies: number;
  validUntil: string;
  disabled: boolean;
  cardCount: number;
  onTemplateChange: (id: string) => void;
  onCopiesChange: (copies: number) => void;
  onValidUntilChange: (date: string) => void;
  onPrint: () => void;
}

export function PricingCardControls({
  templates, selectedTemplateId, copies, validUntil, disabled, cardCount,
  onTemplateChange, onCopiesChange, onValidUntilChange, onPrint,
}: PricingCardControlsProps) {
  const selected = templates.find(({ id }) => id === selectedTemplateId);
  return (
    <div className="no-print flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <Field label="Template">
        <select aria-label="Template" value={selectedTemplateId} onChange={(event) => onTemplateChange(event.target.value)} className="control min-w-56">
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select>
      </Field>
      <Field label="Copies">
        <input aria-label="Copies" type="number" min="1" max="100" value={copies} onChange={(event) => onCopiesChange(clampCopies(event.target.value))} className="control w-24" />
      </Field>
      <Field label="Valid until">
        <input aria-label="Valid until" type="date" required value={validUntil} onChange={(event) => onValidUntilChange(event.target.value)} className="control" />
      </Field>
      <ExportPdfButton disabled={disabled} paper={selected?.paperSize ?? 'A4'} labelCount={cardCount} />
      <button type="button" disabled={disabled} onClick={onPrint} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        <Printer className="h-4 w-4" /> Print pricing card
      </button>
    </div>
  );
}

export function clampCopies(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.trunc(parsed))) : 1;
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="text-xs font-medium text-slate-600">{label}{children}</label>
);
