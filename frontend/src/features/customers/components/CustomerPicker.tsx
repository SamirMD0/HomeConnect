import React, { useMemo, useState } from 'react';
import { Plus, UserCheck } from 'lucide-react';
import { Button, Card, FormField, Input } from '../../../components/ui';
import { Customer } from '../api/customers.api';
import { useCreateCustomer } from '../hooks/useCustomers';
import { useCustomerSearch } from '../hooks/useCustomerSearch';
import { CustomerSearchInput } from './CustomerSearchInput';

type CustomerPickerProps = {
  value: string;
  onChange: (id: string) => void;
  locked?: boolean;
} | {
  selectedCustomer: Customer | null;
  onSelect: (customer: Customer) => void;
  locked?: boolean;
};

export const CustomerPicker: React.FC<CustomerPickerProps> = (props) => {
  const value = 'value' in props ? props.value : props.selectedCustomer?.id ?? '';
  const locked = props.locked ?? false;
  const [quickCreate, setQuickCreate] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', address: '' });
  const search = useCustomerSearch({ limit: 10 });
  const customers = search.customers;
  const createCustomer = useCreateCustomer();
  const list = useMemo(() => customers.data?.data ?? [], [customers.data?.data]);
  const selected = ('selectedCustomer' in props ? props.selectedCustomer : null) ?? list.find((customer) => customer.id === value);
  const duplicatePhone = useMemo(() => list.find((customer) => draft.phone && customer.phone.replace(/\s/g, '') === draft.phone.replace(/\s/g, '')), [draft.phone, list]);
  const select = (customer: Customer) => 'onChange' in props ? props.onChange(customer.id) : props.onSelect(customer);

  if (locked) return <Card dense><p className="text-xs font-medium text-slate-500">Customer / الزبون</p><p className="user-text font-semibold text-slate-900" dir="auto">{selected?.name ?? 'Selected customer / الزبون المختار'}</p>{selected && <p className="text-sm text-slate-500">{selected.phone}</p>}</Card>;

  const submit = async () => {
    const customer = await createCustomer.mutateAsync({ name: draft.name, phone: draft.phone, address: draft.address || undefined });
    select(customer); setQuickCreate(false);
  };

  return <div className="space-y-3">
    <FormField label="Search customer / البحث عن زبون">
      {() => <CustomerSearchInput value={search.query} onChange={search.setQuery} suggestions={search.suggestions.data} isLoading={customers.isFetching} resultCount={list.length} />}
    </FormField>
    <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
      {list.map((customer) => <Button key={customer.id} variant="ghost" className="h-auto w-full justify-start rounded-none px-3 py-2 text-left" onClick={() => select(customer)} icon={value === customer.id ? <UserCheck /> : undefined}><span><span className="user-text block font-medium" dir="auto">{customer.name}</span><span className="text-xs text-slate-500">{customer.phone}</span></span></Button>)}
      {!customers.isLoading && list.length === 0 && <p className="p-3 text-sm text-slate-500">No matching customers / لا يوجد زبائن مطابقون</p>}
    </div>
    {!quickCreate ? <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setQuickCreate(true)}>Quick create / إضافة سريعة</Button> : <Card dense className="space-y-3">
      <FormField label="Name / الاسم" required>{(field) => <Input {...field} userText value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />}</FormField>
      <FormField label="Phone / الهاتف" required error={duplicatePhone ? 'This phone already exists / رقم الهاتف موجود' : undefined}>{(field) => <Input {...field} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />}</FormField>
      {duplicatePhone && <Button variant="secondary" size="sm" onClick={() => { select(duplicatePhone); setQuickCreate(false); }}>Use {duplicatePhone.name}</Button>}
      <FormField label="Address / العنوان">{(field) => <Input {...field} userText value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} />}</FormField>
      <div className="flex gap-2"><Button size="sm" isLoading={createCustomer.isPending} disabled={!draft.name || !draft.phone || Boolean(duplicatePhone)} onClick={submit}>Create / إضافة</Button><Button size="sm" variant="ghost" onClick={() => setQuickCreate(false)}>Cancel</Button></div>
    </Card>}
  </div>;
};
