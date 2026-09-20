import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Save, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { PricingCard } from '../../features/pricing-card/components/PricingCard';
import {
  useArchivePricingCardTemplate,
  useCreatePricingCardTemplate,
  usePricingCardTemplate,
  useUpdatePricingCardTemplate,
} from '../../features/pricing-card/hooks/usePricingCardTemplates';
import { useShopProfile } from '../../features/pricing-card/hooks/useShopProfile';
import { pricingCardSamples } from '../../features/pricing-card/samples';
import { PricingCardTemplateConfigZ, type PricingCardTemplateConfig } from '../../features/pricing-card/schema/template-config.z';
import type {
  PricingCardTemplate,
  PricingCardTemplateInput,
} from '../../features/pricing-card/types/pricing-card.types';
import { useAuth } from '../../hooks/useAuth';
import { errorMessage } from './FeatureIconsPage';

const defaultConfig: PricingCardTemplateConfig = {
  configVersion: 1,
  header: {
    companyLogo: { show: true, sizeMm: 10, position: 'left' },
    brand: { display: 'text', position: 'right', sizeMm: 8 },
  },
  body: {
    title: { show: true, maxLines: 2, fontScale: 1 },
    model: { show: true, prefix: 'Model: ' },
    dimensions: { show: false },
    specs: { show: true, maxRows: 4 },
    image: { show: false, columnWidthPct: 0 },
  },
  features: { show: true, layout: 'row', showLabels: true, showValues: false },
  price: { show: true, fontScale: 1.4, weight: 800, emphasis: 'plain', validUntil: { show: true, format: 'd-mon-y' } },
  sku: { show: true, showSecretCode: true, prefix: 'SKU: ' },
  barcode: { show: true, showDigits: true, targetWidthMm: 40 },
  appearance: { marginMm: 2, innerGapMm: 1, borderPx: 1, sectionDividers: true, fontScale: 1, orientation: 'portrait' },
};

