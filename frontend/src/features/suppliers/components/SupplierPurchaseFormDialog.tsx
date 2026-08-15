import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Plus } from 'lucide-react';
import { Button } from '../../../components/ui';
import { Modal } from '../../../components/ui/Modal';
import { canonicalMoneyInput, moneyToCents, sanitizeMoneyInput } from '../../customer-financial/utils/money-input';
import { normalizeFinancialError } from '../../customer-financial/utils/financial-form-errors';
import { todayAsBusinessDate } from '../../customer-financial/utils/business-date';
import { useCreateSupplierPurchase, useReceiptCheck } from '../hooks/useSupplierPurchases';
import type { Supplier } from '../types/supplier.types';
import {
  duplicateProductIds, emptyLine, hasQuickAdd, lineProblem, purchaseTotal, suggestedPurchaseDescription,
  toApiLines, type PurchaseLineDraft,
} from '../utils/supplier-purchase-form';
import { PurchaseLineRow } from './PurchaseLineRow';

interface Props {
  open: boolean;
  supplier: Pick<Supplier, 'id' | 'name' | 'phone'>;
  onClose: () => void;
}

const emptyForm = () => ({
  receiptNumber: '',
  transactionDate: todayAsBusinessDate(),
  description: '',
  reference: '',
  notes: '',
  receiveStock: true,
  overrideEnabled: false,
  amountOverride: '',
  amountOverrideReason: '',
  accountPassword: '',
});

/**
 * One form for a supplier invoice: what was bought, at what price, and whether
 * it arrived. The server turns it into a receiving document and a supplier debt
 * in a single transaction — this dialog never posts the two halves separately.
 */
