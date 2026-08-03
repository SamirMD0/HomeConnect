import { useState } from 'react';
import { ArrowLeft, Edit3, History, Plus, RotateCcw, ShoppingCart, Trash2, Truck, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, CardHeader, EmptyState, FormField, Input, Modal, PageHeader, SkeletonText, Table, Textarea, buttonClasses } from '../../components/ui';
import { formatBusinessDate, formatMoney } from '../../features/customer-financial/utils/financial-format';
import { salesOrdersApi } from '../../features/sales-orders/api/sales-orders.api';
import { DeliveryCard } from '../../features/sales-orders/components/DeliveryCard';
import { PaymentSummaryCard } from '../../features/sales-orders/components/PaymentSummaryCard';
import { ProductLinePicker } from '../../features/sales-orders/components/ProductLinePicker';
import { SalesChannelChip } from '../../features/sales-orders/components/SalesChannelChip';
import { SalesOrderAuditList } from '../../features/sales-orders/components/SalesOrderAuditList';
import { SalesOrderStatusChip } from '../../features/sales-orders/components/SalesOrderStatusChip';
import { emptySalesLine } from '../../features/sales-orders/components/SalesOrderItemsEditor';
import { useSalesOrder, useSalesOrderAction, useUpdateSalesOrder } from '../../features/sales-orders/hooks/useSalesOrders';
import type { SalesOrderItem, SalesOrderLineInput } from '../../features/sales-orders/types/sales-orders.types';
import { NEXT_FULFILLMENT_STATUS } from '../../features/sales-orders/utils/sales-order-status';
import { useAuth } from '../../hooks/useAuth';

type Dialog = 'cancel' | 'restore' | 'return' | 'debt' | 'installment' | 'unlink' | 'payment' | 'edit-details' | 'add-item' | 'edit-item' | 'remove-item' | null;