export function PricingCardTemplateEditorPage() {
  const { templateId = 'new' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = templateId === 'new';
  const templateQuery = usePricingCardTemplate(isNew ? '' : templateId);
  const create = useCreatePricingCardTemplate();
  const update = useUpdatePricingCardTemplate();
  const archive = useArchivePricingCardTemplate();
  const profile = useShopProfile();

  const [form, setForm] = useState<TemplateFormState>(() => templateQuery.data && !isNew ? fromTemplate(templateQuery.data) : emptyForm());
  const [sampleIndex, setSampleIndex] = useState(0);
  const [configError, setConfigError] = useState<string | null>(null);
  const [seededTemplateId, setSeededTemplateId] = useState<string | null>(templateQuery.data?.id ?? null);

  useEffect(() => {
    if (isNew || !templateQuery.data || templateQuery.data.id === seededTemplateId) return;
    setForm(fromTemplate(templateQuery.data));
    setSeededTemplateId(templateQuery.data.id);
  }, [isNew, seededTemplateId, templateQuery.data]);

  const parsedConfig = useMemo(() => {
    const parsed = PricingCardTemplateConfigZ.safeParse(form.config);
    return parsed.success ? parsed.data : null;
  }, [form.config]);
  useEffect(() => {
    if (!parsedConfig) {
      const parsed = PricingCardTemplateConfigZ.safeParse(form.config);
      setConfigError(!parsed.success ? parsed.error.issues[0]?.message ?? 'Invalid template config' : null);
    } else setConfigError(null);
  }, [form.config, parsedConfig]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-3xl space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-xl font-semibold">Template editor is admin-only</h1>
        <button type="button" onClick={() => navigate('/pricing-cards/templates')} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">Back to templates</button>
      </div>
    );
  }

  const previewTemplate: PricingCardTemplate | null = parsedConfig ? {
    id: templateQuery.data?.id ?? 'preview', name: form.name || 'Preview',
    description: form.description ?? null,
    paperMode: form.paperMode, paperSize: form.paperMode === 'SHEET' ? (form.paperSize ?? 'A4') : null,
    cardWidthMm: String(form.cardWidthMm), cardHeightMm: String(form.cardHeightMm),
    configVersion: 1, config: parsedConfig, featureMax: form.featureMax,
    specKeyOrder: form.specKeyOrder,
    defaultValidityDays: form.defaultValidityDays, isActive: true,
    archivedAt: null, archivedReason: null,
  } : null;

  const sample = pricingCardSamples[Math.min(sampleIndex, pricingCardSamples.length - 1)];

  const saveDraft = (mode: 'update' | 'create') => {
    if (!parsedConfig) { toast.error(configError ?? 'Template config is invalid'); return; }
    const input: PricingCardTemplateInput = {
      name: form.name.trim(),
      description: form.description?.trim() ? form.description.trim() : null,
      paperMode: form.paperMode,
      paperSize: form.paperMode === 'SHEET' ? (form.paperSize ?? 'A4') : null,
      cardWidthMm: form.cardWidthMm, cardHeightMm: form.cardHeightMm,
      config: parsedConfig, featureMax: form.featureMax,
      specKeyOrder: form.specKeyOrder,
      defaultValidityDays: form.defaultValidityDays ?? null,
    };
    const done = {
      onSuccess: (saved: PricingCardTemplate) => {
        toast.success(mode === 'create' ? 'Template created' : 'Template saved');
        if (mode === 'create' || isNew) navigate(`/pricing-cards/templates/${saved.id}`);
      },
      onError: (error: unknown) => toast.error(errorMessage(error) ?? 'Unable to save template'),
    };
    if (mode === 'update' && !isNew) update.mutate({ id: templateId, input }, done);
    else create.mutate(input, done);
  };

  const doArchive = () => {
    if (isNew) return;
    if (!window.confirm(`Archive the template "${form.name}"? Cards bound to it keep their printed snapshots, but it can no longer be selected.`)) return;
    archive.mutate({ id: templateId }, {
      onSuccess: () => { toast.success('Template archived'); navigate('/pricing-cards/templates'); },
      onError: (error) => toast.error(errorMessage(error) ?? 'Unable to archive template'),
    });
  };

  const pending = create.isPending || update.isPending || archive.isPending;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <button type="button" onClick={() => navigate('/pricing-cards/templates')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"><ArrowLeft className="h-4 w-4" /> Templates</button>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{isNew ? 'New pricing card template' : `Edit template: ${form.name || '…'}`}</h1>
        <p className="mt-1 text-sm text-slate-500">Every change is audited under PRICING_CARD_TEMPLATE.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); saveDraft(isNew ? 'create' : 'update'); }}>
          <Section title="Identity">
            <Field label="Name"><input type="text" required maxLength={120} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className={inputClass} /></Field>
            <Field label="Description"><input type="text" maxLength={500} value={form.description ?? ''} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={inputClass} /></Field>
          </Section>

          <Section title="Paper">
            <Field label="Mode">
              <select value={form.paperMode} onChange={(event) => setForm((current) => ({ ...current, paperMode: event.target.value as PricingCardTemplateInput['paperMode'] }))} className={inputClass}>
                <option value="SINGLE_STICKER">Single sticker</option>
                <option value="SHEET">Sheet</option>
              </select>
            </Field>
            {form.paperMode === 'SHEET' && (
              <Field label="Sheet size">
                <select value={form.paperSize ?? 'A4'} onChange={(event) => setForm((current) => ({ ...current, paperSize: event.target.value as 'A4' | 'LETTER' }))} className={inputClass}>
                  <option value="A4">A4</option>
                  <option value="LETTER">Letter</option>
                </select>
              </Field>
            )}
            <Field label="Card width (mm)"><input type="number" min={20} max={210} value={form.cardWidthMm} onChange={(event) => setForm((current) => ({ ...current, cardWidthMm: Number(event.target.value) || 0 }))} className={inputClass} /></Field>
            <Field label="Card height (mm)"><input type="number" min={20} max={210} value={form.cardHeightMm} onChange={(event) => setForm((current) => ({ ...current, cardHeightMm: Number(event.target.value) || 0 }))} className={inputClass} /></Field>
          </Section>

          <Section title="Header">
            <Toggle label="Company logo" checked={form.config.header.companyLogo.show} onChange={(show) => setConfigPart(setForm, 'header', (h) => ({ ...h, companyLogo: { ...h.companyLogo, show } }))} />
            <Field label="Logo size (mm)"><input type="number" min={1} max={100} value={form.config.header.companyLogo.sizeMm} onChange={(event) => setConfigPart(setForm, 'header', (h) => ({ ...h, companyLogo: { ...h.companyLogo, sizeMm: Number(event.target.value) || 1 } }))} className={inputClass} /></Field>
            <Field label="Logo position">
              <select value={form.config.header.companyLogo.position} onChange={(event) => setConfigPart(setForm, 'header', (h) => ({ ...h, companyLogo: { ...h.companyLogo, position: event.target.value as 'left' | 'right' } }))} className={inputClass}>
                <option value="left">Left</option><option value="right">Right</option>
              </select>
            </Field>
            <Field label="Brand display">
              <select value={form.config.header.brand.display} onChange={(event) => setConfigPart(setForm, 'header', (h) => ({ ...h, brand: { ...h.brand, display: event.target.value as 'text' | 'logo' | 'logo+text' } }))} className={inputClass}>
                <option value="text">Text only</option><option value="logo">Logo only</option><option value="logo+text">Logo and text</option>
              </select>
            </Field>
            <Field label="Brand position">
              <select value={form.config.header.brand.position} onChange={(event) => setConfigPart(setForm, 'header', (h) => ({ ...h, brand: { ...h.brand, position: event.target.value as 'left' | 'right' } }))} className={inputClass}>
                <option value="left">Left</option><option value="right">Right</option>
              </select>
            </Field>
          </Section>

          <Section title="Body">
            <Toggle label="Title" checked={form.config.body.title.show} onChange={(show) => setConfigPart(setForm, 'body', (b) => ({ ...b, title: { ...b.title, show } }))} />
            <Field label="Title max lines">
              <select value={form.config.body.title.maxLines} onChange={(event) => setConfigPart(setForm, 'body', (b) => ({ ...b, title: { ...b.title, maxLines: Number(event.target.value) as 1 | 2 | 3 } }))} className={inputClass}>
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </select>
            </Field>
            <Toggle label="Model" checked={form.config.body.model.show} onChange={(show) => setConfigPart(setForm, 'body', (b) => ({ ...b, model: { ...b.model, show } }))} />
            <Field label="Model prefix"><input type="text" maxLength={40} value={form.config.body.model.prefix ?? ''} onChange={(event) => setConfigPart(setForm, 'body', (b) => ({ ...b, model: { ...b.model, prefix: event.target.value } }))} className={inputClass} /></Field>
            <Toggle label="Dimensions" checked={form.config.body.dimensions.show} onChange={(show) => setConfigPart(setForm, 'body', (b) => ({ ...b, dimensions: { show } }))} />
            <Toggle label="Specs" checked={form.config.body.specs.show} onChange={(show) => setConfigPart(setForm, 'body', (b) => ({ ...b, specs: { ...b.specs, show } }))} />
            <Field label="Spec max rows"><input type="number" min={0} max={40} value={form.config.body.specs.maxRows} onChange={(event) => setConfigPart(setForm, 'body', (b) => ({ ...b, specs: { ...b.specs, maxRows: Number(event.target.value) || 0 } }))} className={inputClass} /></Field>
            <Toggle label="Image column" checked={form.config.body.image.show} onChange={(show) => setConfigPart(setForm, 'body', (b) => ({ ...b, image: { ...b.image, show } }))} />
            <Field label="Image width (%)"><input type="number" min={0} max={80} value={form.config.body.image.columnWidthPct} onChange={(event) => setConfigPart(setForm, 'body', (b) => ({ ...b, image: { ...b.image, columnWidthPct: Number(event.target.value) || 0 } }))} className={inputClass} /></Field>
          </Section>

          <Section title="Features">
            <Toggle label="Show features block" checked={form.config.features.show} onChange={(show) => setConfigPart(setForm, 'features', (f) => ({ ...f, show }))} />
            <Field label="Layout">
              <select value={form.config.features.layout} onChange={(event) => setConfigPart(setForm, 'features', (f) => ({ ...f, layout: event.target.value as 'row' | 'grid-2x3' | 'grid-3x2' }))} className={inputClass}>
                <option value="row">Row</option><option value="grid-2x3">2 × 3 grid</option><option value="grid-3x2">3 × 2 grid</option>
              </select>
            </Field>
            <Toggle label="Show labels" checked={form.config.features.showLabels} onChange={(showLabels) => setConfigPart(setForm, 'features', (f) => ({ ...f, showLabels }))} />
            <Toggle label="Show values" checked={form.config.features.showValues} onChange={(showValues) => setConfigPart(setForm, 'features', (f) => ({ ...f, showValues }))} />
            <Field label="Feature max"><input type="number" min={0} max={8} value={form.featureMax} onChange={(event) => setForm((current) => ({ ...current, featureMax: Number(event.target.value) || 0 }))} className={inputClass} /></Field>
          </Section>

          <Section title="Price">
            <Toggle label="Show price" checked={form.config.price.show} onChange={(show) => setConfigPart(setForm, 'price', (p) => ({ ...p, show }))} />
            <Field label="Price font scale"><input type="number" step="0.1" min={0.5} max={5} value={form.config.price.fontScale} onChange={(event) => setConfigPart(setForm, 'price', (p) => ({ ...p, fontScale: Number(event.target.value) || 1 }))} className={inputClass} /></Field>
            <Field label="Weight">
              <select value={form.config.price.weight} onChange={(event) => setConfigPart(setForm, 'price', (p) => ({ ...p, weight: Number(event.target.value) as 500 | 700 | 800 | 900 }))} className={inputClass}>
                <option value={500}>500</option><option value={700}>700</option><option value={800}>800</option><option value={900}>900</option>
              </select>
            </Field>
            <Field label="Emphasis">
              <select value={form.config.price.emphasis} onChange={(event) => setConfigPart(setForm, 'price', (p) => ({ ...p, emphasis: event.target.value as 'plain' | 'boxed' | 'underlined' }))} className={inputClass}>
                <option value="plain">Plain</option><option value="boxed">Boxed</option><option value="underlined">Underlined</option>
              </select>
            </Field>
            <Toggle label="Valid until block" checked={form.config.price.validUntil.show} onChange={(show) => setConfigPart(setForm, 'price', (p) => ({ ...p, validUntil: { ...p.validUntil, show } }))} />
            <Field label="Valid-until format">
              <select value={form.config.price.validUntil.format} onChange={(event) => setConfigPart(setForm, 'price', (p) => ({ ...p, validUntil: { ...p.validUntil, format: event.target.value as 'dmy' | 'd-mon-y' | 'iso' } }))} className={inputClass}>
                <option value="dmy">30/09/2026</option><option value="d-mon-y">30 Sep 2026</option><option value="iso">2026-09-30</option>
              </select>
            </Field>
          </Section>

          <Section title="SKU">
            <Toggle label="Show SKU" checked={form.config.sku.show} onChange={(show) => setConfigPart(setForm, 'sku', (s) => ({ ...s, show }))} />
            <Toggle label="Include secret code" checked={form.config.sku.showSecretCode} onChange={(showSecretCode) => setConfigPart(setForm, 'sku', (s) => ({ ...s, showSecretCode }))} />
            <Field label="SKU prefix"><input type="text" maxLength={40} value={form.config.sku.prefix} onChange={(event) => setConfigPart(setForm, 'sku', (s) => ({ ...s, prefix: event.target.value }))} className={inputClass} /></Field>
          </Section>

          <Section title="Barcode">
            <Toggle label="Show barcode" checked={form.config.barcode.show} onChange={(show) => setConfigPart(setForm, 'barcode', (b) => ({ ...b, show }))} />
            <Toggle label="Show digits" checked={form.config.barcode.showDigits} onChange={(showDigits) => setConfigPart(setForm, 'barcode', (b) => ({ ...b, showDigits }))} />
            <Field label="Target width (mm)"><input type="number" min={10} max={210} value={form.config.barcode.targetWidthMm} onChange={(event) => setConfigPart(setForm, 'barcode', (b) => ({ ...b, targetWidthMm: Number(event.target.value) || 10 }))} className={inputClass} /></Field>
          </Section>

          <Section title="Appearance">
            <Field label="Margin (mm)"><input type="number" min={0} max={30} value={form.config.appearance.marginMm} onChange={(event) => setConfigPart(setForm, 'appearance', (a) => ({ ...a, marginMm: Number(event.target.value) || 0 }))} className={inputClass} /></Field>
            <Field label="Inner gap (mm)"><input type="number" min={0} max={30} value={form.config.appearance.innerGapMm} onChange={(event) => setConfigPart(setForm, 'appearance', (a) => ({ ...a, innerGapMm: Number(event.target.value) || 0 }))} className={inputClass} /></Field>
            <Field label="Border (px)">
              <select value={form.config.appearance.borderPx} onChange={(event) => setConfigPart(setForm, 'appearance', (a) => ({ ...a, borderPx: Number(event.target.value) as 0 | 1 | 2 }))} className={inputClass}>
                <option value={0}>0</option><option value={1}>1</option><option value={2}>2</option>
              </select>
            </Field>
            <Toggle label="Section dividers" checked={form.config.appearance.sectionDividers} onChange={(sectionDividers) => setConfigPart(setForm, 'appearance', (a) => ({ ...a, sectionDividers }))} />
            <Field label="Global font scale"><input type="number" step="0.1" min={0.5} max={5} value={form.config.appearance.fontScale} onChange={(event) => setConfigPart(setForm, 'appearance', (a) => ({ ...a, fontScale: Number(event.target.value) || 1 }))} className={inputClass} /></Field>
            <Field label="Orientation">
              <select value={form.config.appearance.orientation} onChange={(event) => setConfigPart(setForm, 'appearance', (a) => ({ ...a, orientation: event.target.value as 'portrait' | 'landscape' }))} className={inputClass}>
                <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
              </select>
            </Field>
          </Section>

          <Section title="Spec keys (ordered)">
            <Field label="Comma-separated canonical keys" fullWidth>
              <input type="text" value={form.specKeyOrder.join(', ')} onChange={(event) => setForm((current) => ({ ...current, specKeyOrder: parseSpecKeys(event.target.value) }))} className={`${inputClass} font-mono`} placeholder="screen_size, resolution, refresh_rate" />
              <span className="text-xs text-slate-500">Lowercase letters, digits, underscores. Each key is resolved from the product's specifications by the canonical-key catalog.</span>
            </Field>
          </Section>

          <Section title="Defaults">
            <Field label="Default valid-until days (overrides shop default)"><input type="number" min={0} max={3650} value={form.defaultValidityDays ?? ''} onChange={(event) => setForm((current) => ({ ...current, defaultValidityDays: event.target.value === '' ? null : Number(event.target.value) || 0 }))} className={inputClass} /></Field>
          </Section>

          {configError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{configError}</p>}

          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap gap-3">
              {!isNew && <button type="submit" disabled={pending || !parsedConfig} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"><Save className="h-4 w-4" /> Save</button>}
              <button type="button" onClick={() => saveDraft('create')} disabled={pending || !parsedConfig} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 disabled:cursor-not-allowed"><Copy className="h-4 w-4" /> Save as new</button>
            </div>
            {!isNew && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <button type="button" onClick={doArchive} disabled={pending} className="inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed"><Trash2 className="h-4 w-4" /> Archive template</button>
              </div>
            )}
          </section>
        </form>

        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">Preview product</span>
              <select value={sampleIndex} onChange={(event) => setSampleIndex(Number(event.target.value))} className={inputClass}>
                {pricingCardSamples.map((entry, index) => <option key={entry.name} value={index}>{entry.name}</option>)}
              </select>
            </label>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            {previewTemplate && profile.data
              ? <PricingCard template={previewTemplate} product={sample.product} shopProfile={profile.data} assets={{ ...sample.assets, companyLogoUrl: profile.data.logoDataUrl ?? sample.assets?.companyLogoUrl ?? null }} />
              : <p className="text-sm text-slate-500">Fix the template config to see a live preview.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

interface TemplateFormState {
  name: string;
  description: string | null;
  paperMode: PricingCardTemplateInput['paperMode'];
  paperSize: PricingCardTemplateInput['paperSize'];
  cardWidthMm: number;
  cardHeightMm: number;
  config: PricingCardTemplateConfig;
  featureMax: number;
  specKeyOrder: string[];
  defaultValidityDays: number | null;
}

function emptyForm(): TemplateFormState {
  return {
    name: '', description: '',
    paperMode: 'SINGLE_STICKER', paperSize: null,
    cardWidthMm: 72, cardHeightMm: 50,
    config: structuredClone(defaultConfig), featureMax: 4,
    specKeyOrder: [], defaultValidityDays: null,
  };
}

export function fromTemplate(template: PricingCardTemplate): TemplateFormState {
  return {
    name: template.name, description: template.description,
    paperMode: template.paperMode, paperSize: template.paperSize ?? null,
    cardWidthMm: Number(template.cardWidthMm), cardHeightMm: Number(template.cardHeightMm),
    config: structuredClone(template.config), featureMax: template.featureMax,
    specKeyOrder: [...template.specKeyOrder], defaultValidityDays: template.defaultValidityDays ?? null,
  };
}

export function parseSpecKeys(value: string): string[] {
  return value.split(',').map((entry) => entry.trim().toLowerCase()).filter((entry) => /^[a-z0-9_]+$/.test(entry));
}

function setConfigPart<K extends keyof PricingCardTemplateConfig>(
  setForm: React.Dispatch<React.SetStateAction<TemplateFormState>>,
  key: K,
  producer: (current: PricingCardTemplateConfig[K]) => PricingCardTemplateConfig[K],
) {
  setForm((current) => ({ ...current, config: { ...current.config, [key]: producer(current.config[key]) } }));
}

const inputClass = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({ label, children, fullWidth = false }: { label: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <label className={`space-y-1 text-sm text-slate-700 ${fullWidth ? 'md:col-span-2' : ''}`}>
      <span className="block font-medium">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-1">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
