import axios from 'axios';
import { PackageMinus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge, Button, Card, CardHeader, FormField, Modal, Textarea } from '../../../components/ui';
import { useDeductSalesOrderStock, useRestoreSalesOrderStock } from '../hooks/useSalesOrders';
import type { SalesOrder, SalesOrderInventoryState } from '../types/sales-orders.types';

const STATE_LABELS: Record<SalesOrderInventoryState, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  NOT_INVENTORY_LINE: { label: 'Manual order lines cannot affect inventory / لا يمكن لأسطر الطلب اليدوية التأثير على المخزون', tone: 'neutral' },
  STOCK_NOT_TRACKED: { label: 'Stock tracking is disabled for this product / تتبع المخزون غير مفعّل لهذا المنتج', tone: 'neutral' },
  NEEDS_OPENING_COUNT: { label: 'This product needs a verified opening count before stock actions / يحتاج هذا المنتج جردًا مؤكدًا قبل حركات المخزون', tone: 'warning' },
  PREDATES_OPENING_COUNT: { label: 'This order predates the verified opening count for this product; its stock effect is already included in the counted quantity. / هذا الطلب يسبق الجرد الافتتاحي المؤكد لهذا المنتج، وتأثيره على المخزون محتسب مسبقًا.', tone: 'warning' },
  ORDER_NOT_ELIGIBLE: { label: 'This order is not eligible for stock deduction / هذا الطلب غير مؤهل لإخراج المخزون', tone: 'neutral' },
  INSUFFICIENT_STOCK: { label: 'Insufficient stock', tone: 'danger' },
  ALREADY_DEDUCTED: { label: 'Stock has already been deducted for this line / تم إخراج المخزون لهذا السطر', tone: 'info' },
  RESTORED: { label: 'Stock was restored; this line can be deducted again / تمت إعادة المخزون ويمكن إخراج هذا السطر مجددًا', tone: 'success' },
  AVAILABLE: { label: 'Available to deduct / متاح للإخراج', tone: 'success' },
};

type Dialog = 'deduct' | 'restore' | null;

