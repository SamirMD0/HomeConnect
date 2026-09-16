import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Button, FormField, Input, Modal, Textarea } from '../../../components/ui';
import { salesOrdersApi } from '../api/sales-orders.api';
import type { SalesOrder, SalesReturnRefundMethod, SalesReturnStockDisposition } from '../types/sales-orders.types';

interface LineState {
  quantity: number;
  disposition: SalesReturnStockDisposition;
  conditionNote: string;
}

export function SalesReturnDialog({ order, onClose }: { order: SalesOrder; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<Record<string, LineState>>(() => Object.fromEntries(
    order.items.map((item) => [item.id, { quantity: 0, disposition: 'SELLABLE', conditionNote: '' }])
  ));
  const [method, setMethod] = useState<SalesReturnRefundMethod>('NONE');
  const [returnDeliveryFee, setReturnDeliveryFee] = useState(false);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const idempotencyKey = useMemo(() => `sales-return-${crypto.randomUUID()}`, []);
  const mutation = useMutation({
    mutationFn: () => salesOrdersApi.returnOrder(order.id, {
      idempotencyKey,
      items: order.items.filter((item) => lines[item.id].quantity > 0).map((item) => ({
        salesOrderItemId: item.id,
        quantity: lines[item.id].quantity,
        stockDisposition: lines[item.id].disposition,
        conditionNote: lines[item.id].conditionNote || null,
      })),
      returnDeliveryFee,
      refundMethod: method,
      reason,
      overrideReturnWindow: override,
      windowOverrideReason: override ? overrideReason : null,
      accountPassword: password,
    }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      toast.success('Return posted / تم تسجيل المرتجع');
      navigate(`/sales-returns/${result.id}`);
    },
    onError: () => toast.error('Unable to post return / تعذر تسجيل المرتجع'),
  });
  const deliveryAlreadyReturned = (order.returns ?? []).some((item) => item.deliveryReturned);

  return <Modal isOpen onClose={onClose} title="Sales return / مرتجع مبيعات" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button isLoading={mutation.isPending} onClick={() => mutation.mutate()}>Post return / تسجيل المرتجع</Button></>}>
    <div className="space-y-5">
      <p className="text-sm text-slate-600">Select quantities and conditions. The server derives every amount from the original invoice snapshots.</p>
      {order.items.filter((item) => (item.remainingReturnableQuantity ?? item.quantity) > 0).map((item) => <div key={item.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
        <div><p className="user-text font-semibold" dir="auto">{item.productNameSnapshot}</p><p className="text-xs text-slate-500">Remaining / المتبقي: {item.remainingReturnableQuantity ?? item.quantity}</p></div>
        <FormField label="Return quantity / كمية الإرجاع">{(field) => <Input {...field} type="number" min={0} max={item.remainingReturnableQuantity ?? item.quantity} value={lines[item.id].quantity} onChange={(event) => setLines((current) => ({ ...current, [item.id]: { ...current[item.id], quantity: Number(event.target.value) } }))} />}</FormField>
        <label className="text-sm font-medium">Disposition / الحالة<select className="mt-1 block w-full rounded-md border border-slate-300 p-2" value={lines[item.id].disposition} onChange={(event) => setLines((current) => ({ ...current, [item.id]: { ...current[item.id], disposition: event.target.value as SalesReturnStockDisposition } }))}><option value="SELLABLE">Sellable / صالح للبيع</option><option value="DAMAGED">Damaged / تالف</option><option value="QUARANTINE">Quarantine / قيد الفحص</option></select></label>
        <FormField className="sm:col-span-3" label="Condition note / ملاحظة الحالة">{(field) => <Input {...field} userText value={lines[item.id].conditionNote} onChange={(event) => setLines((current) => ({ ...current, [item.id]: { ...current[item.id], conditionNote: event.target.value } }))} />}</FormField>
      </div>)}
      <label className="block text-sm font-medium">Refund destination / وجهة الاسترداد<select className="mt-1 block w-full rounded-md border border-slate-300 p-2" value={method} onChange={(event) => setMethod(event.target.value as SalesReturnRefundMethod)}><option value="NONE">No payout — apply to outstanding / حسم من الرصيد</option><option value="CASH_OUT">Cash out / استرداد نقدي</option><option value="STORE_CREDIT">Store credit / رصيد للعميل</option></select></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" disabled={deliveryAlreadyReturned || order.deliveryFee === '0.00'} checked={returnDeliveryFee} onChange={(event) => setReturnDeliveryFee(event.target.checked)} /> Return original delivery fee / إرجاع رسم التوصيل</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} /> Admin return-window override / تجاوز مهلة الإرجاع</label>
      {override && <FormField label="Override reason / سبب التجاوز" required>{(field) => <Textarea {...field} userText value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />}</FormField>}
      <FormField label="Return reason / سبب الإرجاع" required>{(field) => <Textarea {...field} userText value={reason} onChange={(event) => setReason(event.target.value)} />}</FormField>
      <FormField label="Account password / كلمة مرور الحساب" required>{(field) => <Input {...field} type="password" value={password} onChange={(event) => setPassword(event.target.value)} />}</FormField>
    </div>
  </Modal>;
}
