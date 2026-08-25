import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, FormField, Input, Modal, Textarea } from '../../../components/ui';
import { useAuth } from '../../../hooks/useAuth';
import { businessLabels } from '../../../shared/labels/business-labels';
import { CustomerPicker } from '../../customers/components/CustomerPicker';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { ProductImageView } from '../../products/components/ProductImageView';
import { ProductStockBadge } from '../../products/components/ProductStockBadge';
import { useProduct } from '../../products/hooks/useProducts';
import type { Product } from '../../products/types/product.types';
import type { SalesOrder } from '../types/sales-orders.types';
import { useCreateSalesOrder } from '../hooks/useSalesOrders';
import { todayString } from '../utils/sales-order-dates';
import {
  buildQuickOrderPayload,
  initialQuickOrderState,
  quickOrderCustomerOptional,
  quickOrderErrorMessage,
  type QuickOrderErrors,
  type QuickOrderFormState,
  type QuickOrderPaymentMode,
  quickOrderStockAdvice,
  quickOrderTotals,
  validateQuickOrder,
} from '../utils/quick-order-payload';

const labels = businessLabels.scanner;

export const QUICK_ORDER_PAYMENT_LABELS: Record<QuickOrderPaymentMode, string> = {
  PAID: labels.paidInFull,
  PARTIAL: labels.partialPayment,
  DEBT: labels.debtPayment,
};

const emptyState: QuickOrderFormState = {
  quantity: 1,
  unitPrice: '0.00',
  paymentMode: 'PAID',
  partialAmount: '',
  debtDueDate: '',
  customerId: '',
  notes: '',
};

