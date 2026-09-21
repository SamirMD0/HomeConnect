import { useMemo, useState, type ChangeEvent } from 'react';
import { Building2, LayoutTemplate, Palette, Sparkles } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PricingCardThumbnail } from '../../features/pricing-card/components/PricingCardThumbnail';
import { usePricingCardIndex } from '../../features/pricing-card/hooks/usePricingCardIndex';
import { usePricingCardTemplates } from '../../features/pricing-card/hooks/usePricingCardTemplates';
import { useRolloutMode } from '../../features/pricing-card/hooks/useRolloutMode';
import { useShopProfile } from '../../features/pricing-card/hooks/useShopProfile';
import { useProductBrands, useProducts } from '../../features/products/hooks/useProducts';
import type { PricingCardData, PricingCardTemplate } from '../../features/pricing-card/types/pricing-card.types';
import type { Product } from '../../features/products/types/product.types';

type Tab = 'cards' | 'templates' | 'assets';

const assetSections = [
  {
    icon: Building2,
    title: 'Shop profile',
    description: 'Logo, currency, default template, rollout mode, and snapshot policy.',
    to: '/pricing-cards/shop-profile',
  },
  {
    icon: Sparkles,
    title: 'Feature icons',
    description: 'Manage the SVG icon catalog shown in the Features block of every card.',
    to: '/pricing-cards/feature-icons',
  },
  {
    icon: Palette,
    title: 'Brand logos',
    description: 'Attach logo images to brands so they render on every card that uses them.',
    to: '/pricing-cards/brand-logos',
  },
];

export function PricingCardsPage() {
  const [params, setParams] = useSearchParams();
  const rollout = useRolloutMode();
  // The Cards tab is a print entry point and must respect the shop rollout mode.
  // In LEGACY_ONLY mode the tab is hidden entirely and the landing defaults to
  // Templates so admins can still edit; Assets stays for the catalogs.
  const requested = normalizeTab(params.get('tab'));
  const tab: Tab = requested === 'cards' && !rollout.pricingCardEnabled ? 'templates' : requested;
  const setTab = (next: Tab) => setParams((current) => {
    const merged = new URLSearchParams(current);
    if (next === 'cards') merged.delete('tab'); else merged.set('tab', next);
    return merged;
  }, { replace: true });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pricing cards / بطاقات الأسعار</h1>
        <p className="mt-1 text-sm text-slate-500">
          Browse products, edit layout templates, and manage the shop identity every printed card is bound to.
        </p>
      </div>

      <nav role="tablist" aria-label="Pricing cards sections" className="flex gap-1 border-b border-slate-200">
        {rollout.pricingCardEnabled && <TabButton active={tab === 'cards'} label="Cards" onClick={() => setTab('cards')} />}
        <TabButton active={tab === 'templates'} label="Templates" onClick={() => setTab('templates')} />
        <TabButton active={tab === 'assets'} label="Assets" onClick={() => setTab('assets')} />
      </nav>

      {tab === 'cards' && <CardsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'assets' && <AssetsTab />}
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2 text-sm font-semibold ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
    >{label}</button>
  );
}

