import { RotateCcw, Search } from 'lucide-react';
import { Button, Card, FormField, Input, Select } from '../../../components/ui';
import type { SalesOrderFilters as FilterValues } from '../types/sales-orders.types';
import { FULFILLMENT_STATUS_LABELS, PAYMENT_STATUS_LABELS, SALES_CHANNEL_LABELS } from '../utils/sales-order-labels';

export function SalesOrderFilters({ filters, onChange, onReset }: { filters: FilterValues; onChange: (key: keyof FilterValues, value: string) => void; onReset: () => void }) {
  return <Card dense><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
    <FormField label="Search / البحث" className="xl:col-span-2">{(field) => <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input {...field} value={filters.search ?? ''} onChange={(e) => onChange('search', e.target.value)} className="pl-9" /></div>}</FormField>
    <FormField label="Channel / القناة">{(field) => <Select {...field} value={filters.salesChannel?.[0] ?? ''} onChange={(e) => onChange('salesChannel', e.target.value)}><option value="">All channels</option>{Object.entries(SALES_CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</FormField>
    <FormField label="Payment / الدفع">{(field) => <Select {...field} value={filters.paymentStatus?.[0] ?? ''} onChange={(e) => onChange('paymentStatus', e.target.value)}><option value="">All payments</option>{Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</FormField>
    <FormField label="Fulfillment / التجهيز">{(field) => <Select {...field} value={filters.fulfillmentStatus?.[0] ?? ''} onChange={(e) => onChange('fulfillmentStatus', e.target.value)}><option value="">All statuses</option>{Object.entries(FULFILLMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>}</FormField>
    <div className="flex items-end"><Button variant="secondary" className="w-full" icon={<RotateCcw />} onClick={onReset}>Reset / إعادة</Button></div>
  </div></Card>;
}
