import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { serviceJobParams } from '../api/service-jobs.api';
import { ProductLabel } from '../../products/components/ProductLabel';
import { ProductPicker } from '../../products/components/ProductPicker';
import { CreateServiceJobDialog } from './CreateServiceJobDialog';
import { ServiceJobStatusChip } from './ServiceJobStatusChip';

describe('service frontend components', () => {
  it('renders readable status text and printable label values', () => {
    const status = renderToStaticMarkup(<ServiceJobStatusChip status="READY_FOR_PICKUP" />);
    const label = renderToStaticMarkup(<ProductLabel product={{ id: 'p1', name: 'براد', model: 'RT28', brand: 'Samsung', sku: 'HC-000001', barcodeValue: '8801643123456', barcodeSource: 'MANUFACTURER', internalPriceCode: null }} />);
    expect(status).toContain('Ready for Pickup / جاهز للاستلام');
    expect(label).toContain('براد'); expect(label).toContain('RT28'); expect(label).not.toContain('Price');
    expect(label).toContain('Model:');
    expect(label).not.toContain('dir=');
    expect(label).toContain('aria-label="Barcode 8801643123456"');
  });

  it('renders bilingual product fields with automatic direction for user text', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ProductPicker
          value={{ productId: null, manualProductName: 'غسالة', manualProductModel: 'M1', manualProductBrand: '', manualProductNotes: '' }}
          onChange={() => undefined}
        />
      </QueryClientProvider>
    );

    expect(html).toContain('Product / المنتج');
    expect(html).toContain('Product Name / اسم المنتج');
    expect(html).toContain('Model / الموديل');
    expect(html.match(/dir="auto"/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('renders bilingual labels in the service-job form', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <CreateServiceJobDialog isOpen onClose={() => undefined} customerId="customer-1" />
      </QueryClientProvider>
    );

    expect(html).toContain('New Service Job / طلب صيانة جديد');
    expect(html).toContain('Request Type / نوع الطلب');
    expect(html).toContain('Issue Description / وصف العطل');
    expect(html).toContain('Warranty / الكفالة');
  });

  it('serializes multi-value filters without unstable array params', () => {
    expect(serviceJobParams({ status: ['RECEIVED','WAITING_FOR_PART'], page: 2 })).toEqual({ status: 'RECEIVED,WAITING_FOR_PART', page: 2 });
  });
});
