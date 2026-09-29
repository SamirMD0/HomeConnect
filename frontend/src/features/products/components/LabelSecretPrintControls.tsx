import React from 'react';
import { KeyRound } from 'lucide-react';
import { LabelSecretConfiguration } from '../../pricing/types/pricing.types';
import { ProductLabelData } from '../types/product.types';
import { parseManualDiscountStages } from '../utils/discount-stages';

export const LabelSecretPrintControls: React.FC<{
  config:LabelSecretConfiguration;
  pricingPresetId:string;
  encodingPresetId:string;
  password:string;
  manualStages:string;
  manualStagesEnabled:boolean;
  onPricingPresetChange:(value:string)=>void;
  onEncodingPresetChange:(value:string)=>void;
  onPasswordChange:(value:string)=>void;
  onManualStagesChange:(value:string)=>void;
  onManualStagesEnabledChange:(value:boolean)=>void;
  onApply:()=>void;
  pending:boolean;
  preview?:ProductLabelData;
}> = ({ config, pricingPresetId, encodingPresetId, password, manualStages, manualStagesEnabled, onPricingPresetChange, onEncodingPresetChange, onPasswordChange, onManualStagesChange, onManualStagesEnabledChange, onApply, pending, preview }) => {
  const encoding = config.encodingPresets.find((item) => item.id === encodingPresetId);
  const staged = encoding?.mode === 'STAGED_DISCOUNT';
  const manualStagesValid = !manualStagesEnabled || parseManualDiscountStages(manualStages) !== null;
  return <section className="no-print rounded-lg border border-violet-200 bg-violet-50 p-3">
    <div className="mb-3 flex items-center gap-2"><KeyRound className="h-4 w-4 text-violet-700" /><h3 className="text-sm font-bold">Staff Price Code / رمز سعر الموظف</h3></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Hidden pricing preset"><select value={pricingPresetId} onChange={(event) => onPricingPresetChange(event.target.value)} className="control"><option value="">Select preset</option>{config.allowedPricingPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></Field>
      <Field label="Encoding"><select value={encodingPresetId} onChange={(event) => onEncodingPresetChange(event.target.value)} className="control"><option value="">Select encoding</option>{config.encodingPresets.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name} — {item.mode.replaceAll('_',' ')}</option>)}</select></Field>
      <Field label="Admin password"><input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} className="control" /></Field>
      <button type="button" disabled={pending || !pricingPresetId || !encodingPresetId || !password || !manualStagesValid} onClick={onApply} className="self-end rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{staged && !manualStagesEnabled ? 'Generate code for this print run' : 'Apply to this print run'}</button>
    </div>
    {staged && <div className="mt-3 rounded-lg border border-violet-200 bg-white/70 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-slate-600">Automatic mode creates safe percentage steps and new random letters each time.</p>
        <button type="button" onClick={() => onManualStagesEnabledChange(!manualStagesEnabled)} className="rounded-md border border-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-800">{manualStagesEnabled ? 'Use automatic generation' : 'Manual set'}</button>
      </div>
      {manualStagesEnabled && <label className="mt-3 block text-xs font-medium text-slate-600">Manual discount steps (%)
        <input value={manualStages} onChange={(event) => onManualStagesChange(event.target.value)} placeholder="7, 2, 1" className="control max-w-sm" />
        <span className="mt-1 block font-normal">Use 1–12 whole-number steps. Their total must not exceed the calculated safe discount.</span>
        {!manualStagesValid && <span className="mt-1 block text-red-600">Enter comma-separated steps from 1 to 99, for example: 7, 2, 1.</span>}
      </label>}
    </div>}
    <div className="mt-3 grid gap-2 border-t border-violet-200 pt-3 text-sm sm:grid-cols-3">
      <p>Visible price: <strong>{preview?.cashPrice ? `$${preview.cashPrice}` : '—'}</strong></p>
      <p>Internal source price: <strong>{preview?.secretPrice ? `$${preview.secretPrice}` : 'Apply to preview'}</strong></p>
      <p>Preview: <strong className="font-mono">{preview?.staffLabelCode ?? 'No staff code'}</strong></p>
      {encoding && <p className="sm:col-span-3 text-xs text-slate-600">Mode: {encoding.mode.replaceAll('_',' ')} · Prefix “{encoding.prefix || 'none'}” · Suffix “{encoding.suffix || 'none'}”</p>}
    </div>
  </section>;
};

const Field:React.FC<{label:string;children:React.ReactNode}>=({label,children})=><label className="text-xs font-medium text-slate-600">{label}{children}</label>;
