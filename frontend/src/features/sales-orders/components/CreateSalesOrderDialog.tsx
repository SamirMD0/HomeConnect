import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Phone, Save, ShoppingBag, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, Card, FormField, Input, Modal, Select, Textarea } from '../../../components/ui';
import { CustomerPicker } from '../../customers/components/CustomerPicker';
import { useCustomer } from '../../customers/hooks/useCustomers';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { useCreateSalesOrder } from '../hooks/useSalesOrders';
import type { CreateSalesOrderInput, SalesChannel, SalesOrderLineInput } from '../types/sales-orders.types';
import { SALES_CHANNEL_LABELS } from '../utils/sales-order-labels';
import { emptySalesLine, SalesOrderItemsEditor } from './SalesOrderItemsEditor';
import { useAuth } from '../../../hooks/useAuth';

type PaymentMode = 'FULL' | 'PARTIAL' | 'UNPAID';
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

export function CreateSalesOrderDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const create = useCreateSalesOrder();
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState('');
  const customer = useCustomer(customerId);
  const [channel, setChannel] = useState<SalesChannel>('SHOP_DIRECT');
  const [items, setItems] = useState<SalesOrderLineInput[]>([emptySalesLine()]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('FULL');
  const [partialAmount, setPartialAmount] = useState('0.00');
  const [debtDueDate, setDebtDueDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0.00');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const total = useMemo(() => calculatePreview(items, channel === 'SHOP_DIRECT' ? '0.00' : deliveryFee), [items, channel, deliveryFee]);
  const paidAmount = paymentMode === 'FULL' ? total : paymentMode === 'UNPAID' ? '0.00' : normalizeMoney(partialAmount);
  const remaining = subtractPreview(total, paidAmount);
  const customerOptional = user?.role === 'ADMIN' && paymentMode === 'FULL';
  useEffect(() => { if (customer.data?.address && !deliveryAddress) setDeliveryAddress(customer.data.address); }, [customer.data?.address, deliveryAddress]);

  const reset = () => { setStep(0); setCustomerId(''); setChannel('SHOP_DIRECT'); setItems([emptySalesLine()]); setPaymentMode('FULL'); setPartialAmount('0.00'); setDebtDueDate(''); setDeliveryDate(''); setDeliveryFee('0.00'); setDeliveryAddress(''); setDeliveryNotes(''); };
  const close = () => { reset(); onClose(); };
  const next = () => {
    if (step === 0 && paymentMode !== 'FULL' && !debtDueDate) return toast.error('Enter the debt due date');
    if (step === 1 && !customerId && !customerOptional) return toast.error('Choose a customer');
    if (step === 3 && items.some((item) => (!item.productId && !item.manualProductName) || toCents(item.unitPrice) <= 0n)) return toast.error('Complete every item and price');
    if (step === 3 && paymentMode === 'PARTIAL' && (toCents(partialAmount) <= 0n || toCents(partialAmount) >= toCents(total))) return toast.error('Partial payment must be greater than zero and less than the total');
    if (step === 3 && channel === 'SHOP_DIRECT') setStep(5); else setStep((value) => Math.min(5, value + 1));
  };
  const back = () => { if (step === 5 && channel === 'SHOP_DIRECT') setStep(3); else setStep((value) => Math.max(0, value - 1)); };
  const submit = async (fulfillmentStatus: 'DRAFT' | 'CONFIRMED' | 'DELIVERED') => {
    if (fulfillmentStatus !== 'DRAFT' && paymentMode !== 'FULL' && !debtDueDate) {
      toast.error('Enter the debt due date before confirming');
      setStep(3);
      return;
    }
    const input: CreateSalesOrderInput = {
      customerId: customerId || null, salesChannel: channel, orderDate: today(), fulfillmentStatus,
      paidAmount, debtDueDate: paymentMode === 'FULL' || fulfillmentStatus === 'DRAFT' ? null : debtDueDate,
      items,
      ...(channel !== 'SHOP_DIRECT' ? { deliveryDate: deliveryDate || null, deliveryFee, deliveryAddressSnapshot: deliveryAddress || null, deliveryNotes: deliveryNotes || null } : {}),
    };
    try { await create.mutateAsync(input); toast.success('Sales order created'); close(); } catch { toast.error('Unable to create sales order'); }
  };

  const footer = <div className="flex w-full items-center justify-between gap-3"><div><p className="text-xs text-slate-500">Total / الإجمالي</p><p className="font-bold tabular-nums text-slate-900">{formatMoney(total)} <span className="ml-2 text-sm font-medium text-slate-500">Remaining {formatMoney(remaining)}</span></p></div><div className="flex gap-2">{step > 0 && <Button variant="secondary" icon={<ChevronLeft />} onClick={back}>Back</Button>}{step < 5 ? <Button icon={<ChevronRight />} iconPosition="right" onClick={next}>Next</Button> : <><Button variant="secondary" icon={<Save />} isLoading={create.isPending} onClick={() => submit('DRAFT')}>Save draft</Button><Button icon={<Check />} isLoading={create.isPending} onClick={() => submit(channel === 'SHOP_DIRECT' ? 'DELIVERED' : 'CONFIRMED')}>Confirm order</Button></>}</div></div>;

  return <Modal isOpen={isOpen} onClose={close} title="Create Sales Order / إنشاء طلب بيع" description={`Step ${step + 1} of 6`} size="xl" footer={footer}>
    {step === 0 && <div className="space-y-4"><FormField label="Payment / الدفع">{(field) => <Select {...field} value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}><option value="FULL">Paid in full / مدفوع بالكامل</option><option value="PARTIAL">Partial / جزئي</option><option value="UNPAID">Unpaid / غير مدفوع</option></Select>}</FormField>{paymentMode === 'PARTIAL' && <FormField label="Paid amount / المبلغ المدفوع" required>{(field) => <Input {...field} numeric value={partialAmount} onChange={(event) => setPartialAmount(event.target.value)} />}</FormField>}{paymentMode !== 'FULL' && <FormField label="Debt due date / تاريخ استحقاق الدين" required hint="This authorises creation of a debt for the remaining balance.">{(field) => <Input {...field} type="date" min={today()} value={debtDueDate} onChange={(event) => setDebtDueDate(event.target.value)} />}</FormField>}</div>}
    {step === 1 && <div className="space-y-3">{customerOptional && <p className="text-sm text-slate-500">Customer is optional for an admin-recorded fully paid sale / الزبون اختياري للبيع المدفوع بالكامل</p>}<CustomerPicker value={customerId} onChange={setCustomerId} /></div>}
    {step === 2 && <div className="grid gap-3 sm:grid-cols-3">{([['SHOP_DIRECT', <ShoppingBag />], ['SHOP_DELIVERY', <Truck />], ['PHONE_ORDER', <Phone />]] as const).map(([value, icon]) => <Card key={value} variant="interactive" role="button" tabIndex={0} onClick={() => setChannel(value)} className={channel === value ? 'border-brand-500 ring-2 ring-brand-500/20' : ''}><div className="mb-3 text-brand-600 [&>svg]:h-6 [&>svg]:w-6">{icon}</div><p className="font-semibold">{SALES_CHANNEL_LABELS[value]}</p></Card>)}</div>}
    {step === 3 && <SalesOrderItemsEditor items={items} onChange={setItems} />}
    {step === 4 && <div className="grid gap-4 sm:grid-cols-2"><FormField label="Delivery date / تاريخ التوصيل">{(field) => <Input {...field} type="date" min={today()} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} />}</FormField><FormField label="Delivery fee / رسم التوصيل">{(field) => <Input {...field} numeric value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} />}</FormField><FormField className="sm:col-span-2" label="Delivery address / عنوان التوصيل">{(field) => <Textarea {...field} userText value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} />}</FormField><FormField className="sm:col-span-2" label="Delivery notes / ملاحظات التوصيل">{(field) => <Textarea {...field} userText value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} />}</FormField></div>}
    {step === 5 && <div className="grid gap-4 sm:grid-cols-2"><Review label="Customer" value={customer.data?.name ?? (customerId ? 'Selected customer / الزبون المحدد' : 'Customer')} userText /><Review label="Channel" value={SALES_CHANNEL_LABELS[channel]} /><Review label="Items" value={`${items.length} line(s)`} /><Review label="Payment" value={`${paymentMode} · paid ${formatMoney(paidAmount)}`} /><Review label="Total" value={formatMoney(total)} /><Review label="Remaining" value={formatMoney(remaining)} />{paymentMode !== 'FULL' && <Review label="Debt due" value={debtDueDate || 'Required to confirm / مطلوب للتأكيد'} />}</div>}
  </Modal>;
}

function Review({ label, value, userText = false }: { label: string; value: string; userText?: boolean }) { return <Card dense><p className="text-xs text-slate-500">{label}</p><p className={userText ? 'user-text font-semibold' : 'font-semibold'} dir={userText ? 'auto' : undefined}>{value}</p></Card>; }
function toCents(value: string): bigint { const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim()); if (!match) return 0n; return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')); }
function fromCents(value: bigint): string { const safe = value < 0n ? 0n : value; return `${safe / 100n}.${String(safe % 100n).padStart(2, '0')}`; }
function normalizeMoney(value: string): string { return fromCents(toCents(value)); }
function calculatePreview(items: SalesOrderLineInput[], deliveryFee: string): string { return fromCents(items.reduce((sum, item) => sum + (toCents(item.unitPrice) * BigInt(item.quantity) - toCents(item.discountAmount ?? '0.00')), 0n) + toCents(deliveryFee)); }
function subtractPreview(total: string, paid: string): string { return fromCents(toCents(total) - toCents(paid)); }
