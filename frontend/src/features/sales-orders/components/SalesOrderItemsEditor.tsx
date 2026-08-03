import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardHeader } from '../../../components/ui';
import type { SalesOrderLineInput } from '../types/sales-orders.types';
import { ProductLinePicker } from './ProductLinePicker';

export const emptySalesLine = (): SalesOrderLineInput => ({ productId: null, manualProductName: '', manualProductModel: '', quantity: 1, unitPrice: '0.00', discountAmount: '0.00' });

export function SalesOrderItemsEditor({ items, onChange }: { items: SalesOrderLineInput[]; onChange: (items: SalesOrderLineInput[]) => void }) {
  return <div className="space-y-3">{items.map((item, index) => <Card dense key={index}><CardHeader title={`Item ${index + 1} / الصنف ${index + 1}`} action={items.length > 1 ? <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button> : undefined} /><ProductLinePicker value={item} onChange={(next) => onChange(items.map((candidate, itemIndex) => itemIndex === index ? next : candidate))} /></Card>)}<Button variant="secondary" icon={<Plus />} onClick={() => onChange([...items, emptySalesLine()])}>Add another item / إضافة صنف</Button></div>;
}