export function SalesOrderDetailsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const orderQuery = useSalesOrder(id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedItem, setSelectedItem] = useState<SalesOrderItem | null>(null);
  const [reason, setReason] = useState(''); const [password, setPassword] = useState('');
  const [dueDate, setDueDate] = useState(''); const [count, setCount] = useState(3);
  const [paidAmount, setPaidAmount] = useState('0.00'); const [notes, setNotes] = useState('');
  const [line, setLine] = useState<SalesOrderLineInput>(emptySalesLine());
  const statusMutation = useSalesOrderAction(salesOrdersApi.status, id);
  const cancelMutation = useSalesOrderAction(salesOrdersApi.cancel, id);
  const restoreMutation = useSalesOrderAction(salesOrdersApi.restore, id);
  const returnMutation = useSalesOrderAction(salesOrdersApi.returnOrder, id);
  const debtMutation = useSalesOrderAction(salesOrdersApi.createDebt, id);
  const installmentMutation = useSalesOrderAction(salesOrdersApi.createInstallmentPlan, id);
  const unlinkMutation = useSalesOrderAction(salesOrdersApi.unlinkFinancial, id);
  const paymentMutation = useSalesOrderAction(salesOrdersApi.payment, id);
  const updateMutation = useUpdateSalesOrder(id);
  const addItemMutation = useSalesOrderAction((orderId, input: object) => salesOrdersApi.addItem(orderId, input), id);
  const itemMutation = useSalesOrderAction((_orderId, input: { itemId: string; data: object }) => salesOrdersApi.updateItem(id, input.itemId, input.data), id);
  const removeItemMutation = useSalesOrderAction((_orderId, input: { itemId: string; data: object }) => salesOrdersApi.removeItem(id, input.itemId, input.data), id);

  if (orderQuery.isLoading) return <Card><SkeletonText lines={8} /></Card>;
  if (orderQuery.isError || !orderQuery.data) return <EmptyState title="Sales order not found" description="The order could not be loaded." action={<Link to="/sales-orders" className={buttonClasses('secondary')}>Back to orders</Link>} />;
  const order = orderQuery.data;
  const isFinal = ['CANCELLED', 'RETURNED'].includes(order.fulfillmentStatus);
  const canEditItems = !isFinal && (order.fulfillmentStatus === 'DRAFT' || isAdmin);
  const next = order.salesChannel === 'SHOP_DIRECT' && order.fulfillmentStatus === 'CONFIRMED' ? 'DELIVERED' : NEXT_FULFILLMENT_STATUS[order.fulfillmentStatus];
  const close = () => { setDialog(null); setReason(''); setPassword(''); setDueDate(''); setSelectedItem(null); setLine(emptySalesLine()); };
  const run = async () => {
    try {
      if (dialog === 'cancel') await cancelMutation.mutateAsync({ reason, accountPassword: password });
      if (dialog === 'restore') await restoreMutation.mutateAsync({ status: 'CONFIRMED', reason, accountPassword: password });
      if (dialog === 'return') await returnMutation.mutateAsync({ reason, accountPassword: password });
      if (dialog === 'debt') await debtMutation.mutateAsync({ dueDate });
      if (dialog === 'installment') await installmentMutation.mutateAsync({ startDate: dueDate, installmentCount: count, frequency: 'MONTHLY' });
      if (dialog === 'unlink') await unlinkMutation.mutateAsync({ reason, accountPassword: password });
      if (dialog === 'payment') await paymentMutation.mutateAsync({ paidAmount, debtDueDate: dueDate || null, reason, accountPassword: password });
      if (dialog === 'edit-details') await updateMutation.mutateAsync({ notes: notes || null });
      if (dialog === 'add-item') await addItemMutation.mutateAsync({ ...line, ...(dueDate ? { debtDueDate: dueDate } : {}), ...(order.fulfillmentStatus !== 'DRAFT' ? { reason, accountPassword: password } : {}) });
      if (dialog === 'edit-item' && selectedItem) await itemMutation.mutateAsync({ itemId: selectedItem.id, data: { ...line, ...(dueDate ? { debtDueDate: dueDate } : {}), ...(order.fulfillmentStatus !== 'DRAFT' ? { reason, accountPassword: password } : {}) } });
      if (dialog === 'remove-item' && selectedItem) await removeItemMutation.mutateAsync({ itemId: selectedItem.id, data: order.fulfillmentStatus === 'DRAFT' ? {} : { ...(dueDate ? { debtDueDate: dueDate } : {}), reason, accountPassword: password } });
      toast.success('Sales order updated'); close();
    } catch { toast.error('Unable to update sales order'); }
  };
  const openItem = (mode: Dialog, item?: SalesOrderItem) => { setDueDate(''); setSelectedItem(item ?? null); if (item) setLine({ productId: item.productId, manualProductName: item.manualProductName, manualProductModel: item.manualProductModel, quantity: item.quantity, unitPrice: item.unitPrice, discountAmount: item.discountAmount, notes: item.notes }); else setLine(emptySalesLine()); setDialog(mode); };
  const openPayment = () => { setPaidAmount(order.paidAmount); setDueDate(''); setDialog('payment'); };
  const openDetails = () => { setNotes(order.notes ?? ''); setDialog('edit-details'); };
  const advance = async () => { if (!next) return; try { await statusMutation.mutateAsync({ status: next }); toast.success('Fulfillment advanced'); } catch { toast.error('Unable to advance fulfillment'); } };
  const itemColumns = [
    { header: 'Product', accessor: (item: SalesOrderItem) => <div dir="auto"><p className="user-text font-medium">{item.productNameSnapshot}</p><p className="user-text text-xs text-slate-500">{item.productModelSnapshot ?? item.skuSnapshot ?? ''}</p></div> },
    { header: 'Qty', accessor: (item: SalesOrderItem) => item.quantity },
    { header: 'Unit price', accessor: (item: SalesOrderItem) => formatMoney(item.unitPrice) },
    { header: 'Discount', accessor: (item: SalesOrderItem) => formatMoney(item.discountAmount) },
    { header: 'Line total', accessor: (item: SalesOrderItem) => <strong>{formatMoney(item.lineTotal)}</strong> },
    ...(canEditItems ? [{ header: 'Actions', accessor: (item: SalesOrderItem) => <div className="flex gap-1"><Button size="sm" variant="ghost" icon={<Edit3 />} onClick={(event) => { event.stopPropagation(); openItem('edit-item', item); }}>Edit</Button><Button size="sm" variant="ghost" icon={<Trash2 />} onClick={(event) => { event.stopPropagation(); openItem('remove-item', item); }}>Remove</Button></div> }] : []),
  ];
  const paymentActions = <div className="flex flex-wrap gap-2">{isAdmin && order.settlement === 'NONE' && !isFinal && <Button size="sm" variant="secondary" onClick={openPayment}>Adjust payment</Button>}{order.remainingAmount !== '0.00' && order.settlement === 'NONE' && <><Button size="sm" variant="secondary" onClick={() => setDialog('debt')}>Create Debt</Button><Button size="sm" variant="secondary" onClick={() => setDialog('installment')}>Create Plan</Button></>}{isAdmin && order.settlement !== 'NONE' && <Button size="sm" variant="danger" onClick={() => setDialog('unlink')}>Unlink</Button>}</div>;

  return <div className="space-y-6">
    <Link to="/sales-orders" className={buttonClasses('link')}><ArrowLeft className="h-4 w-4" /> Back to Sales Orders</Link>
    <PageHeader title={order.orderNumber} description={`Created ${formatBusinessDate(order.orderDate)} by ${order.createdBy.fullName}`} icon={<ShoppingCart />} actions={<>{next && !isFinal && <Button icon={<Truck />} isLoading={statusMutation.isPending} onClick={advance}>Advance status</Button>}{isAdmin && !isFinal && <Button variant="danger" icon={<XCircle />} onClick={() => setDialog('cancel')}>Remove / إزالة</Button>}{isAdmin && isFinal && <Button variant="secondary" icon={<RotateCcw />} onClick={() => setDialog('restore')}>Restore</Button>}{isAdmin && order.fulfillmentStatus === 'DELIVERED' && <Button variant="secondary" onClick={() => setDialog('return')}>Return</Button>}</>} />
    <div className="flex flex-wrap gap-2"><SalesChannelChip channel={order.salesChannel} /><SalesOrderStatusChip status={order.fulfillmentStatus} /></div>
    <div className="grid gap-6 lg:grid-cols-3"><div className="space-y-6 lg:col-span-2"><Card><CardHeader title="Customer / الزبون" />{order.customer ? <><Link to={`/customers/${order.customer.id}`} className="user-text font-semibold text-brand-700" dir="auto">{order.customer.name}</Link><p className="text-sm text-slate-500">{order.customer.phone}</p></> : <p className="text-sm font-medium text-slate-600">Customer</p>}</Card><Card><CardHeader title="Items / الأصناف" action={canEditItems ? <Button size="sm" variant="secondary" icon={<Plus />} onClick={() => openItem('add-item')}>Add item</Button> : undefined} /><Table data={order.items} columns={itemColumns} keyExtractor={(item) => item.id} /><div className="mt-4 flex justify-end"><dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm"><dt>Subtotal</dt><dd className="text-right tabular-nums">{formatMoney(order.itemsSubtotal)}</dd><dt>Delivery</dt><dd className="text-right tabular-nums">{formatMoney(order.deliveryFee)}</dd><dt className="font-semibold">Total</dt><dd className="text-right font-semibold tabular-nums">{formatMoney(order.totalAmount)}</dd></dl></div></Card><PaymentSummaryCard order={order} actions={paymentActions} /><Card><CardHeader title="Notes / ملاحظات" action={!isFinal ? <Button size="sm" variant="secondary" icon={<Edit3 />} onClick={openDetails}>Edit</Button> : undefined} /><p className="user-text whitespace-pre-wrap text-sm text-slate-700" dir="auto">{order.notes || 'No notes.'}</p></Card>{isAdmin && <Card><CardHeader title="History / السجل" icon={<History />} /><SalesOrderAuditList salesOrderId={order.id} /></Card>}</div><aside><DeliveryCard order={order} /></aside></div>
    <ActionDialog dialog={dialog} close={close} run={run} loading={[cancelMutation, restoreMutation, returnMutation, debtMutation, installmentMutation, unlinkMutation, paymentMutation, updateMutation, addItemMutation, itemMutation, removeItemMutation].some((mutation) => mutation.isPending)} reason={reason} setReason={setReason} password={password} setPassword={setPassword} dueDate={dueDate} setDueDate={setDueDate} count={count} setCount={setCount} paidAmount={paidAmount} setPaidAmount={setPaidAmount} notes={notes} setNotes={setNotes} line={line} setLine={setLine} requiresAdmin={order.fulfillmentStatus !== 'DRAFT'} />
  </div>;
}

