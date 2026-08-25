import React, { useEffect, useReducer, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Modal } from '../../../components/ui/Modal';
import { useNormalizeProductBrands } from '../hooks/useProducts';
import type {
  ProductBrandNormalizeDryRunResult,
  ProductBrandNormalizeInput,
  ProductBrandNormalizeResult,
  ProductBrandNormalizeWriteResult,
  ProductBrandSummary,
} from '../types/product.types';

export interface BrandFixState {
  targetBrand: string;
  sourceBrands: string[];
  reason: string;
  preview: ProductBrandNormalizeDryRunResult | null;
}

export type BrandFixAction =
  | { type: 'reset'; brand: ProductBrandSummary }
  | { type: 'target'; value: string }
  | { type: 'source'; value: string; selected: boolean }
  | { type: 'reason'; value: string }
  | { type: 'preview'; result: ProductBrandNormalizeDryRunResult; fingerprint: string };

const spellingCountsFor = (brand: ProductBrandSummary) => brand.spellingCounts?.length
  ? brand.spellingCounts
  : brand.spellings.map((spelling) => ({ spelling, productCount: spelling === brand.canonical ? brand.productCount : 0 }));

export function initialBrandFixState(brand: ProductBrandSummary): BrandFixState {
  const counts = spellingCountsFor(brand);
  const majority = counts.reduce((winner, candidate) =>
    candidate.productCount > winner.productCount ? candidate : winner, counts[0]);
  return { targetBrand: majority?.spelling ?? brand.canonical, sourceBrands: [...brand.spellings], reason: '', preview: null };
}

export const brandFixFingerprint = (state: Pick<BrandFixState, 'targetBrand' | 'sourceBrands' | 'reason'>) =>
  JSON.stringify([state.targetBrand, [...state.sourceBrands].sort(), state.reason]);

export function brandFixReducer(state: BrandFixState, action: BrandFixAction): BrandFixState {
  if (action.type === 'reset') return initialBrandFixState(action.brand);
  if (action.type === 'target') return { ...state, targetBrand: action.value, preview: null };
  if (action.type === 'reason') return { ...state, reason: action.value, preview: null };
  if (action.type === 'source') {
    const sourceBrands = action.selected
      ? [...new Set([...state.sourceBrands, action.value])]
      : state.sourceBrands.filter((brand) => brand !== action.value);
    return { ...state, sourceBrands, preview: null };
  }
  if (action.fingerprint !== brandFixFingerprint(state)) return state;
  return { ...state, preview: action.result };
}

export function validateBrandFix(state: BrandFixState) {
  const errors: { sourceBrands?: string; reason?: string } = {};
  if (state.sourceBrands.length === 0) errors.sourceBrands = 'Select at least one spelling / اختر تهجئة واحدة على الأقل';
  if (state.reason.trim().length < 5) errors.reason = 'Enter a reason of at least 5 characters / أدخل سببًا من 5 أحرف على الأقل';
  else if (state.reason.length > 1000) errors.reason = 'Reason must be 1000 characters or fewer / يجب ألا يتجاوز السبب 1000 حرف';
  return errors;
}

export const canApplyBrandFix = (state: BrandFixState, pending = false) => Boolean(state.preview) && !pending;

