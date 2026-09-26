import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, GitBranch } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { usePricingCardTemplates } from '../../features/pricing-card/hooks/usePricingCardTemplates';
import { useShopProfile, useUpdateShopProfile } from '../../features/pricing-card/hooks/useShopProfile';
import { usePricingPresets } from '../../features/pricing/hooks/usePricingPresets';
import type { PricingPreset } from '../../features/pricing/types/pricing.types';
import { useAuth } from '../../hooks/useAuth';

type Assignments = Record<string, string | null>;

export function PricingCardTemplateAssignmentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useShopProfile();
  const templates = usePricingCardTemplates(true);
  const presets = usePricingPresets({ isActive: true, pageSize: 100, sortBy: 'productType', sortOrder: 'asc' });
  const updateProfile = useUpdateShopProfile();
  const [assignments, setAssignments] = useState<Assignments>({});
  const [accountPassword, setAccountPassword] = useState('');

  useEffect(() => {
    if (profile.data) setAssignments(profile.data.categoryDefaultTemplates ?? {});
  }, [profile.data]);

  const categories = useMemo(
    () => assignmentCategories(profile.data?.categoryDefaultTemplates ?? {}, presets.data?.items ?? []),
    [presets.data?.items, profile.data?.categoryDefaultTemplates],
  );
  const dirty = profile.data
    ? !sameAssignments(assignments, profile.data.categoryDefaultTemplates ?? {})
    : false;

  if (user?.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-3xl space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-xl font-semibold">Template assignments are admin-only</h1>
        <button type="button" onClick={() => navigate('/pricing-cards')} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm">Back to pricing cards</button>
      </div>
    );
  }

  const save = () => {
    if (!dirty || !accountPassword.trim()) return;
    updateProfile.mutate({ categoryDefaultTemplates: assignments, accountPassword }, {
      onSuccess: () => { setAccountPassword(''); toast.success('Template assignments updated'); },
      onError: () => toast.error('Unable to save template assignments'),
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/pricing-cards/templates" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"><ArrowLeft className="h-4 w-4" /> Back to templates</Link>
      <header className="flex items-start gap-3">
        <GitBranch className="mt-1 h-6 w-6 text-slate-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Template assignments</h1>
          <p className="mt-1 text-sm text-slate-500">Choose the default pricing-card template for each pricing-preset product type. Products with an explicit override still take priority.</p>
        </div>
      </header>

      {(profile.isLoading || templates.isLoading || presets.isLoading) && <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">Loading assignments…</p>}
      {(profile.isError || templates.isError || presets.isError) && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load template assignments.</p>}

      {!profile.isLoading && !presets.isLoading && categories.length === 0 && (
        <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">No product types exist yet. Add a product type to a pricing preset first.</p>
      )}

      {categories.length > 0 && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Product type</th><th className="px-4 py-3">Default template</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {categories.map((category) => <tr key={category}>
              <td dir="auto" className="px-4 py-3 font-medium text-slate-900">{category}</td>
              <td className="px-4 py-3">
                <select
                  aria-label={`Default template for ${category}`}
                  value={assignments[category] ?? ''}
                  onChange={(event) => setAssignments((current) => ({ ...current, [category]: event.target.value || null }))}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Use shop default</option>
                  {(templates.data ?? []).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </td>
            </tr>)}
          </tbody>
        </table>
      </section>}

      <section className="flex flex-wrap items-end justify-end gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <label className="min-w-64 flex-1 space-y-1 text-sm text-slate-700">
          <span className="block font-medium">Account password</span>
          <input type="password" autoComplete="current-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
        <button type="button" onClick={save} disabled={!dirty || !accountPassword.trim() || updateProfile.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          {updateProfile.isPending ? 'Saving…' : 'Save assignments'}
        </button>
      </section>
    </div>
  );
}

export function assignmentCategories(assignments: Assignments, presets: Pick<PricingPreset, 'productType'>[]): string[] {
  return [...new Set([
    ...Object.keys(assignments),
    ...presets.flatMap((preset) => preset.productType?.trim() ? [preset.productType.trim()] : []),
  ])].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
}

export function sameAssignments(left: Assignments, right: Assignments): boolean {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  return keys.every((key) => (left[key] ?? null) === (right[key] ?? null));
}