function CardsTab() {
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [templateFilter, setTemplateFilter] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);

  const filters = useMemo(() => ({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(brand ? { brand } : {}),
    isActive: true,
    limit: 60,
  }), [search, brand]);
  const productsQuery = useProducts(filters);
  const brandsQuery = useProductBrands();
  const templatesQuery = usePricingCardTemplates(true);
  const shopProfile = useShopProfile();
  const products = productsQuery.data?.items ?? [];
  const indexQuery = usePricingCardIndex(products.map((product) => product.id));
  const templatesById = useMemo(() => new Map((templatesQuery.data ?? []).map((template) => [template.id, template])), [templatesQuery.data]);
  const indexByProduct = useMemo(() => new Map((indexQuery.data ?? []).map((row) => [row.productId, row])), [indexQuery.data]);

  const visible = useMemo(() => products.filter((product) => {
    const entry = indexByProduct.get(product.id);
    if (missingOnly && !entry?.missingTemplate) return false;
    if (templateFilter && entry?.resolvedTemplateId !== templateFilter) return false;
    return true;
  }), [indexByProduct, missingOnly, products, templateFilter]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="min-w-0 flex-1 space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <input type="search" value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} placeholder="Name, model, brand, SKU…" className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Brand</span>
          <select value={brand} onChange={(event) => setBrand(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All brands</option>
            {(brandsQuery.data ?? []).map((entry) => (
              <option key={entry.canonical} value={entry.canonical}>{entry.spellings?.[0] ?? entry.canonical}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Template</span>
          <select value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All templates</option>
            {(templatesQuery.data ?? []).map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1 text-sm text-slate-700">
          <input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} />
          Missing template only
        </label>
      </div>

      <p className="text-xs text-slate-500">Showing {visible.length} of {products.length} products</p>

      {productsQuery.isLoading && <p className="rounded-lg border bg-white p-6 text-sm text-slate-500">Loading products…</p>}
      {productsQuery.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load products.</p>}

      {!productsQuery.isLoading && visible.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No products match these filters. Adjust the search or brand and template filters, or clear the missing-template toggle.
        </div>
      )}

      {shopProfile.data && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((product) => {
            const entry = indexByProduct.get(product.id);
            const template = entry?.resolvedTemplateId ? templatesById.get(entry.resolvedTemplateId) ?? null : null;
            return (
              <PricingCardThumbnail
                key={product.id}
                template={template}
                shopProfile={shopProfile.data!}
                productName={product.name}
                missingTemplate={Boolean(entry?.missingTemplate)}
                href={`/products/${product.id}/pricing-card`}
                product={toPricingCardData(product)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function TemplatesTab() {
  const templatesQuery = usePricingCardTemplates(false);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Layout templates every printed card is bound to.</p>
        <Link to="/pricing-cards/templates" className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Manage templates</Link>
      </div>
      <ul className="grid gap-2">
        {(templatesQuery.data ?? []).map((template) => (
          <li key={template.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div>
              <p className="font-semibold text-slate-900">{template.name}</p>
              <p className="text-xs text-slate-500">{template.paperMode}{template.paperSize ? ` · ${template.paperSize}` : ''} · {template.cardWidthMm} × {template.cardHeightMm} mm{template.isActive ? '' : ' · archived'}</p>
            </div>
            <Link to={`/pricing-cards/templates/${template.id}`} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">Edit</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AssetsTab() {
  return (
    <section className="grid gap-3">
      {assetSections.map((section) => (
        <div key={section.to} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <section.icon className="h-6 w-6 text-slate-500" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
                <p className="text-sm text-slate-500">{section.description}</p>
              </div>
            </div>
            <Link to={section.to} className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Open</Link>
          </div>
        </div>
      ))}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <LayoutTemplate className="h-6 w-6 text-slate-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Pricing card templates</h2>
              <p className="text-sm text-slate-500">Same list as the Templates tab; also linked here for one-stop asset admin.</p>
            </div>
          </div>
          <Link to="/pricing-cards/templates" className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Open</Link>
        </div>
      </div>
    </section>
  );
}

function normalizeTab(raw: string | null): Tab {
  return raw === 'templates' || raw === 'assets' ? raw : 'cards';
}

/** Products list rows are the internal shape; the renderer takes the label
 * shape. Map the fields the thumbnail actually uses (name/model/brand/price)
 * and leave the rest blank — the thumbnail hides the barcode block anyway. */
export function toPricingCardData(product: Product): PricingCardData {
  return {
    id: product.id,
    name: product.name,
    model: product.model,
    brand: product.brand,
    sku: product.sku,
    barcodeValue: product.barcode ?? product.sku,
    barcodeSource: product.barcode ? 'MANUFACTURER' : 'SKU',
    cashPrice: product.netPrice ?? product.price ?? undefined,
    imageUrl: product.imageUrl,
    features: [],
    resolvedSpecs: [],
  } as unknown as PricingCardData;
}

export type { PricingCardTemplate };