function ActionDialog(props: { dialog: Dialog; close: () => void; run: () => void; loading: boolean; reason: string; setReason: (v: string) => void; password: string; setPassword: (v: string) => void; dueDate: string; setDueDate: (v: string) => void; count: number; setCount: (v: number) => void; paidAmount: string; setPaidAmount: (v: string) => void; notes: string; setNotes: (v: string) => void; line: SalesOrderLineInput; setLine: (v: SalesOrderLineInput) => void; requiresAdmin: boolean }) {
  const { dialog } = props; if (!dialog) return null;
  const itemDialog = ['add-item', 'edit-item'].includes(dialog); const balanceChangingDialog = itemDialog || dialog === 'remove-item'; const adminDialog = ['cancel', 'restore', 'return', 'unlink', 'payment', 'remove-item'].includes(dialog) || (itemDialog && props.requiresAdmin);
  const title = dialog.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return <Modal isOpen onClose={props.close} title={`${title} / إجراء إداري`} footer={<><Button variant="secondary" onClick={props.close}>Cancel</Button><Button variant={['cancel', 'remove-item'].includes(dialog) ? 'danger' : 'primary'} isLoading={props.loading} onClick={props.run}>Confirm</Button></>}>
    <div className="space-y-4">{itemDialog && <ProductLinePicker value={props.line} onChange={props.setLine} />}{balanceChangingDialog && props.requiresAdmin && <FormField label="Debt due date if this change leaves a balance / تاريخ استحقاق الدين عند بقاء رصيد">{(field) => <Input {...field} type="date" value={props.dueDate} onChange={(event) => props.setDueDate(event.target.value)} />}</FormField>}{dialog === 'edit-details' && <FormField label="Notes / ملاحظات">{(field) => <Textarea {...field} userText value={props.notes} onChange={(event) => props.setNotes(event.target.value)} />}</FormField>}{dialog === 'payment' && <><FormField label="Paid amount / المبلغ المدفوع" required>{(field) => <Input {...field} numeric value={props.paidAmount} onChange={(event) => props.setPaidAmount(event.target.value)} />}</FormField><FormField label="Debt due date if a balance remains / تاريخ استحقاق الدين عند بقاء رصيد">{(field) => <Input {...field} type="date" value={props.dueDate} onChange={(event) => props.setDueDate(event.target.value)} />}</FormField></>}{['debt', 'installment'].includes(dialog) && <FormField label={dialog === 'debt' ? 'Due date / تاريخ الاستحقاق' : 'Start date / تاريخ البداية'} required>{(field) => <Input {...field} type="date" value={props.dueDate} onChange={(event) => props.setDueDate(event.target.value)} />}</FormField>}{dialog === 'installment' && <FormField label="Installment count / عدد الدفعات" required>{(field) => <Input {...field} numeric type="number" min={2} max={60} value={props.count} onChange={(event) => props.setCount(Number(event.target.value))} />}</FormField>}{adminDialog && <><FormField label="Reason / السبب" required>{(field) => <Textarea {...field} userText value={props.reason} onChange={(event) => props.setReason(event.target.value)} />}</FormField><FormField label="Account password / كلمة مرور الحساب" required>{(field) => <Input {...field} type="password" value={props.password} onChange={(event) => props.setPassword(event.target.value)} />}</FormField></>}</div>
  </Modal>;
}
