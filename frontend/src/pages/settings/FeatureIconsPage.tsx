import { useMemo, useState } from 'react';
import { ArrowLeft, KeyRound, Plus, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
  useArchiveFeatureIcon,
  useCreateFeatureIcon,
  useFeatureIcons,
  useUpdateFeatureIcon,
} from '../../features/pricing-card/hooks/useFeatureIcons';
import type { FeatureIconInput, PricingCardFeatureIcon } from '../../features/pricing-card/types/pricing-card.types';
import { useAuth } from '../../hooks/useAuth';

const emptyDraft: DraftIcon = {
  code: '', label: '', category: '', svg: '', sortOrder: 0, isActive: true,
};

interface DraftIcon {
  code: string;
  label: string;
  category: string;
  svg: string;
  sortOrder: number;
  isActive: boolean;
}

export function FeatureIconsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeOnly, setActiveOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const icons = useFeatureIcons(activeOnly, categoryFilter || undefined);
  const create = useCreateFeatureIcon();
  const update = useUpdateFeatureIcon();
  const archive = useArchiveFeatureIcon();
  const [selectedId, setSelectedId] = useState<string | 'new'>('new');
  const [draft, setDraft] = useState<DraftIcon>(emptyDraft);
  const [password, setPassword] = useState('');

  const categories = useMemo(() => uniqueCategories(icons.data ?? []), [icons.data]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-3xl space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-xl font-semibold">Feature icons are admin-only</h1>
        <button type="button" onClick={() => navigate('/settings')} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">Back to settings</button>
      </div>
    );
  }

  const selectIcon = (icon: PricingCardFeatureIcon | 'new') => {
    if (icon === 'new') { setSelectedId('new'); setDraft(emptyDraft); return; }
    setSelectedId(icon.id);
    setDraft({ code: icon.code, label: icon.label, category: icon.category ?? '', svg: icon.svg, sortOrder: icon.sortOrder, isActive: icon.isActive });
  };

  const save = () => {
    if (!password) { toast.error('Account password is required'); return; }
    const input: FeatureIconInput = {
      code: draft.code.trim(), label: draft.label.trim(),
      category: draft.category.trim() === '' ? null : draft.category.trim(),
      svg: draft.svg.trim(), sortOrder: draft.sortOrder, isActive: draft.isActive,
      accountPassword: password,
    };
    const done = { onSuccess: () => { setPassword(''); toast.success('Feature icon saved'); if (selectedId === 'new') { setDraft(emptyDraft); } }, onError: (error: unknown) => toast.error(errorMessage(error) ?? 'Unable to save feature icon') };
    if (selectedId === 'new') create.mutate(input, done);
    else update.mutate({ id: selectedId, input }, done);
  };

  const archiveIcon = () => {
    if (selectedId === 'new') return;
    if (!password) { toast.error('Account password is required'); return; }
    archive.mutate({ id: selectedId, accountPassword: password }, {
      onSuccess: () => { setPassword(''); toast.success('Feature icon archived'); selectIcon('new'); },
      onError: (error) => toast.error(errorMessage(error) ?? 'Unable to archive feature icon'),
    });
  };

  const pending = create.isPending || update.isPending || archive.isPending;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <button type="button" onClick={() => navigate('/settings')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </button>
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Feature icons</h1>
        <p className="mt-1 text-sm text-slate-500">Admin-managed catalog of icons shown in the Features block of every pricing card.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /> Active only</label>
        <label className="flex items-center gap-2 text-sm text-slate-700">Category
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
            <option value="">All</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => selectIcon('new')} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Add icon</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Icon catalog" className="rounded-xl border border-slate-200 bg-white p-3">
          {icons.isLoading && <p className="p-4 text-sm text-slate-500">Loading icons…</p>}
          {icons.isError && <p role="alert" className="p-4 text-sm text-red-700">Unable to load icons.</p>}
          {icons.data && icons.data.length === 0 && <p className="p-4 text-sm text-slate-500">No icons match your filter.</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(icons.data ?? []).map((icon) => (
              <li key={icon.id}>
                <button type="button" onClick={() => selectIcon(icon)}
                  className={`flex w-full flex-col items-center gap-2 rounded-lg border p-3 text-center text-sm transition ${selectedId === icon.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'} ${icon.isActive ? 'bg-white' : 'bg-slate-50 opacity-70'}`}>
                  <span className="feature-icon-preview inline-block h-10 w-10 text-slate-700" aria-hidden dangerouslySetInnerHTML={{ __html: icon.svg }} />
                  <span className="w-full truncate font-medium text-slate-900">{icon.label}</span>
                  <span className="font-mono text-[11px] text-slate-500">{icon.code}</span>
                  {icon.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{icon.category}</span>}
                  {!icon.isActive && <span className="text-[11px] text-amber-700">Archived</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Icon editor" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-slate-500" /><h2 className="text-lg font-semibold text-slate-900">{selectedId === 'new' ? 'New feature icon' : 'Edit feature icon'}</h2></div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">Code</span>
              <input type="text" value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toLowerCase() }))} placeholder="e.g. dolby-vision" className={inputClass + ' font-mono'} maxLength={80} disabled={selectedId !== 'new'} />
              <span className="text-xs text-slate-500">Kebab-case, letters + digits. Immutable after save.</span>
            </label>
            <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">Label</span>
              <input type="text" value={draft.label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} maxLength={100} className={inputClass} />
            </label>
            <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">Category</span>
              <input type="text" value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} maxLength={80} className={inputClass} placeholder="tv, appliance, power…" />
            </label>
            <label className="space-y-1 text-sm text-slate-700"><span className="block font-medium">Sort order</span>
              <input type="number" min={0} max={10000} value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} className={inputClass} />
            </label>
            <label className="space-y-1 text-sm text-slate-700 md:col-span-2"><span className="block font-medium">SVG source</span>
              <textarea value={draft.svg} onChange={(event) => setDraft((current) => ({ ...current, svg: event.target.value }))} rows={7} className={`${inputClass} font-mono text-xs`} placeholder="<svg viewBox='0 0 24 24' fill='currentColor'>…</svg>" />
              <span className="text-xs text-slate-500">Sanitized server-side. Scripts and event handlers are rejected.</span>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} /> Active</label>
          </div>

          {draft.svg && (
            <figure className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
              <span className="feature-icon-preview inline-block h-12 w-12 text-slate-800" aria-hidden dangerouslySetInnerHTML={{ __html: draft.svg }} />
              <figcaption className="text-xs text-slate-500">Client preview (server may reject unsafe SVG on save).</figcaption>
            </figure>
          )}

          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <label className="flex-1 space-y-1 text-sm text-slate-700">
              <span className="flex items-center gap-1 font-medium"><KeyRound className="h-3.5 w-3.5" /> Account password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
            </label>
            <button type="button" onClick={save} disabled={pending || !draft.code || !draft.label || !draft.svg} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{pending ? 'Saving…' : selectedId === 'new' ? 'Create icon' : 'Save changes'}</button>
            {selectedId !== 'new' && draft.isActive && (
              <button type="button" onClick={archiveIcon} disabled={pending} className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">Archive</button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const inputClass = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100';

export function uniqueCategories(icons: Array<Pick<PricingCardFeatureIcon, 'category'>>): string[] {
  const set = new Set<string>();
  for (const icon of icons) if (icon.category) set.add(icon.category);
  return Array.from(set).sort();
}

export function errorMessage(error: unknown): string | null {
  if (typeof error === 'object' && error) {
    const data = (error as { response?: { data?: { message?: string; error?: { message?: string } } } }).response?.data;
    return data?.error?.message ?? data?.message ?? null;
  }
  return null;
}