export interface ScannerQuickOrderDialogProps {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ScannerQuickOrderDialog({ productId, isOpen, onClose }: ScannerQuickOrderDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const product = useProduct(isOpen ? productId ?? '' : '');
  const create = useCreateSalesOrder();
  const item = product.data;
  const initializedProductId = useRef<string | null>(item?.id ?? null);
  const [state, setState] = useState<QuickOrderFormState>(() => item ? initialQuickOrderState(item) : emptyState);
  const [errors, setErrors] = useState<QuickOrderErrors>({});
  const [serverError, setServerError] = useState('');
  const [createdOrder, setCreatedOrder] = useState<Pick<SalesOrder, 'id' | 'orderNumber'> | null>(null);
  const today = todayString();
  const totals = quickOrderTotals(state);
  const customerOptional = quickOrderCustomerOptional(state, user?.role === 'ADMIN');

  useEffect(() => {
    if (!isOpen || !item || initializedProductId.current === item.id) return;
    setState(initialQuickOrderState(item));
    setErrors({});
    setServerError('');
    setCreatedOrder(null);
    initializedProductId.current = item.id;
  }, [isOpen, item]);

  useEffect(() => {
    if (isOpen) return;
    initializedProductId.current = null;
    setState(emptyState);
    setErrors({});
    setServerError('');
    setCreatedOrder(null);
  }, [isOpen]);

  const change = <K extends keyof QuickOrderFormState>(field: K, value: QuickOrderFormState[K]) => {
    setState((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setServerError('');
  };

  const close = () => {
    initializedProductId.current = null;
    setState(emptyState);
    setErrors({});
    setServerError('');
    setCreatedOrder(null);
    onClose();
  };

  const submit = async () => {
    if (!item || !item.isActive) return;
    const nextErrors = validateQuickOrder(state, { isAdmin: user?.role === 'ADMIN', today });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setServerError('');
    try {
      const order = await create.mutateAsync(buildQuickOrderPayload({ productId: item.id, state, today }));
      setCreatedOrder({ id: order.id, orderNumber: order.orderNumber });
    } catch (error) {
      setServerError(quickOrderErrorMessage(error));
    }
  };

  const openOrder = () => {
    if (!createdOrder) return;
    const orderId = createdOrder.id;
    close();
    navigate(`/sales-orders/${orderId}`);
  };

  const footer = createdOrder
    ? undefined
    : <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <MoneySummary label="Total / الإجمالي" value={totals.total} />
          <MoneySummary label="Remaining / المتبقي" value={totals.remaining} />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={close}>{businessLabels.common.cancel}</Button>
          {item?.isActive && <Button icon={<ShoppingCart />} isLoading={create.isPending} onClick={submit}>{labels.createSalesOrder}</Button>}
        </div>
      </div>;

  return <Modal isOpen={isOpen} onClose={close} title={labels.quickOrderTitle} size="lg" footer={footer}>
    {createdOrder
      ? <ScannerQuickOrderSuccess order={createdOrder} onOpenOrder={openOrder} onScanNext={close} />
      : <div className="space-y-5">
          {serverError && <ScannerQuickOrderServerError message={serverError} />}

          {product.isLoading && <p role="status" className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Loading product / جارٍ تحميل المنتج…</p>}
          {product.isError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <span>Unable to load product details / تعذر تحميل تفاصيل المنتج</span>
            <Button size="sm" variant="secondary" onClick={() => product.refetch()}>Retry / إعادة المحاولة</Button>
          </div>}

          {item && <>
            <QuickOrderProductHeader product={item} unitPrice={state.unitPrice} />

            {!item.isActive && <div role="alert" className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm font-semibold text-slate-800">
              <AlertTriangle className="h-4 w-4" /> Archived product — ordering is unavailable / منتج مؤرشف — لا يمكن إنشاء طلب
            </div>}

            {item.isActive && <>
              <Card className="space-y-4">
                <SectionTitle number="1" title="Line / السطر" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Quantity / الكمية" required error={errors.quantity}>
                    {(field) => <div className="flex items-center gap-2">
                      <Button aria-label="Decrease quantity / تقليل الكمية" variant="secondary" size="sm" icon={<Minus />} onClick={() => change('quantity', Math.max(1, state.quantity - 1))} />
                      <Input {...field} numeric type="number" min={1} max={999} value={state.quantity} onChange={(event) => change('quantity', Number(event.target.value))} />
                      <Button aria-label="Increase quantity / زيادة الكمية" variant="secondary" size="sm" icon={<Plus />} onClick={() => change('quantity', Math.min(999, state.quantity + 1))} />
                    </div>}
                  </FormField>
                  <FormField label="Unit price / سعر الوحدة" required error={errors.unitPrice}>
                    {(field) => <Input {...field} numeric inputMode="decimal" value={state.unitPrice} onChange={(event) => change('unitPrice', event.target.value)} />}
                  </FormField>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <MoneySummary label="Line total / إجمالي السطر" value={totals.lineTotal} />
                  <StockAdvice product={item} quantity={state.quantity} />
                </div>
              </Card>

              <Card className="space-y-4">
                <SectionTitle number="2" title="Payment / الدفع" />
                <div className="flex flex-wrap gap-2" role="group" aria-label="Payment mode / طريقة الدفع">
                  {(Object.keys(QUICK_ORDER_PAYMENT_LABELS) as QuickOrderPaymentMode[]).map((mode) => <Button
                    key={mode}
                    variant={state.paymentMode === mode ? 'primary' : 'secondary'}
                    aria-pressed={state.paymentMode === mode}
                    onClick={() => change('paymentMode', mode)}
                  >{QUICK_ORDER_PAYMENT_LABELS[mode]}</Button>)}
                </div>
                {state.paymentMode === 'PARTIAL' && <FormField label="Paid amount / المبلغ المدفوع" required error={errors.partialAmount}>
                  {(field) => <Input {...field} numeric inputMode="decimal" value={state.partialAmount} onChange={(event) => change('partialAmount', event.target.value)} />}
                </FormField>}
                {totals.remaining !== '0.00' && <FormField label="Debt due date / تاريخ استحقاق الدين" required error={errors.debtDueDate}>
                  {(field) => <Input {...field} type="date" min={today} value={state.debtDueDate} onChange={(event) => change('debtDueDate', event.target.value)} />}
                </FormField>}
              </Card>

              <Card className="space-y-3">
                <SectionTitle number="3" title="Customer / الزبون" />
                <p className="text-sm text-slate-500">
                  {customerOptional
                    ? 'Optional for an admin-recorded fully paid sale / اختياري للبيع المدفوع بالكامل والمسجل بواسطة المدير'
                    : totals.remaining !== '0.00'
                      ? 'Required because a balance remains / مطلوب لوجود رصيد متبقٍ'
                      : 'Required for employee-recorded sales / مطلوب للمبيعات المسجلة بواسطة الموظف'}
                </p>
                <CustomerPicker value={state.customerId} onChange={(id) => change('customerId', id)} />
                {errors.customerId && <p role="alert" className="text-xs font-medium text-red-600">{errors.customerId}</p>}
              </Card>

              <Card className="space-y-3">
                <SectionTitle number="4" title="Notes / ملاحظات" />
                <FormField label="Order note (optional) / ملاحظة الطلب (اختياري)" error={errors.notes}>
                  {(field) => <Textarea {...field} userText maxLength={1000} value={state.notes} onChange={(event) => change('notes', event.target.value)} />}
                </FormField>
              </Card>
            </>}
          </>}
        </div>}
  </Modal>;
}

export const ScannerQuickOrderServerError = ({ message }: { message: string }) => (
  <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</div>
);

export const ScannerQuickOrderSuccess = ({
  order,
  onOpenOrder,
  onScanNext,
}: {
  order: Pick<SalesOrder, 'id' | 'orderNumber'>;
  onOpenOrder: () => void;
  onScanNext: () => void;
}) => <div className="space-y-5 py-4 text-center">
  <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" aria-hidden="true" />
  <div>
    <h3 className="text-lg font-bold text-slate-900">Sales order created / تم إنشاء طلب البيع</h3>
    <p className="mt-1 font-mono text-sm font-semibold text-slate-600">{order.orderNumber}</p>
  </div>
  <div className="flex flex-wrap justify-center gap-2">
    <Button onClick={onOpenOrder}>{labels.openOrder}</Button>
    <Button variant="secondary" onClick={onScanNext}>{labels.scanNext}</Button>
  </div>
</div>;

const QuickOrderProductHeader = ({ product, unitPrice }: { product: Product; unitPrice: string }) => (
  <div className="grid gap-4 sm:grid-cols-[7rem_1fr]">
    <ProductImageView productId={product.id} image={product.image} alt={product.name} fit="contain" className="h-28 w-full rounded-lg border border-slate-200 bg-slate-50 p-2" />
    <div className="min-w-0">
      <h3 className="user-text text-lg font-bold text-slate-900" dir="auto">{product.name}</h3>
      <p className="user-text text-sm text-slate-600" dir="auto">{product.model}{product.brand ? ` · ${product.brand}` : ''}</p>
      <p className="mt-2 break-words font-mono text-xs text-slate-500">SKU {product.sku}{product.barcode ? ` · ${product.barcode}` : ''}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ProductStockBadge status={product.stockStatus} />
        <span className="text-sm font-bold tabular-nums text-brand-700">{formatMoney(unitPrice)}</span>
      </div>
    </div>
  </div>
);

const StockAdvice = ({ product, quantity }: { product: Product; quantity: number }) => {
  const advice = quickOrderStockAdvice(product, quantity);
  return <Badge tone={advice.tone} icon={advice.overSelling ? <AlertTriangle /> : undefined}>{advice.label}</Badge>;
};

const SectionTitle = ({ number, title }: { number: string; title: string }) => (
  <h3 className="font-semibold text-slate-900"><span className="text-brand-700">{number} ·</span> {title}</h3>
);

const MoneySummary = ({ label, value }: { label: string; value: string }) => <div>
  <p className="text-xs text-slate-500">{label}</p>
  <p className="font-bold tabular-nums text-slate-900">{formatMoney(value)}</p>
</div>;
