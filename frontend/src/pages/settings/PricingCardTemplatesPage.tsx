import { ArrowRight, LayoutTemplate, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { usePricingCardTemplates } from '../../features/pricing-card/hooks/usePricingCardTemplates';
import { useAuth } from '../../hooks/useAuth';

export function PricingCardTemplatesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const templates = usePricingCardTemplates(false);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-3xl space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-xl font-semibold">Pricing card templates are admin-only</h1>
        <button type="button" onClick={() => navigate('/settings')} className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900">Back to settings</button>
      </div>
    );
  }

  const rows = templates.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pricing card templates</h1>
          <p className="mt-1 text-sm text-slate-500">Each template is a validated JSON config that the renderer consumes with a product to produce one card.</p>
        </div>
        <Link to="/settings/pricing-cards/templates/new" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> New template</Link>
      </div>

      {templates.isLoading && <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">Loading templates…</p>}
      {templates.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load templates.</p>}
      {!templates.isLoading && rows.length === 0 && <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">No templates yet.</p>}

      <ul className="grid gap-3">
        {rows.map((template) => (
          <li key={template.id} className={`rounded-xl border p-4 shadow-sm ${template.isActive ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/50'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <LayoutTemplate className="mt-1 h-5 w-5 text-slate-500" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{template.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{template.paperMode}{template.paperSize ? ` · ${template.paperSize}` : ''}</span>
                    <span className="text-xs text-slate-500">{template.cardWidthMm} × {template.cardHeightMm} mm</span>
                    {!template.isActive && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Archived</span>}
                  </div>
                  {template.description && <p className="mt-1 text-sm text-slate-600">{template.description}</p>}
                  <p className="mt-1 text-xs text-slate-500">Up to {template.featureMax} features · {template.specKeyOrder.length} spec keys · {template.defaultValidityDays ?? 'shop default'} days valid</p>
                </div>
              </div>
              <Link to={`/settings/pricing-cards/templates/${template.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Edit <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