export const SupplierPurchaseFormDialog: React.FC<Props> = ({ open, supplier, onClose }) => {
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<PurchaseLineDraft[]>(() => [emptyLine()]);
  /** Once the user writes their own description, stop overwriting it. */
  const [descriptionEdited, setDescriptionEdited] = useState(false);
  const create = useCreateSupplierPurchase();
  const receiptCheck = useReceiptCheck(open ? supplier.id : '', form.receiptNumber);

  const set = (key: keyof ReturnType<typeof emptyForm>) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const takenProductIds = useMemo(
    () => new Set(lines.map((line) => line.productId).filter((id): id is string => Boolean(id))),
    [lines]
  );
  const duplicates = useMemo(() => duplicateProductIds(lines), [lines]);
  const lineSum = purchaseTotal(lines);
  const quickAdd = hasQuickAdd(lines);
  const total = form.overrideEnabled && moneyToCents(form.amountOverride) > 0n ? form.amountOverride : lineSum;
  const suggestion = suggestedPurchaseDescription(lines, form.receiptNumber, total);
  // Derived, not stored: the suggestion tracks the lines until the user takes
  // the field over, and no effect can race the typing.
  const description = descriptionEdited ? form.description : suggestion;

  const blocker = (() => {
    if (!description.trim()) return 'Add a line so the description can be filled in / أضف بندًا ليُملأ الوصف تلقائيًا';
    if (duplicates.size) return 'The same product appears on more than one line — combine the quantities / تكرر المنتج في أكثر من بند';
    const problem = lines.map(lineProblem).find(Boolean);
    if (problem) return problem;
    if (moneyToCents(lineSum) <= 0n && !form.overrideEnabled) return 'A purchase must be worth more than zero / يجب أن تكون قيمة الفاتورة أكبر من صفر';
    if (form.overrideEnabled && moneyToCents(form.amountOverride) <= 0n) return 'Enter the total you are posting / أدخل الإجمالي المطلوب تسجيله';
    if (form.overrideEnabled && !form.amountOverrideReason.trim()) return 'Give a reason for the adjusted total / اذكر سبب تعديل الإجمالي';
    if (quickAdd && !form.accountPassword) return 'Your account password is required to add a new product / كلمة مرور الحساب مطلوبة لإضافة منتج جديد';
    if (quickAdd && !form.receiveStock) return 'A new product can only be added on a purchase that receives stock / لا يمكن إضافة منتج جديد دون استلام مخزون';
    return null;
  })();

  const reset = () => { setForm(emptyForm()); setLines([emptyLine()]); setDescriptionEdited(false); };
  const close = () => { reset(); onClose(); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blocker) { toast.error(blocker); return; }
    try {
      await create.mutateAsync({
        supplierId: supplier.id,
        input: {
          receiptNumber: form.receiptNumber.trim() || null,
          transactionDate: form.transactionDate,
          description: description.trim(),
          reference: form.reference.trim() || null,
          notes: form.notes.trim() || null,
          receiveStock: form.receiveStock,
          amountOverride: form.overrideEnabled ? canonicalMoneyInput(form.amountOverride) : null,
          amountOverrideReason: form.overrideEnabled ? form.amountOverrideReason.trim() : null,
          ...(quickAdd ? { accountPassword: form.accountPassword } : {}),
          lines: toApiLines(lines),
        },
      });
      close();
    } catch (error) {
      toast.error(normalizeFinancialError(error).message);
    }
  };

  const stockLineCount = lines.filter((line) => line.mode !== 'MANUAL').length;

  return <Modal isOpen={open} onClose={close} title="Add Supplier Purchase / إضافة فاتورة مورد" maxWidth="max-w-4xl">
    <form onSubmit={submit} className="space-y-4">
      <div className="rounded-md bg-slate-50 p-3">
        <p className="user-text font-semibold" dir="auto">{supplier.name}</p>
        <p className="text-sm text-slate-500">{supplier.phone}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">Receipt / invoice no. / رقم الفاتورة
          <input dir="auto" value={form.receiptNumber} onChange={set('receiptNumber')} className="user-text-input mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Purchase date / تاريخ الشراء
          <input type="date" required value={form.transactionDate} onChange={set('transactionDate')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
        </label>
      </div>

      {receiptCheck.data?.duplicate && <p role="status" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This receipt number is already recorded for this supplier / رقم الفاتورة مسجل لهذا المورد من قبل
          <span className="mt-1 block text-xs">
            {receiptCheck.data.matches.map((match) => `${match.transactionDate} · ${match.amount}`).join(' — ')}
          </span>
          <span className="mt-1 block text-xs font-semibold">You can still save if this is genuinely a second invoice / يمكنك المتابعة إذا كانت فاتورة أخرى فعلًا</span>
        </span>
      </p>}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-800">Lines / البنود</h3>
          <Button type="button" size="sm" variant="ghost" icon={<Plus />} onClick={() => setLines((current) => [...current, emptyLine()])}>Add line / إضافة بند</Button>
        </div>
        {lines.map((line, index) => <PurchaseLineRow
          key={line.key}
          line={line}
          index={index}
          takenProductIds={new Set([...takenProductIds].filter((id) => id !== line.productId))}
          requireOpeningCount={form.receiveStock}
          canRemove={lines.length > 1}
          onChange={(next) => setLines((current) => current.map((item) => item.key === line.key ? next : item))}
          onRemove={() => setLines((current) => current.filter((item) => item.key !== line.key))}
        />)}
      </section>

      {stockLineCount > 0 && <label className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
        <input type="checkbox" checked={form.receiveStock} onChange={(event) => setForm((current) => ({ ...current, receiveStock: event.target.checked }))} className="mt-0.5" />
        <span>
          <span className="font-semibold">Add these products to inventory now / إضافة المنتجات إلى المخزون الآن</span>
          <span className="mt-0.5 block text-xs text-slate-600">
            {form.receiveStock
              ? `${stockLineCount} product line(s) will be received and stock will increase / سيتم استلام البنود وزيادة المخزون`
              : 'The debt will be recorded with no stock movement / سيتم تسجيل الدين دون أي حركة مخزون'}
          </span>
        </span>
      </label>}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="purchase-description" className="text-sm font-semibold text-slate-700">Description / الوصف *</label>
          {descriptionEdited && suggestion
            ? <Button type="button" size="sm" variant="ghost" onClick={() => { setDescriptionEdited(false); setForm((current) => ({ ...current, description: '' })); }}>
                Use suggested / استخدام المقترح
              </Button>
            : <span className="text-xs text-slate-500">Filled in from the lines — edit if you prefer / يُملأ من البنود، ويمكنك تعديله</span>}
        </div>
        {/* A textarea, not an input: the description carries one line per
            language, and each needs its own direction to stay readable. */}
        <textarea
          id="purchase-description"
          dir="auto"
          required
          rows={3}
          value={description}
          onChange={(event) => { setDescriptionEdited(true); setForm((current) => ({ ...current, description: event.target.value })); }}
          className="user-text-input mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-normal leading-relaxed"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">Reference / المرجع
          <input dir="auto" value={form.reference} onChange={set('reference')} className="user-text-input mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">Notes / ملاحظات
          <input dir="auto" value={form.notes} onChange={set('notes')} className="user-text-input mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
        </label>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-700">Total debt / إجمالي الدين</span>
          <strong className="tabular-nums text-lg text-slate-900">{total}</strong>
        </div>
        {form.overrideEnabled && <p className="text-xs text-slate-600">Line sum / مجموع البنود: <span className="tabular-nums">{lineSum}</span></p>}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.overrideEnabled} onChange={(event) => setForm((current) => ({ ...current, overrideEnabled: event.target.checked, amountOverride: '', amountOverrideReason: '' }))} />
          Set the total by hand / تعيين الإجمالي يدويًا
        </label>
        {form.overrideEnabled && <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">Total to post / الإجمالي المسجل *
            <input inputMode="decimal" value={form.amountOverride} onChange={(event) => setForm((current) => ({ ...current, amountOverride: sanitizeMoneyInput(event.target.value) }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
          </label>
          <label className="block text-sm font-semibold text-slate-700">Reason / السبب *
            <input dir="auto" value={form.amountOverrideReason} onChange={set('amountOverrideReason')} className="user-text-input mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
          </label>
        </div>}
      </div>

      {quickAdd && <label className="block text-sm font-semibold text-slate-700">Account password / كلمة مرور الحساب *
        <input type="password" value={form.accountPassword} onChange={set('accountPassword')} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" />
        <span className="mt-1 block text-xs font-normal text-slate-500">Required because this purchase creates a new product and its opening count / مطلوبة لأن هذه الفاتورة تنشئ منتجًا جديدًا وجرده الافتتاحي</span>
      </label>}

      {blocker && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{blocker}</p>}

      <button type="submit" disabled={create.isPending || Boolean(blocker)} className="w-full rounded-md bg-emerald-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">
        {create.isPending ? 'Saving... / جارٍ الحفظ' : 'Save purchase / حفظ الفاتورة'}
      </button>
    </form>
  </Modal>;
};
