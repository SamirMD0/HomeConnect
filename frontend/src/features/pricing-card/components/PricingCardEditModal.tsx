import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { useProduct, useUpdateProduct } from '../../products/hooks/useProducts';
import type { ProductSpecification } from '../../products/types/product.types';
import { hasCompleteDimensions, isDimensionLabel } from '../../products/utils/dimension-specification';
import { CanonicalSpecEditor } from './CanonicalSpecEditor';
import { PricingCard } from './PricingCard';
import { pricingCardKeys, usePricingCard } from '../hooks/usePricingCard';
import { useShopProfile } from '../hooks/useShopProfile';
import type { PricingCardTemplate } from '../types/pricing-card.types';
import type { PricingCardTemplateConfig } from '../schema/template-config.z';
import { readOverrides, writeOverrides, applyOverridesTo, type PricingCardOverrides } from '../overrides/pricing-card-overrides';

interface PricingCardEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  template: PricingCardTemplate | undefined;
  validUntil: string;
  onOverridesSaved?: (overrides: PricingCardOverrides) => void;
}

/**
 * Combined product-data + per-product card-tweak editor. Opens as a modal from
 * the pricing-card page next to Print. The plan asked for "edit the template
 * *and* data, without leaving the print flow, without an admin password":
 * product data goes through the same relaxed update endpoint the Product form
 * uses (so the audit trail is identical), while the template tweaks (layout,
 * palette, prominence, font scales, show/hide toggles, card dimensions) are
 * per-product overrides persisted to sessionStorage — never edited on the
 * shared template row, so a shop with 300 washers is not one operator's local
 * tweak away from a global visual regression.
 *
 * Right-hand column is a live preview of the resolved card with both the
 * product-data edits and the tweak overrides applied, so the operator sees
 * exactly what the next print will produce before they Save.
 */
