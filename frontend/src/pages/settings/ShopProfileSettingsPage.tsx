import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Building2, Image as ImageIcon, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { usePricingCardTemplates } from '../../features/pricing-card/hooks/usePricingCardTemplates';
import { useShopProfile, useUpdateShopProfile, useUpdateShopProfileLogo } from '../../features/pricing-card/hooks/useShopProfile';
import type {
  CurrencyDisplayMode,
  PricingCardRolloutMode,
  UpdateShopProfileInput,
} from '../../features/pricing-card/types/pricing-card.types';
import { useAuth } from '../../hooks/useAuth';

const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp';
const LOGO_MAX_BYTES = 512 * 1024;
const LOGO_MIME: Record<string, 'image/png' | 'image/jpeg' | 'image/webp'> = {
  'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/webp': 'image/webp',
};

export function ShopProfileSettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useShopProfile();
  const templates = usePricingCardTemplates(true);
  const updateProfile = useUpdateShopProfile();
  const updateLogo = useUpdateShopProfileLogo();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [detailPassword, setDetailPassword] = useState('');
  const [logoPassword, setLogoPassword] = useState('');
  const [pendingLogo, setPendingLogo] = useState<PendingLogo | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data) return;
    setForm({
      name: profile.data.name,
      tagline: profile.data.tagline ?? '',
      currencyCode: profile.data.currencyCode,
      currencyDisplay: profile.data.currencyDisplay,
      defaultPricingCardTemplateId: profile.data.defaultPricingCardTemplateId ?? '',
      defaultCardValidityDays: String(profile.data.defaultCardValidityDays),
      snapshotPrintedCards: profile.data.snapshotPrintedCards,
      pricingCardRolloutMode: profile.data.pricingCardRolloutMode,
    });
  }, [profile.data]);

  const dirty = useMemo(() => profile.data ? isDirty(form, profile.data) : false, [form, profile.data]);

  if (user?.role !== 'ADMIN') {
    return <AdminGate onBack={() => navigate('/settings')} />;
  }

  const onLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    const file = event.target.files?.[0];
    if (!file) { setPendingLogo(null); return; }
    const mimeType = LOGO_MIME[file.type];
    if (!mimeType) { setLogoError('Logo must be a PNG, JPEG, or WEBP.'); setPendingLogo(null); return; }
    if (file.size > LOGO_MAX_BYTES) { setLogoError('Logo must be 512 KB or smaller.'); setPendingLogo(null); return; }
    void file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
      setPendingLogo({ dataBase64: btoa(binary), mimeType, previewUrl: URL.createObjectURL(file), byteSize: file.size });
    });
  };

  const saveDetails = () => {
    if (!profile.data) return;
    if (!detailPassword) { toast.error('Account password is required'); return; }
    const changes = detailChanges(form, profile.data);
    if (Object.keys(changes).length === 0) { toast('No changes to save'); return; }
    updateProfile.mutate({ ...changes, accountPassword: detailPassword }, {
      onSuccess: () => { setDetailPassword(''); toast.success('Shop profile updated'); },
      onError: () => toast.error('Unable to save the shop profile'),
    });
  };

  const saveLogo = () => {
    if (!pendingLogo) return;
    if (!logoPassword) { toast.error('Account password is required'); return; }
    updateLogo.mutate({ ...pendingLogo, accountPassword: logoPassword }, {
      onSuccess: () => { setLogoPassword(''); setPendingLogo(null); toast.success('Shop logo updated'); },
      onError: () => toast.error('Unable to save the shop logo'),
    });
  };

  const rolloutOptions: Array<{ value: PricingCardRolloutMode; label: string; hint: string }> = [
    { value: 'LEGACY_ONLY', label: 'Legacy labels only', hint: 'Pricing card UI hidden everywhere.' },
    { value: 'BOTH', label: 'Both label and pricing card', hint: 'Employees choose per print.' },
    { value: 'TEMPLATE_ONLY', label: 'Pricing cards only', hint: 'Legacy label UI hidden.' },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button type="button" onClick={() => navigate('/settings')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </button>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Shop profile</h1>
        <p className="mt-1 text-sm text-slate-500">Logo, name, currency, and the defaults every printed pricing card inherits.</p>
      </header>

      {profile.isLoading && <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">Loading shop profile…</p>}
      {profile.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load the shop profile.</p>}

      {profile.data && (
        <>
          <section aria-labelledby="details-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-slate-500" /><h2 id="details-heading" className="text-lg font-semibold text-slate-900">Details</h2></div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Shop name"><input type="text" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} className={inputClass} /></Field>
              <Field label="Tagline"><input type="text" value={form.tagline} onChange={(event) => setForm((current) => ({ ...current, tagline: event.target.value }))} maxLength={240} className={inputClass} /></Field>
              <Field label="Currency code (ISO-4217)"><input type="text" value={form.currencyCode} onChange={(event) => setForm((current) => ({ ...current, currencyCode: event.target.value.toUpperCase() }))} maxLength={3} className={`${inputClass} font-mono uppercase`} /></Field>
              <Field label="Currency display">
                <select value={form.currencyDisplay} onChange={(event) => setForm((current) => ({ ...current, currencyDisplay: event.target.value as CurrencyDisplayMode }))} className={inputClass}>
                  <option value="SYMBOL">Symbol only ($)</option>
                  <option value="CODE">Code only (USD)</option>
                  <option value="SYMBOL_AND_CODE">Symbol and code ($ USD)</option>
                </select>
              </Field>
              <Field label="Default pricing card template">
                <select value={form.defaultPricingCardTemplateId} onChange={(event) => setForm((current) => ({ ...current, defaultPricingCardTemplateId: event.target.value }))} className={inputClass}>
                  <option value="">— None —</option>
                  {(templates.data ?? []).map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Default valid-until days"><input type="number" min={0} max={3650} value={form.defaultCardValidityDays} onChange={(event) => setForm((current) => ({ ...current, defaultCardValidityDays: event.target.value }))} className={inputClass} /></Field>
              <Field label="Rollout mode" fullWidth>
                <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                  {rolloutOptions.map((option) => (
                    <label key={option.value} className="flex items-start gap-3 text-sm text-slate-800">
                      <input type="radio" name="rolloutMode" value={option.value} checked={form.pricingCardRolloutMode === option.value} onChange={() => setForm((current) => ({ ...current, pricingCardRolloutMode: option.value }))} className="mt-1" />
                      <span><span className="font-medium">{option.label}</span><span className="block text-xs text-slate-500">{option.hint}</span></span>
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Snapshot every printed card" fullWidth>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input type="checkbox" checked={form.snapshotPrintedCards} onChange={(event) => setForm((current) => ({ ...current, snapshotPrintedCards: event.target.checked }))} />
                  Store a copy of each printed card for reprint and audit.
                </label>
              </Field>
            </div>
            <PasswordRow
              password={detailPassword}
              onChange={setDetailPassword}
              onSave={saveDetails}
              disabled={!dirty || updateProfile.isPending}
              label={updateProfile.isPending ? 'Saving…' : 'Save details'}
            />
          </section>

          <section aria-labelledby="logo-heading" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-slate-500" /><h2 id="logo-heading" className="text-lg font-semibold text-slate-900">Logo</h2></div>
            <div className="flex flex-wrap items-start gap-6">
              <figure className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
                {pendingLogo?.previewUrl
                  ? <img src={pendingLogo.previewUrl} alt="New logo preview" className="max-h-full max-w-full" />
                  : profile.data.logoDataUrl
                    ? <img src={profile.data.logoDataUrl} alt={`${profile.data.name} logo`} className="max-h-full max-w-full" />
                    : <span className="text-xs text-slate-400">No logo</span>}
              </figure>
              <div className="flex-1 space-y-2">
                <input type="file" accept={LOGO_ACCEPT} onChange={onLogoFile} className="block text-sm" />
                <p className="text-xs text-slate-500">PNG, JPEG, or WEBP. Maximum 512 KB. Templates control the printed size in millimetres.</p>
                {logoError && <p role="alert" className="text-xs text-red-700">{logoError}</p>}
              </div>
            </div>
            <PasswordRow
              password={logoPassword}
              onChange={setLogoPassword}
              onSave={saveLogo}
              disabled={!pendingLogo || updateLogo.isPending}
              label={updateLogo.isPending ? 'Uploading…' : 'Save logo'}
            />
          </section>
        </>
      )}
    </div>
  );
}

interface FormState {
  name: string;
  tagline: string;
  currencyCode: string;
  currencyDisplay: CurrencyDisplayMode;
  defaultPricingCardTemplateId: string;
  defaultCardValidityDays: string;
  snapshotPrintedCards: boolean;
  pricingCardRolloutMode: PricingCardRolloutMode;
}

interface PendingLogo {
  dataBase64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  previewUrl: string;
  byteSize: number;
}

const emptyForm: FormState = {
  name: '', tagline: '', currencyCode: 'USD', currencyDisplay: 'SYMBOL',
  defaultPricingCardTemplateId: '', defaultCardValidityDays: '30',
  snapshotPrintedCards: true, pricingCardRolloutMode: 'BOTH',
};

const inputClass = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function Field({ label, children, fullWidth = false }: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <label className={`space-y-1 text-sm text-slate-700 ${fullWidth ? 'md:col-span-2' : ''}`}>
      <span className="block font-medium">{label}</span>
      {children}
    </label>
  );
}

function PasswordRow({ password, onChange, onSave, disabled, label }: { password: string; onChange: (value: string) => void; onSave: () => void; disabled: boolean; label: string }) {
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
      <label className="flex-1 space-y-1 text-sm text-slate-700">
        <span className="flex items-center gap-1 font-medium"><KeyRound className="h-3.5 w-3.5" /> Account password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => onChange(event.target.value)} className={inputClass} />
      </label>
      <button type="button" onClick={onSave} disabled={disabled} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{label}</button>
    </div>
  );
}

function AdminGate({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
      <h1 className="text-xl font-semibold">Shop profile is admin-only</h1>
      <p className="text-sm">This screen configures the shop identity used on every printed pricing card.</p>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">Back to settings</button>
    </div>
  );
}

export function detailChanges(form: FormState, current: { name: string; tagline: string | null; currencyCode: string; currencyDisplay: CurrencyDisplayMode; defaultPricingCardTemplateId: string | null; defaultCardValidityDays: number; snapshotPrintedCards: boolean; pricingCardRolloutMode: PricingCardRolloutMode }): Partial<Omit<UpdateShopProfileInput, 'accountPassword'>> {
  const changes: Partial<Omit<UpdateShopProfileInput, 'accountPassword'>> = {};
  const trimmedName = form.name.trim();
  if (trimmedName !== current.name) changes.name = trimmedName;
  const nextTagline = form.tagline.trim() === '' ? null : form.tagline.trim();
  if (nextTagline !== current.tagline) changes.tagline = nextTagline;
  if (form.currencyCode !== current.currencyCode) changes.currencyCode = form.currencyCode;
  if (form.currencyDisplay !== current.currencyDisplay) changes.currencyDisplay = form.currencyDisplay;
  const nextTemplate = form.defaultPricingCardTemplateId === '' ? null : form.defaultPricingCardTemplateId;
  if (nextTemplate !== current.defaultPricingCardTemplateId) changes.defaultPricingCardTemplateId = nextTemplate;
  const nextValidity = Number(form.defaultCardValidityDays);
  if (Number.isFinite(nextValidity) && nextValidity !== current.defaultCardValidityDays) changes.defaultCardValidityDays = nextValidity;
  if (form.snapshotPrintedCards !== current.snapshotPrintedCards) changes.snapshotPrintedCards = form.snapshotPrintedCards;
  if (form.pricingCardRolloutMode !== current.pricingCardRolloutMode) changes.pricingCardRolloutMode = form.pricingCardRolloutMode;
  return changes;
}

export function isDirty(form: FormState, current: { name: string; tagline: string | null; currencyCode: string; currencyDisplay: CurrencyDisplayMode; defaultPricingCardTemplateId: string | null; defaultCardValidityDays: number; snapshotPrintedCards: boolean; pricingCardRolloutMode: PricingCardRolloutMode }): boolean {
  return Object.keys(detailChanges(form, current)).length > 0;
}
