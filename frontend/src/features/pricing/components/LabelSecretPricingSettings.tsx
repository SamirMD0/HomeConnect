import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { KeyRound, Plus } from 'lucide-react';
import { useCreateLabelSecretEncoding, useLabelSecretConfiguration, useUpdateLabelSecretEncoding, useUpdateLabelSecretSettings } from '../hooks/usePricingPresets';
import { LabelSecretEncodingInput, LabelSecretEncodingMode } from '../types/pricing.types';

const emptyEncoding: Omit<LabelSecretEncodingInput, 'accountPassword'> = {
  name: '', mode: 'STAGED_DISCOUNT', prefix: '', suffix: '', offset: '0', digitMap: null, decimalPlaces: 0, isActive: true,
};

export const LabelSecretPricingSettings: React.FC = () => {
  const query = useLabelSecretConfiguration();
  const saveSettings = useUpdateLabelSecretSettings();
  const createEncoding = useCreateLabelSecretEncoding();
  const updateEncoding = useUpdateLabelSecretEncoding();
  const [allowedPresetIds, setAllowedPresetIds] = useState<string[]>([]);
  const [defaultPresetId, setDefaultPresetId] = useState('');
  const [defaultEncodingId, setDefaultEncodingId] = useState('');
  const [showCode, setShowCode] = useState(true);
  const [settingsPassword, setSettingsPassword] = useState('');
  const [encodingId, setEncodingId] = useState('new');
  const [encoding, setEncoding] = useState(emptyEncoding);
  const [encodingPassword, setEncodingPassword] = useState('');

  useEffect(() => {
    if (!query.data) return;
    setAllowedPresetIds(query.data.allowedPricingPresets.map((preset) => preset.id));
    setDefaultPresetId(query.data.settings?.defaultPricingPresetId ?? '');
    setDefaultEncodingId(query.data.settings?.defaultEncodingPresetId ?? '');
    setShowCode(query.data.settings?.showCodeOnLabel ?? true);
  }, [query.data]);

  const selectEncoding = (id: string) => {
    setEncodingId(id);
    const selected = query.data?.encodingPresets.find((item) => item.id === id);
    setEncoding(selected ? {
      name: selected.name, mode: selected.mode, prefix: selected.prefix, suffix: selected.suffix,
      offset: selected.offset, digitMap: selected.digitMap, decimalPlaces: selected.decimalPlaces, isActive: selected.isActive,
    } : emptyEncoding);
  };

  if (query.isLoading) return <div className="rounded-lg border bg-white p-4 text-sm text-slate-500">Loading label secret pricing…</div>;
  if (!query.data) return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load label secret pricing settings.</div>;
  const config = query.data;
  const activeEncodings = config.encodingPresets.filter((item) => item.isActive);
  const allowedPresets = config.availablePricingPresets.filter((preset) => allowedPresetIds.includes(preset.id));
  const pending = saveSettings.isPending || createEncoding.isPending || updateEncoding.isPending;

  const toggleAllowedPreset = (id: string, checked: boolean) => {
    setAllowedPresetIds((current) => checked ? [...current, id] : current.filter((presetId) => presetId !== id));
    if (!checked && defaultPresetId === id) setDefaultPresetId('');
  };

  const submitSettings = () => {
    if (!settingsPassword) return toast.error('Account password is required');
    saveSettings.mutate({
      allowedPricingPresetIds: allowedPresetIds,
      defaultPricingPresetId: defaultPresetId || null,
      defaultEncodingPresetId: defaultEncodingId || null,
      showCodeOnLabel: showCode,
      accountPassword: settingsPassword,
    }, { onSuccess: () => { setSettingsPassword(''); toast.success('Label secret settings saved'); }, onError: () => toast.error('Unable to save label secret settings') });
  };

  const submitEncoding = () => {
    if (!encodingPassword) return toast.error('Account password is required');
    const input = { ...encoding, digitMap: encoding.digitMap || null, accountPassword: encodingPassword };
    const mutation = encodingId === 'new' ? createEncoding : updateEncoding;
    const variables = encodingId === 'new' ? input : { id: encodingId, input };
    mutation.mutate(variables as never, { onSuccess: () => { setEncodingPassword(''); toast.success('Encoding preset saved'); }, onError: () => toast.error('Unable to save encoding preset') });
  };

  return <section className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
    <div className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-violet-700" /><h2 className="font-bold text-slate-900">Label Secret Pricing / تسعير رمز الملصق</h2></div>
    <p className="text-sm text-slate-600">Internal staff-code obfuscation only. Product prices, SKUs and barcodes are never changed.</p>
    <fieldset className="rounded-lg border border-violet-200 bg-white/70 p-3">
      <legend className="px-1 text-xs font-semibold text-slate-700">Allowed hidden pricing presets</legend>
      <p className="mb-2 text-xs text-slate-500">Enable at least one preset that calculates a price below the public selling price and not below cost.</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {config.availablePricingPresets.map((preset) => <label key={preset.id} className="flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={allowedPresetIds.includes(preset.id)} onChange={(event) => toggleAllowedPreset(preset.id, event.target.checked)} />
          {preset.name}
        </label>)}
        {!config.availablePricingPresets.length && <span className="text-sm text-slate-500">No active pricing presets are available.</span>}
      </div>
    </fieldset>
    <div className="grid gap-3 md:grid-cols-3">
      <Field label="Default hidden pricing preset">
        <select value={defaultPresetId} onChange={(event) => setDefaultPresetId(event.target.value)} className="control"><option value="">None — print no code</option>{allowedPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>
      </Field>
      <Field label="Default encoding preset">
        <select value={defaultEncodingId} onChange={(event) => setDefaultEncodingId(event.target.value)} className="control"><option value="">None — print no code</option>{activeEncodings.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.mode}</option>)}</select>
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" checked={showCode} onChange={(event) => setShowCode(event.target.checked)} />Show secret code on labels</label>
      <Field label="Admin password"><input type="password" value={settingsPassword} onChange={(event) => setSettingsPassword(event.target.value)} className="control" /></Field>
      <button type="button" disabled={pending} onClick={submitSettings} className="self-end rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save secret settings</button>
    </div>
    <div className="border-t border-violet-200 pt-4">
      <div className="mb-3 flex items-center gap-2"><Plus className="h-4 w-4" /><h3 className="font-semibold">Encoding rules</h3></div>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Edit preset"><select value={encodingId} onChange={(event) => selectEncoding(event.target.value)} className="control"><option value="new">New encoding preset</option>{config.encodingPresets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Name"><input value={encoding.name} onChange={(event) => setEncoding((value) => ({ ...value, name: event.target.value }))} className="control" /></Field>
        <Field label="Encoding mode"><select value={encoding.mode} onChange={(event) => { const mode = event.target.value as LabelSecretEncodingMode; setEncoding((value) => ({ ...value, mode, ...(mode === 'STAGED_DISCOUNT' ? { prefix: '', suffix: '' } : {}) })); }} className="control">{(['STAGED_DISCOUNT','PRICE','DISCOUNT_PERCENTAGE','OFFSET_PRICE','DIGIT_MAP_PRICE'] as const).map((mode) => <option key={mode} value={mode}>{mode.replaceAll('_',' ')}</option>)}</select></Field>
        <Field label="Decimal places"><select value={encoding.decimalPlaces} onChange={(event) => setEncoding((value) => ({ ...value, decimalPlaces: Number(event.target.value) }))} className="control"><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option></select></Field>
        {encoding.mode !== 'STAGED_DISCOUNT' && <Field label="Prefix"><input value={encoding.prefix} onChange={(event) => setEncoding((value) => ({ ...value, prefix: event.target.value }))} className="control" /></Field>}
        {encoding.mode !== 'STAGED_DISCOUNT' && <Field label="Suffix"><input value={encoding.suffix} onChange={(event) => setEncoding((value) => ({ ...value, suffix: event.target.value }))} className="control" /></Field>}
        {encoding.mode === 'STAGED_DISCOUNT' && <p className="self-end pb-2 text-xs text-slate-600 md:col-span-2">Digits are safe discount steps. Random letters are regenerated for every preview; staff ignore the letters.</p>}
        {encoding.mode === 'OFFSET_PRICE' && <Field label="Value offset"><input value={encoding.offset} onChange={(event) => setEncoding((value) => ({ ...value, offset: event.target.value }))} className="control" /></Field>}
        {encoding.mode === 'DIGIT_MAP_PRICE' && <Field label="Digit map (0 through 9)"><input value={encoding.digitMap ?? ''} onChange={(event) => setEncoding((value) => ({ ...value, digitMap: event.target.value }))} placeholder="MARKETPLUS" className="control" /></Field>}
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium"><input type="checkbox" checked={encoding.isActive} onChange={(event) => setEncoding((value) => ({ ...value, isActive: event.target.checked }))} />Active</label>
        <Field label="Admin password"><input type="password" value={encodingPassword} onChange={(event) => setEncodingPassword(event.target.value)} className="control" /></Field>
        <button type="button" disabled={pending || !encoding.name.trim()} onClick={submitEncoding} className="self-end rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save encoding preset</button>
      </div>
    </div>
  </section>;
};

const Field: React.FC<{label:string;children:React.ReactNode}> = ({ label, children }) => <label className="text-xs font-medium text-slate-600">{label}{children}</label>;
