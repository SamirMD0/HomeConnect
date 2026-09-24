import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { useProduct, useUpdateProduct } from '../../products/hooks/useProducts';
import type { ProductSpecification } from '../../products/types/product.types';
import { pricingCardKeys } from '../hooks/usePricingCard';
import { CanonicalSpecEditor } from './CanonicalSpecEditor';

/**
 * Inline "edit the product data" panel shown next to the pricing-card preview.
 *
 * The plan asked for a way to fix a spec or a dimension without leaving the
 * print flow — instead of Print → back → Products → find product → Edit →
 * change → Save → back → Print, the operator adjusts here and reprints. Price
 * and pricing fields are deliberately absent: they still travel through the
 * strict pricing endpoint with its admin-password guard, and this panel is
 * about print-time data hygiene, not commercial changes.
 *
 * After Save, the pricing-card query is invalidated so the preview and the
 * next print pick up the change without a page refresh.
 */
export function InlineProductEditor({ productId }: { productId: string }) {
  const product = useProduct(productId);
  const update = useUpdateProduct();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [specifications, setSpecifications] = useState<ProductSpecification[]>([]);
  const [specificationNotes, setSpecificationNotes] = useState('');

  useEffect(() => {
    if (!product.data) return;
    setName(product.data.name);
    setModel(product.data.model);
    setSpecifications(product.data.specifications ?? []);
    setSpecificationNotes(product.data.specificationNotes ?? '');
  }, [product.data]);

  const dirty = Boolean(product.data && (
    name.trim() !== product.data.name ||
    model.trim() !== product.data.model ||
    specificationNotes !== (product.data.specificationNotes ?? '') ||
    JSON.stringify(cleanRows(specifications)) !== JSON.stringify(cleanRows(product.data.specifications ?? []))
  ));

  const submit = () => {
    if (!dirty || !product.data) return;
    const trimmedName = name.trim();
    const trimmedModel = model.trim();
    if (!trimmedName || !trimmedModel) {
      toast.error('Name and model cannot be empty');
      return;
    }
    update.mutate({ id: productId, input: {
      name: trimmedName,
      model: trimmedModel,
      specifications: cleanRows(specifications),
      specificationNotes: specificationNotes.trim() === '' ? null : specificationNotes.trim(),
    } }, {
      onSuccess: () => {
        toast.success('Product data updated');
        queryClient.invalidateQueries({ queryKey: pricingCardKeys.all });
      },
      onError: () => toast.error('Unable to save product data'),
    });
  };

  if (product.isLoading) return <p className="text-sm text-slate-500">Loading product data…</p>;
  if (product.isError || !product.data) return <p role="alert" className="text-sm text-red-700">Unable to load product for editing.</p>;

  return (
    <div className="space-y-4 no-print">
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
      <p className="text-xs text-slate-500">
        Dimensions on the card come from a spec row keyed as <code>Dimensions</code> with
        a <code>W × H × D mm</code> value — pick <em>Dimensions</em> from the dropdown so the
        template can find the row.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!dirty || update.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Save className="h-4 w-4" />
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        {!dirty && <span className="text-xs text-slate-500">No changes yet.</span>}
      </div>
    </div>
  );
}

const inputClass = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

/**
 * The specification editor keeps an empty scaffold row visible so the admin can
 * fill it in; drop rows whose label and value are both blank before comparing
 * to the saved state so we do not treat that phantom row as a dirty edit.
 */
function cleanRows(rows: ProductSpecification[]) {
  return rows
    .map((row) => ({ label: row.label.trim(), value: row.value.trim() }))
    .filter((row) => row.label !== '' || row.value !== '');
}