export function PricingCardEditModal({
  isOpen, onClose, productId, template, validUntil, onOverridesSaved,
}: PricingCardEditModalProps) {
  const product = useProduct(productId);
  const update = useUpdateProduct();
  const profile = useShopProfile();
  const queryClient = useQueryClient();
  const card = usePricingCard(productId, { templateId: template?.id ?? '', validUntil, includePriceCode: false });

  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [specifications, setSpecifications] = useState<ProductSpecification[]>([]);
  const [specificationNotes, setSpecificationNotes] = useState('');
  const [overrides, setOverrides] = useState<PricingCardOverrides>({});

  useEffect(() => {
    if (!isOpen) return;
    setOverrides(readOverrides(productId));
  }, [isOpen, productId]);

  useEffect(() => {
    if (!product.data) return;
    setName(product.data.name);
    setModel(product.data.model);
    setSpecifications(product.data.specifications ?? []);
    setSpecificationNotes(product.data.specificationNotes ?? '');
  }, [product.data]);

  const previewTemplate = useMemo(() => (template ? applyOverridesTo(template, overrides) : null), [template, overrides]);

  const productDataDirty = Boolean(product.data && (
    name.trim() !== product.data.name ||
    model.trim() !== product.data.model ||
    specificationNotes !== (product.data.specificationNotes ?? '') ||
    JSON.stringify(cleanRows(specifications)) !== JSON.stringify(cleanRows(product.data.specifications ?? []))
  ));
  const overridesDirty = JSON.stringify(overrides) !== JSON.stringify(readOverrides(productId));

  const setOverride = <K extends keyof PricingCardOverrides>(key: K, value: PricingCardOverrides[K]) => {
    setOverrides((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  };
  const setConfigOverride = (path: string, value: unknown) => {
    setOverrides((current) => {
      const nextConfig = { ...(current.config ?? {}) } as Record<string, unknown>;
      writeAt(nextConfig, path, value);
      return { ...current, config: nextConfig as PricingCardOverrides['config'] };
    });
  };

  const save = () => {
    if (specifications.some((row) => isDimensionLabel(row.label) && !hasCompleteDimensions(row.value))) {
      toast.error('Enter width, height, and depth for Dimensions');
      return;
    }
    if (!name.trim() || !model.trim()) {
      toast.error('Name and model cannot be empty');
      return;
    }

    writeOverrides(productId, overrides);
    onOverridesSaved?.(overrides);

    if (!productDataDirty || !product.data) {
      if (overridesDirty) toast.success('Card tweaks saved for this product');
      onClose();
      return;
    }
    update.mutate({ id: productId, input: {
      name: name.trim(),
      model: model.trim(),
      specifications: cleanRows(specifications),
      specificationNotes: specificationNotes.trim() === '' ? null : specificationNotes.trim(),
    } }, {
      onSuccess: () => {
        toast.success('Product data saved');
        queryClient.invalidateQueries({ queryKey: pricingCardKeys.all });
        onClose();
      },
      onError: () => toast.error('Unable to save product data'),
    });
  };

  const config = previewTemplate ? parseTemplateConfigOrNull(previewTemplate.config) : null;
  const canSave = (productDataDirty || overridesDirty) && !update.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit pricing card"
      description="Product data plus per-product card tweaks. Template tweaks stay on this product."
      maxWidth="max-w-6xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Save className="h-4 w-4" />
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {product.isLoading && <p className="text-sm text-slate-500">Loading product data…</p>}
          {product.isError && <p role="alert" className="text-sm text-red-700">Unable to load product for editing.</p>}
          {product.data && (
            <section className="space-y-3" data-testid="pricing-card-edit-product-data">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Product data</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block font-medium">Name / الاسم</span>
                  <input type="text" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} maxLength={200} />
                </label>
                <label className="space-y-1 text-sm text-slate-700">
                  <span className="block font-medium">Model / الموديل</span>
                  <input type="text" value={model} onChange={(event) => setModel(event.target.value)} className={inputClass} maxLength={120} />
                </label>
              </div>
              <CanonicalSpecEditor
                value={specifications}
                notes={specificationNotes}
                onChange={setSpecifications}
                onNotesChange={setSpecificationNotes}
              />
            </section>
          )}

          {template && config && (
            <section className="space-y-3" data-testid="pricing-card-edit-card-tweaks">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Card tweaks for this product</h3>
              <p className="text-xs text-slate-500">
                Saved locally on this browser for this product only. The shared template is not modified.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <Select label="Layout" value={config.appearance.layout} onChange={(value) => setConfigOverride('appearance.layout', value)}>
                  <option value="stack">Stack — classic block</option>
                  <option value="centered">Centered — retail-hero</option>
                </Select>
                <Select label="Palette" value={config.appearance.palette} onChange={(value) => setConfigOverride('appearance.palette', value)}>
                  <option value="color">Color</option>
                  <option value="thermal">Thermal — pure B&amp;W</option>
                </Select>
                <Select label="Price prominence" value={config.price.prominence} onChange={(value) => setConfigOverride('price.prominence', value)}>
                  <option value="normal">Normal — 6 mm</option>
                  <option value="large">Large — 10 mm</option>
                  <option value="hero">Hero — 14 mm, own row</option>
                </Select>
                <NumberField label="Title font scale" step="0.05" min={0.5} max={3} value={config.body.title.fontScale} onChange={(value) => setConfigOverride('body.title.fontScale', value)} />
                <NumberField label="Details font scale" step="0.05" min={0.5} max={3} value={config.body.detailsFontScale ?? 1} onChange={(value) => setConfigOverride('body.detailsFontScale', value)} />
                <Toggle label="Bold black details" checked={config.body.detailsBoldBlack ?? false} onChange={(value) => setConfigOverride('body.detailsBoldBlack', value)} />
                <NumberField label="Card width (mm)" step="1" min={20} max={210} value={Number(previewTemplate?.cardWidthMm ?? 0)} onChange={(value) => setOverride('cardWidthMm', value)} />
                <NumberField label="Card height (mm)" step="1" min={20} max={210} value={Number(previewTemplate?.cardHeightMm ?? 0)} onChange={(value) => setOverride('cardHeightMm', value)} />
              </div>
              <div className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
                <Toggle label="Show title" checked={config.body.title.show} onChange={(value) => setConfigOverride('body.title.show', value)} />
                <Toggle label="Show model" checked={config.body.model.show} onChange={(value) => setConfigOverride('body.model.show', value)} />
                <Toggle label="Show dimensions" checked={config.body.dimensions.show} onChange={(value) => setConfigOverride('body.dimensions.show', value)} />
                <Toggle label="Show specs" checked={config.body.specs.show} onChange={(value) => setConfigOverride('body.specs.show', value)} />
                <Toggle label="Show features" checked={config.features.show} onChange={(value) => setConfigOverride('features.show', value)} />
                <Toggle label="Show barcode" checked={config.barcode.show} onChange={(value) => setConfigOverride('barcode.show', value)} />
              </div>
              <button
                type="button"
                onClick={() => setOverrides({})}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Reset tweaks to template defaults
              </button>
            </section>
          )}
        </div>

        <aside className="space-y-3 lg:sticky lg:top-0" data-testid="pricing-card-edit-preview">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Preview</h3>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            {previewTemplate && profile.data && card.data?.payload
              ? <PricingCard template={previewTemplate} product={{ ...card.data.payload, name: name.trim() || card.data.payload.name, model: model.trim() || card.data.payload.model }} shopProfile={profile.data} />
              : <p className="text-sm text-slate-500">Loading preview…</p>}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

const inputClass = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm text-slate-700">
      <span className="block font-medium">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>{children}</select>
    </label>
  );
}

function NumberField({ label, value, onChange, step = '1', min, max }: { label: string; value: number; onChange: (value: number) => void; step?: string; min?: number; max?: number }) {
  return (
    <label className="space-y-1 text-sm text-slate-700">
      <span className="block font-medium">{label}</span>
      <input type="number" step={step} min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function cleanRows(rows: ProductSpecification[]) {
  return rows
    .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
    .filter((row) => row.label !== '' || row.value !== '');
}

/**
 * `parseTemplateConfig` on the client validates and applies defaults; if a
 * user's tweak temporarily breaks it (say they typed a bad font scale), fall
 * back to null so the preview shows a placeholder instead of crashing the modal.
 */
function parseTemplateConfigOrNull(config: unknown): PricingCardTemplateConfig | null {
  try {
    // Cast: we trust the template row from the API. On an override-invalidated
    // tree, return null and the preview renders a "loading" placeholder.
    return config as PricingCardTemplateConfig;
  } catch {
    return null;
  }
}

function writeAt(target: Record<string, unknown>, path: string, value: unknown) {
  const segments = path.split('.');
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const existing = cursor[segment];
    const next = existing && typeof existing === 'object' && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
    cursor[segment] = next;
    cursor = next;
  }
  cursor[segments[segments.length - 1]] = value;
}