export const BrandFixPreview: React.FC<{ result: ProductBrandNormalizeDryRunResult }> = ({ result }) => <section aria-label="Brand cleanup preview / معاينة توحيد الماركة" className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
  <div><h3 className="font-bold text-blue-950">Authoritative preview / المعاينة المعتمدة</h3><p className="text-sm text-blue-800"><strong>{result.affectedCount}</strong> products will change to <span dir="auto" className="font-semibold">{result.targetBrand}</span> / سيتم تعديل {result.affectedCount} منتج</p></div>
  {result.warnings.map((warning) => <p key={warning} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" dir="auto">{warning}</p>)}
  <ul className="max-h-56 space-y-2 overflow-auto rounded-lg border border-blue-100 bg-white p-3">
    {result.products.map((product) => <li key={product.id} className="flex items-center justify-between gap-3 text-sm"><span dir="auto" className="font-medium text-slate-800">{product.name}</span><span className="shrink-0 font-mono text-xs text-slate-500">{product.sku}</span></li>)}
    {result.products.length === 0 && <li className="text-sm text-slate-500">No products need changing / لا توجد منتجات تحتاج إلى تعديل.</li>}
  </ul>
</section>;

export function completeBrandFix(
  result: ProductBrandNormalizeWriteResult,
  onClose: () => void,
  notify: (message: string) => unknown = toast.success
) {
  notify(`${result.updatedCount} ${result.updatedCount === 1 ? 'product' : 'products'} updated / تم تحديث ${result.updatedCount} منتج`);
  onClose();
}

export const brandFixErrorMessage = (error: unknown) => axios.isAxiosError(error)
  ? error.response?.data?.error?.message ?? 'Brand cleanup failed / فشل توحيد تهجئة الماركة'
  : 'Brand cleanup failed / فشل توحيد تهجئة الماركة';

export async function requestBrandFixPreview(
  state: BrandFixState,
  normalize: (input: ProductBrandNormalizeInput) => Promise<ProductBrandNormalizeResult>
) {
  const errors = validateBrandFix(state);
  if (Object.keys(errors).length) return { errors };
  const fingerprint = brandFixFingerprint(state);
  try {
    const result = await normalize({
      sourceBrands: state.sourceBrands,
      targetBrand: state.targetBrand,
      reason: state.reason.trim(),
      dryRun: true,
    });
    return 'affectedCount' in result ? { errors, result, fingerprint } : { errors };
  } catch (error) {
    return { errors, error: brandFixErrorMessage(error) };
  }
}

export async function applyBrandFix(
  state: BrandFixState,
  normalize: (input: ProductBrandNormalizeInput) => Promise<ProductBrandNormalizeResult>,
  onClose: () => void,
  notify?: (message: string) => unknown
) {
  if (!state.preview) return null;
  try {
    const result = await normalize({
      sourceBrands: state.sourceBrands,
      targetBrand: state.targetBrand,
      reason: state.reason.trim(),
      dryRun: false,
    });
    if ('updatedCount' in result) completeBrandFix(result, onClose, notify);
    return null;
  } catch (error) {
    return brandFixErrorMessage(error);
  }
}

interface BrandFixDialogProps {
  brand: ProductBrandSummary;
  open: boolean;
  onClose: () => void;
}

export const BrandFixDialog: React.FC<BrandFixDialogProps> = ({ brand, open, onClose }) => {
  const mutation = useNormalizeProductBrands();
  const [state, dispatch] = useReducer(brandFixReducer, brand, initialBrandFixState);
  const [errors, setErrors] = useState<ReturnType<typeof validateBrandFix>>({});
  const [serverError, setServerError] = useState('');
  const counts = spellingCountsFor(brand);

  useEffect(() => {
    if (!open) return;
    dispatch({ type: 'reset', brand });
    setErrors({});
    setServerError('');
  }, [brand, open]);

  if (!open) return null;

  const preview = async () => {
    const attempt = await requestBrandFixPreview(state, mutation.mutateAsync);
    setErrors(attempt.errors);
    if ('error' in attempt && attempt.error) setServerError(attempt.error);
    if ('result' in attempt && attempt.result && attempt.fingerprint) {
      setServerError('');
      dispatch({ type: 'preview', result: attempt.result, fingerprint: attempt.fingerprint });
    }
  };

  const apply = async () => {
    if (!state.preview) return;
    setServerError('');
    const error = await applyBrandFix(state, mutation.mutateAsync, onClose);
    if (error) setServerError(error);
  };

  const invalidate = () => {
    setErrors({});
    setServerError('');
  };

  return <Modal isOpen onClose={onClose} size="lg" title="Fix brand spellings / توحيد تهجئة الماركة" description={brand.canonical}>
    <div className="space-y-5">
      {serverError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" dir="auto">{serverError}</p>}

      <fieldset className="space-y-2"><legend className="text-sm font-bold text-slate-800">Target spelling / التهجئة المعتمدة</legend>
        {counts.map(({ spelling, productCount }) => <label key={spelling} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
          <span className="flex items-center gap-2"><input type="radio" name="target-brand" checked={state.targetBrand === spelling} onChange={() => { invalidate(); dispatch({ type: 'target', value: spelling }); }} /><span dir="auto" className="font-semibold">{spelling}</span></span>
          <span className="text-xs text-slate-500">{productCount} {productCount === 1 ? 'product' : 'products'}</span>
        </label>)}
      </fieldset>

      <fieldset className="space-y-2"><legend className="text-sm font-bold text-slate-800">Spellings to include / التهجئات المشمولة</legend>
        <p className="text-xs text-slate-500">Only these exact stored strings can change / لا تتغير إلا النصوص المطابقة تمامًا.</p>
        <div className="flex flex-wrap gap-2">{brand.spellings.map((spelling) => <label key={spelling} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="checkbox" checked={state.sourceBrands.includes(spelling)} onChange={(event) => { invalidate(); dispatch({ type: 'source', value: spelling, selected: event.target.checked }); }} /><span dir="auto">{spelling}</span></label>)}</div>
        {errors.sourceBrands && <p className="text-xs text-red-600">{errors.sourceBrands}</p>}
      </fieldset>

      <label className="block space-y-2">
        <span className="text-sm font-bold text-slate-800">Reason / السبب</span>
        <textarea
          dir="auto"
          value={state.reason}
          maxLength={1000}
          onChange={(event) => { invalidate(); dispatch({ type: 'reason', value: event.target.value }); }}
          className="user-text min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <span className="block text-xs text-slate-500">At least 5 characters / 5 أحرف على الأقل</span>
        {errors.reason && <span className="block text-xs text-red-600">{errors.reason}</span>}
      </label>

      {state.preview && <BrandFixPreview result={state.preview} />}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
        {!state.preview && <span className="mr-auto text-xs text-slate-500">Preview is required before Apply / المعاينة مطلوبة قبل التطبيق.</span>}
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2">Cancel / إلغاء</button>
        <button type="button" onClick={preview} disabled={mutation.isPending} className="rounded-lg border border-emerald-600 px-4 py-2 font-semibold text-emerald-700 disabled:opacity-50">{mutation.isPending ? 'Working… / جارٍ التنفيذ…' : 'Preview / معاينة'}</button>
        <button type="button" onClick={apply} disabled={!canApplyBrandFix(state, mutation.isPending)} className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Apply / تطبيق</button>
      </div>
    </div>
  </Modal>;
};
