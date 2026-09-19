import { useMemo, useState, type ChangeEvent } from 'react';
import { ArrowLeft, KeyRound, Palette, Plus, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useProductBrands } from '../../features/products/hooks/useProducts';
import {
  useArchiveBrandLogo,
  useBrandLogos,
  useCreateBrandLogo,
  useUpdateBrandLogo,
} from '../../features/pricing-card/hooks/useBrandLogos';
import type { BrandLogo, BrandLogoInput } from '../../features/pricing-card/types/pricing-card.types';
import { useAuth } from '../../hooks/useAuth';
import { errorMessage } from './FeatureIconsPage';

const LOGO_MAX_BYTES = 512 * 1024;
const LOGO_MIME: Record<string, BrandLogoInput['mimeType']> = {
  'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/webp': 'image/webp', 'image/gif': 'image/gif',
};

interface DraftLogo {
  displayName: string;
  canonicalName: string;
  dataBase64: string | null;
  mimeType: BrandLogoInput['mimeType'] | null;
  previewUrl: string | null;
}

const emptyDraft: DraftLogo = { displayName: '', canonicalName: '', dataBase64: null, mimeType: null, previewUrl: null };

export function BrandLogosPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const logos = useBrandLogos(false);
  const brands = useProductBrands();
  const create = useCreateBrandLogo();
  const update = useUpdateBrandLogo();
  const archive = useArchiveBrandLogo();
  const [selectedId, setSelectedId] = useState<string | 'new'>('new');
  const [draft, setDraft] = useState<DraftLogo>(emptyDraft);
  const [password, setPassword] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const missing = useMemo(() => topMissingBrands(brands.data ?? [], logos.data ?? []), [brands.data, logos.data]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-3xl space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-xl font-semibold">Brand logos are admin-only</h1>
        <button type="button" onClick={() => navigate('/settings')} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">Back to settings</button>
      </div>
    );
  }

  const selectLogo = (logo: BrandLogo | 'new') => {
    setUploadError(null);
    if (logo === 'new') { setSelectedId('new'); setDraft(emptyDraft); return; }
    setSelectedId(logo.id);
    setDraft({ displayName: logo.displayName, canonicalName: logo.canonicalName, dataBase64: null, mimeType: null, previewUrl: null });
  };

  const seedFromBrand = (displayName: string) => {
    setUploadError(null); setSelectedId('new');
    setDraft({ ...emptyDraft, displayName });
  };

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = event.target.files?.[0];
    if (!file) return;
    const mimeType = LOGO_MIME[file.type];
    if (!mimeType) { setUploadError('Logo must be a PNG, JPEG, WEBP, or GIF.'); return; }
    if (file.size > LOGO_MAX_BYTES) { setUploadError('Logo must be 512 KB or smaller.'); return; }
    void file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
      setDraft((current) => ({ ...current, dataBase64: btoa(binary), mimeType, previewUrl: URL.createObjectURL(file) }));
    });
  };

  const save = () => {
    if (!password) { toast.error('Account password is required'); return; }
    if (selectedId === 'new' && (!draft.dataBase64 || !draft.mimeType)) { toast.error('Choose a logo file first'); return; }
    if (!draft.displayName.trim()) { toast.error('Display name is required'); return; }

    const done = { onSuccess: () => { setPassword(''); toast.success('Brand logo saved'); if (selectedId === 'new') { setDraft(emptyDraft); } }, onError: (error: unknown) => toast.error(errorMessage(error) ?? 'Unable to save brand logo') };

    if (selectedId === 'new') {
      create.mutate({
        displayName: draft.displayName.trim(),
        canonicalName: draft.canonicalName.trim() || undefined,
        dataBase64: draft.dataBase64!, mimeType: draft.mimeType!, accountPassword: password,
      }, done);
    } else {
      const existing = logos.data?.find((logo) => logo.id === selectedId);
      if (!existing) return;
      update.mutate({ id: selectedId, input: {
        displayName: draft.displayName.trim(),
        canonicalName: draft.canonicalName.trim() || existing.canonicalName,
        dataBase64: draft.dataBase64 ?? '',
        mimeType: draft.mimeType ?? (existing.logoMimeType as BrandLogoInput['mimeType']),
        accountPassword: password,
      } }, done);
    }
  };

  const archiveLogo = () => {
    if (selectedId === 'new') return;
    if (!password) { toast.error('Account password is required'); return; }
    archive.mutate({ id: selectedId, accountPassword: password }, {
      onSuccess: () => { setPassword(''); toast.success('Brand logo archived'); selectLogo('new'); },
      onError: (error) => toast.error(errorMessage(error) ?? 'Unable to archive brand logo'),
    });
  };

  const pending = create.isPending || update.isPending || archive.isPending;
  const canSubmitExisting = selectedId !== 'new' && (draft.displayName.trim().length > 0 || Boolean(draft.dataBase64));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button type="button" onClick={() => navigate('/settings')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </button>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Brand logos</h1>
        <p className="mt-1 text-sm text-slate-500">A logo shows in the header of every printed pricing card whose product uses this brand. Missing entries render the brand as text.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Brand logo catalog" className="space-y-3">
          {missing.length > 0 && (
            <aside className="rounded-xl border border-amber-200 bg-amber-50 p-3" aria-label="Brands missing logos">
              <div className="flex items-center gap-2 pb-2 text-sm font-semibold text-amber-900"><Sparkles className="h-4 w-4" /> Brands with products but no logo</div>
              <ul className="flex flex-wrap gap-2">
                {missing.map((brand) => (
                  <li key={brand.canonical}>
                    <button type="button" onClick={() => seedFromBrand(brand.displayName)}
                      className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900 hover:bg-amber-100">
                      <Plus className="h-3 w-3" /> {brand.displayName}
                      <span className="text-[10px] text-amber-700">×{brand.productCount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Palette className="h-4 w-4 text-slate-500" /> Catalog</div>
              <button type="button" onClick={() => selectLogo('new')} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" /> Add logo</button>
            </div>
            {logos.isLoading && <p className="p-3 text-sm text-slate-500">Loading brand logos…</p>}
            {logos.isError && <p role="alert" className="p-3 text-sm text-red-700">Unable to load brand logos.</p>}
            {logos.data && logos.data.length === 0 && <p className="p-3 text-sm text-slate-500">No brand logos yet.</p>}
            <ul className="grid grid-cols-2 gap-2">
              {(logos.data ?? []).map((logo) => (
                <li key={logo.id}>
                  <button type="button" onClick={() => selectLogo(logo)}
                    className={`flex w-full flex-col items-center gap-2 rounded-lg border p-3 text-center text-xs transition ${selectedId === logo.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'} ${logo.isActive ? 'bg-white' : 'bg-slate-50 opacity-70'}`}>
                    {logo.logoDataUrl
                      ? <img src={logo.logoDataUrl} alt={`${logo.displayName} logo`} className="h-8 max-w-full" />
                      : <span className="text-[11px] text-slate-400">No image</span>}
                    <span className="w-full truncate font-medium text-slate-900">{logo.displayName}</span>
                    <span className="font-mono text-[10px] text-slate-500">{logo.canonicalName}</span>
                    {!logo.isActive && <span className="text-[10px] text-amber-700">Archived</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-label="Brand logo editor" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">{selectedId === 'new' ? 'New brand logo' : 'Edit brand logo'}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">Display name</span>
              <input type="text" value={draft.displayName} onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} maxLength={120} className={inputClass} />
            </label>
            <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">Canonical name (override)</span>
              <input type="text" value={draft.canonicalName} onChange={(event) => setDraft((current) => ({ ...current, canonicalName: event.target.value.toLowerCase() }))} maxLength={120} className={`${inputClass} font-mono`} placeholder="derived from display name" />
              <span className="text-xs text-slate-500">Case-folded, whitespace-collapsed. Leave blank to derive from the display name.</span>
            </label>
          </div>

          <div className="flex flex-wrap items-start gap-6">
            <figure className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
              {draft.previewUrl
                ? <img src={draft.previewUrl} alt="New brand logo preview" className="max-h-full max-w-full" />
                : (() => { const existing = selectedId !== 'new' ? logos.data?.find((logo) => logo.id === selectedId) : null; return existing?.logoDataUrl ? <img src={existing.logoDataUrl} alt="Current brand logo" className="max-h-full max-w-full" /> : <span className="text-xs text-slate-400">No logo</span>; })()}
            </figure>
            <div className="flex-1 space-y-2">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} className="block text-sm" />
              <p className="text-xs text-slate-500">PNG, JPEG, WEBP, or GIF. Maximum 512 KB. When editing an existing logo, leave empty to keep the current image.</p>
              {uploadError && <p role="alert" className="text-xs text-red-700">{uploadError}</p>}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <label className="flex-1 space-y-1 text-sm text-slate-700">
              <span className="flex items-center gap-1 font-medium"><KeyRound className="h-3.5 w-3.5" /> Account password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
            </label>
            <button type="button" onClick={save} disabled={pending || (selectedId === 'new' ? !draft.displayName || !draft.dataBase64 : !canSubmitExisting)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{pending ? 'Saving…' : selectedId === 'new' ? 'Create logo' : 'Save changes'}</button>
            {selectedId !== 'new' && (
              <button type="button" onClick={archiveLogo} disabled={pending} className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">Archive</button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const inputClass = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export interface BrandCoverage {
  canonical: string;
  displayName: string;
  productCount: number;
}

export function topMissingBrands(
  productBrands: Array<{ canonical: string; productCount: number; spellings?: string[] }>,
  logos: Array<{ canonicalName: string }>,
  limit = 10,
): BrandCoverage[] {
  const covered = new Set(logos.map((logo) => logo.canonicalName));
  const missing: BrandCoverage[] = [];
  for (const brand of productBrands) {
    if (covered.has(brand.canonical)) continue;
    const displayName = brand.spellings?.[0] ?? brand.canonical;
    missing.push({ canonical: brand.canonical, displayName, productCount: brand.productCount });
  }
  return missing.sort((a, b) => b.productCount - a.productCount).slice(0, limit);
}
