import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button, FormField, Input, Textarea } from '../../../components/ui';
import { useBusinessSettings, useUpdateBusinessSettings } from '../hooks/useBusinessSettings';
import type { BusinessSettings, UpdateBusinessSettingsInput } from '../types/document.types';

export function BusinessSettingsPanel() {
  const settings = useBusinessSettings();
  if (settings.isLoading) return <section className="rounded-lg border bg-white p-6">Loading business settings…</section>;
  if (settings.isError || !settings.data) return <section className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">Business settings could not be loaded.</section>;
  return <BusinessSettingsForm key={settings.data.updatedAt ?? 'empty'} settings={settings.data} />;
}

export function BusinessSettingsForm({ settings }: { settings: BusinessSettings }) {
  const update = useUpdateBusinessSettings();
  const [form, setForm] = useState<UpdateBusinessSettingsInput>(() => ({
    shopName: settings.shopName,
    address: settings.address,
    phone: settings.phone,
    taxNumber: settings.taxNumber,
    logoUrl: settings.logoUrl,
    email: settings.email,
  }));
  const set = (field: keyof UpdateBusinessSettingsInput) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value || null }));
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await update.mutateAsync(form);
      toast.success('Business details saved / تم حفظ بيانات المتجر');
    } catch {
      toast.error('Unable to save business details / تعذر حفظ بيانات المتجر');
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Invoice business details / بيانات المتجر على الفاتورة</h2>
        <p className="mt-1 text-sm text-slate-500">Blank fields print clear placeholders until they are configured.</p>
      </div>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={save}>
        <FormField label="Shop name / اسم المتجر">{(field) => <Input {...field} userText value={form.shopName ?? ''} onChange={set('shopName')} placeholder="Home Connect" />}</FormField>
        <FormField label="Phone / الهاتف">{(field) => <Input {...field} value={form.phone ?? ''} onChange={set('phone')} placeholder="01 234 567" />}</FormField>
        <FormField label="VAT / tax number / الرقم الضريبي">{(field) => <Input {...field} value={form.taxNumber ?? ''} onChange={set('taxNumber')} placeholder="VAT-…" />}</FormField>
        <FormField label="Email / البريد الإلكتروني">{(field) => <Input {...field} type="email" value={form.email ?? ''} onChange={set('email')} placeholder="shop@example.com" />}</FormField>
        <FormField className="sm:col-span-2" label="Address / العنوان">{(field) => <Textarea {...field} userText value={form.address ?? ''} onChange={set('address')} />}</FormField>
        <FormField className="sm:col-span-2" label="Logo URL or image data URL / رابط الشعار">{(field) => <Input {...field} value={form.logoUrl ?? ''} onChange={set('logoUrl')} placeholder="https://…/logo.png" />}</FormField>
        <div className="sm:col-span-2"><Button type="submit" isLoading={update.isPending}>Save business details / حفظ بيانات المتجر</Button></div>
      </form>
    </section>
  );
}
