import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { pricingKeys } from '../../pricing/hooks/usePricingPresets';
import { PricingCalculationResult, PricingPreset } from '../../pricing/types/pricing.types';
import {
  buildProductPricingCalculationInput,
  emptyProductFormPricing,
  ProductFormPricingPanel,
  ProductFormPricingValues,
} from './ProductFormPricingPanel';

const preset: PricingPreset = {
  id: '33333333-3333-4333-8333-333333333333', name: 'Standard AC', productType: 'AC',
  expensePercent: '10', profitPercent: '7', discountBufferPercent: '7',
  installmentMarkupPercent: '20', downPaymentPercent: '40', defaultInstallmentMonths: 3,
  calculationMode: 'COMPOUND', roundingMode: 'NONE', isDefault: true, isActive: true,
  isArchived: false, notes: null, archivedAt: null, archivedReason: null,
  createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z',
};
const result: PricingCalculationResult = {
  cashPrice: '377.82', installmentPrice: '453.38', downPayment: '181.35', remaining: '272.03',
  monthlyPayment: '90.67', lastInstallmentPayment: '90.69', installmentMonths: 3,
  expensesAmount: '30.00', profitAmount: '23.10', discountBufferAmount: '24.72',
};

function renderPanel(value: ProductFormPricingValues, preview = result) {
  const client = new QueryClient();
  client.setQueryData(pricingKeys.list({ isActive: true, pageSize: 100, search: undefined }), {
    items: [preset], pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
  });
  const input = buildProductPricingCalculationInput(value, preset);
  if (input) client.setQueryData(['pricing', 'calculate', input], preview);
  return renderToStaticMarkup(
    <MemoryRouter><QueryClientProvider client={client}>
      <ProductFormPricingPanel value={value} onChange={() => undefined} />
    </QueryClientProvider></MemoryRouter>
  );
}

describe('product form pricing integration', () => {
  it('shows the active preset selector and bilingual product pricing fields', () => {
    const html = renderPanel(emptyProductFormPricing);
    expect(html).toContain('Pricing Preset / صيغة التسعير');
    expect(html).toContain('Real Cost Price / السعر الحقيقي');
    expect(html).toContain('Use Custom Pricing / تسعير مخصص');
    expect(html).toContain('Preview Installment Months / عدد أشهر التقسيط للمعاينة');
    expect(html).not.toContain('Save the product, then edit it to configure cost and pricing');
  });

  it('shows a pricing preview when cost and preset are supplied', () => {
    const html = renderPanel({ ...emptyProductFormPricing, costPrice: '300.00', pricingPresetId: preset.id });
    expect(html).toContain('Cash Price / السعر النقدي');
    expect(html).toContain('$377.82');
    expect(html).toContain('Monthly Payment / القسط الشهري');
  });

  it('uses a free-form month override and renders the updated monthly payment', () => {
    const value = { ...emptyProductFormPricing, costPrice: '300.00', pricingPresetId: preset.id, previewInstallmentMonths: '6' };
    expect(buildProductPricingCalculationInput(value, preset)?.installmentMonths).toBe(6);
    const html = renderPanel(value, { ...result, installmentMonths: 6, monthlyPayment: '45.33', lastInstallmentPayment: '45.38' });
    expect(html).toContain('× 6');
    expect(html).toContain('$45.33');
  });
});
