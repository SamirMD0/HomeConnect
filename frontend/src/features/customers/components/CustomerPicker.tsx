import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, UserCheck } from 'lucide-react';
import { Button, Card, FormField, Input } from '../../../components/ui';
import { useCreateCustomer, useCustomers } from '../hooks/useCustomers';

export const CustomerPicker: React.FC<{
  value: string;
  onChange: (id: string) => void;
  locked?: boolean;
}> = ({ value, onChange, locked = false }) => {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [quickCreate, setQuickCreate] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', address: '' });
  useEffect(() => { const id = window.setTimeout(() => setDebounced(search.trim()), 300); return () => window.clearTimeout(id); }, [search]);
  const customers = useCustomers({ search: debounced, limit: 10 });
  const createCustomer = useCreateCustomer();
  const list = useMemo(() => customers.data?.data ?? [], [customers.data?.data]);
  const selected = list.find((customer) => customer.id === value);
  const duplicatePhone = useMemo(() => list.find((customer) => draft.phone && customer.phone.replace(/\s/g, '') === draft.phone.replace(/\s/g, '')), [draft.phone, list]);

  if (locked) return <Card dense><p className="text-xs font-medium text-slate-500">Customer / الزبون</p><p className="user-text font-semibold text-slate-900" dir="auto">{selected?.name ?? 'Selected customer / الزبون المختار'}</p>{selected && <p className="text-sm text-slate-500">{selected.phone}</p>}</Card>;

  const submit = async () => {
    const customer = await createCustomer.mutateAsync({ name: draft.name, phone: draft.phone, address: draft.address || undefined });
    onChange(customer.id); setQuickCreate(false);
  };

  return <div className="space-y-3">
    <FormField label="Search customer / البحث عن زبون">
      {(field) => <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input {...field} userText value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></div>}
    </FormField>
    <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
      {list.map((customer) => <Button key={customer.id} variant="ghost" className="h-auto w-full justify-start rounded-none px-3 py-2 text-left" onClick={() => onChange(customer.id)} icon={value === customer.id ? <UserCheck /> : undefined}><span><span className="user-text block font-medium" dir="auto">{customer.name}</span><span className="text-xs text-slate-500">{customer.phone}</span></span></Button>)}
      {!customers.isLoading && list.length === 0 && <p className="p-3 text-sm text-slate-500">No matching customers / لا يوجد زبائن مطابقون</p>}
    </div>
    {!quickCreate ? <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setQuickCreate(true)}>Quick create / إضافة سريعة</Button> : <Card dense className="space-y-3">
      <FormField label="Name / الاسم" required>{(field) => <Input {...field} userText value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />}</FormField>
      <FormField label="Phone / الهاتف" required error={duplicatePhone ? 'This phone already exists / رقم الهاتف موجود' : undefined}>{(field) => <Input {...field} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />}</FormField>
      {duplicatePhone && <Button variant="secondary" size="sm" onClick={() => { onChange(duplicatePhone.id); setQuickCreate(false); }}>Use {duplicatePhone.name}</Button>}
      <FormField label="Address / العنوان">{(field) => <Input {...field} userText value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />}</FormField>
      <div className="flex gap-2"><Button size="sm" isLoading={createCustomer.isPending} disabled={!draft.name || !draft.phone || Boolean(duplicatePhone)} onClick={submit}>Create / إضافة</Button><Button size="sm" variant="ghost" onClick={() => setQuickCreate(false)}>Cancel</Button></div>
    </Card>}
  </div>;
};
