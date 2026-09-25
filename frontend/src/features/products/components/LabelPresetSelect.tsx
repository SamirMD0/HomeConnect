import React from 'react';
import { LabelPresetKey, LabelPresetName } from '../utils/product-label-settings';

export const LabelPresetSelect: React.FC<{ value: LabelPresetKey; onSelect: (key: LabelPresetName) => void }> = ({ value, onSelect }) => (
  <label className="text-xs font-medium text-slate-600">
    Label type / نوع الملصق
    <select
      value={value}
      onChange={(event) => { if (event.target.value !== 'CUSTOM') onSelect(event.target.value as LabelPresetName); }}
      className="mt-1 block h-9 rounded-md border border-slate-300 px-2 text-sm"
    >
      <option value="LARGE">Large — with price (72×50 mm)</option>
      <option value="SMALL">Small — without price (58×40 mm)</option>
      <option value="CUSTOM">Custom</option>
    </select>
  </label>
);