export function SalesOrderInventoryPanel({ order, isAdmin }: { order: SalesOrder; isAdmin: boolean }) {
  const eligibleItems = useMemo(
    () => order.items.filter((item) => ['AVAILABLE', 'RESTORED'].includes(item.inventory?.state)),
    [order.items]
  );
  const activeFulfillments = useMemo(
    () => order.items.flatMap((item) => item.inventory?.activeFulfillmentId
      ? [{ itemId: item.id, fulfillmentId: item.inventory.activeFulfillmentId }]
      : []),
    [order.items]
  );
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedFulfillmentIds, setSelectedFulfillmentIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const deduct = useDeductSalesOrderStock(order.id);
  const restore = useRestoreSalesOrderStock(order.id);

  useEffect(() => {
    setSelectedItemIds((current) => current.filter((id) => eligibleItems.some((item) => item.id === id)));
  }, [eligibleItems]);

  useEffect(() => {
    setSelectedFulfillmentIds((current) => current.filter((id) =>
      activeFulfillments.some((entry) => entry.fulfillmentId === id)
    ));
  }, [activeFulfillments]);

  const close = () => {
    setDialog(null);
    setNote('');
    setReason('');
    setServerError(null);
  };

  const submit = async () => {
    setServerError(null);
    try {
      const result = dialog === 'deduct'
        ? await deduct.mutateAsync({ itemIds: selectedItemIds, note: note || null })
        : await restore.mutateAsync({ fulfillmentIds: selectedFulfillmentIds, reason, note: note || null });
      toast.success(result.message);
      setSelectedItemIds([]);
      setSelectedFulfillmentIds([]);
      close();
    } catch (error) {
      setServerError(errorMessage(error));
    }
  };

  const toggle = (itemId: string) => setSelectedItemIds((current) =>
    current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]
  );
  const toggleFulfillment = (fulfillmentId: string) => setSelectedFulfillmentIds((current) =>
    current.includes(fulfillmentId)
      ? current.filter((id) => id !== fulfillmentId)
      : [...current, fulfillmentId]
  );

  return <Card>
    <CardHeader
      title="Inventory fulfillment / حركة المخزون"
      action={<div className="flex flex-wrap gap-2">
        {eligibleItems.length > 0 && <Button
          size="sm"
          icon={<PackageMinus />}
          disabled={selectedItemIds.length === 0}
          onClick={() => setDialog('deduct')}
        >Deduct Stock / إخراج من المخزون</Button>}
        {isAdmin && activeFulfillments.length > 0 && <Button
          size="sm"
          variant="secondary"
          icon={<RotateCcw />}
          disabled={selectedFulfillmentIds.length === 0}
          onClick={() => setDialog('restore')}
        >Restore Stock / إرجاع إلى المخزون</Button>}
      </div>}
    />
    <div className="space-y-2">
      {order.items.map((item) => {
        const state = item.inventory?.state ?? 'ORDER_NOT_ELIGIBLE';
        const eligible = state === 'AVAILABLE' || state === 'RESTORED';
        const activeFulfillmentId = item.inventory?.activeFulfillmentId;
        const restorable = isAdmin && Boolean(activeFulfillmentId);
        const status = STATE_LABELS[state];
        const statusLabel = state === 'INSUFFICIENT_STOCK'
          ? `Cannot deduct ${item.quantity}; only ${item.product?.stockQuantity ?? 0} units are in stock / لا يمكن إخراج ${item.quantity}؛ المتوفر ${item.product?.stockQuantity ?? 0} فقط`
          : status.label;
        return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
          <label className="flex min-w-0 items-center gap-3">
            <input
              type="checkbox"
              aria-label={`Select ${item.productNameSnapshot}`}
              checked={eligible
                ? selectedItemIds.includes(item.id)
                : Boolean(activeFulfillmentId && selectedFulfillmentIds.includes(activeFulfillmentId))}
              disabled={!eligible && !restorable}
              onChange={() => eligible ? toggle(item.id) : activeFulfillmentId && toggleFulfillment(activeFulfillmentId)}
            />
            <span className="min-w-0"><span className="user-text block font-medium" dir="auto">{item.productNameSnapshot}</span><span className="text-xs text-slate-500">{item.quantity} unit(s) · {item.product?.stockQuantity ?? '—'} in stock</span></span>
          </label>
          <Badge tone={status.tone}>{statusLabel}</Badge>
        </div>;
      })}
    </div>
    {activeFulfillments.length > 0 && <p className="mt-3 text-sm text-amber-700">Stock has already been deducted for one or more lines. Restore it before editing, removing, cancelling, or returning. / تم إخراج المخزون لسطر واحد أو أكثر. أعد المخزون قبل التعديل أو الحذف أو الإلغاء أو الإرجاع.</p>}

    <Modal
      isOpen={dialog === 'deduct'}
      onClose={close}
      title="Deduct Stock / إخراج من المخزون"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button isLoading={deduct.isPending} disabled={selectedItemIds.length === 0} onClick={submit}>Confirm</Button></>}
    >
      <SalesOrderStockActionFields action="deduct" note={note} reason={reason} serverError={serverError} onNote={setNote} onReason={setReason} />
    </Modal>

    <Modal
      isOpen={dialog === 'restore'}
      onClose={close}
      title="Restore Stock / إرجاع إلى المخزون"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button isLoading={restore.isPending} disabled={!reason.trim() || selectedFulfillmentIds.length === 0} onClick={submit}>Confirm</Button></>}
    >
      <SalesOrderStockActionFields action="restore" note={note} reason={reason} serverError={serverError} onNote={setNote} onReason={setReason} />
    </Modal>
  </Card>;
}

export function SalesOrderStockActionFields(props: {
  action: 'deduct' | 'restore';
  note: string;
  reason: string;
  serverError: string | null;
  onNote: (value: string) => void;
  onReason: (value: string) => void;
}) {
  return <div className="space-y-4">
    {props.action === 'restore' && <FormField label="Reason / السبب *" required>{(field) => <Textarea {...field} userText required value={props.reason} onChange={(event) => props.onReason(event.target.value)} />}</FormField>}
    <FormField label="Note (optional) / ملاحظة (اختياري)">{(field) => <Textarea {...field} userText value={props.note} onChange={(event) => props.onNote(event.target.value)} />}</FormField>
    {props.action === 'restore' && <p className="text-xs text-slate-500">Administrator action. No account password is required. / إجراء للمسؤول ولا يتطلب كلمة مرور الحساب.</p>}
    {props.serverError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{props.serverError}</p>}
  </div>;
}

function errorMessage(error: unknown): string {
  return axios.isAxiosError(error)
    ? error.response?.data?.error?.message ?? 'Stock action failed / فشلت حركة المخزون'
    : 'Stock action failed / فشلت حركة المخزون';
}
