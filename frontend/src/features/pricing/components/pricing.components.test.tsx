import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { productPricingSchema, pricingPresetFormSchema } from '../schemas/pricing.schemas';
import { PricingPreset } from '../types/pricing.types';
import { pricingLabels } from '../utils/pricing-labels';
import { PricingPreviewCard } from './PricingPreviewCard';
import { PricingPresetsTable } from './PricingPresetsTable';

const preset: PricingPreset = {
  id:'1',name:'مكيف / AC',productType:'تبريد',expensePercent:'10.000',profitPercent:'7.000',discountBufferPercent:'7.000',
  installmentMarkupPercent:'20.000',downPaymentPercent:'40.000',defaultInstallmentMonths:3,calculationMode:'COMPOUND',roundingMode:'NONE',
  isDefault:true,isActive:true,isArchived:false,notes:null,archivedAt:null,archivedReason:null,createdAt:'2026-01-01',updatedAt:'2026-01-01',
};

describe('pricing frontend', () => {
  it('keeps bilingual labels and automatic direction on user text only', () => {
    const html=renderToStaticMarkup(<PricingPresetsTable items={[preset]} admin onEdit={()=>undefined} onAction={()=>undefined}/>);
    expect(pricingLabels.pricingPresets).toContain('صيغ التسعير');
    expect(html).toContain('dir="auto"');
    expect(html).toContain('dir="ltr"');
  });

  it('renders a reason-specific unavailable state', () => {
    const html=renderToStaticMarkup(<MemoryRouter><PricingPreviewCard preview={{pricingAvailable:false,reason:'NO_DEFAULT_PRESET'}}/></MemoryRouter>);
    expect(html).toContain('Select or create a pricing preset');
    expect(html).toContain('/pricing-presets');
  });

  it('validates percent ranges and complete custom pricing', () => {
    const form={name:'AC',productType:'',expensePercent:'10',profitPercent:'7',discountBufferPercent:'7',installmentMarkupPercent:'20',downPaymentPercent:'40',defaultInstallmentMonths:'3',calculationMode:'COMPOUND',roundingMode:'NONE',notes:'',sampleCost:'100.00',reason:'Create pricing formula',accountPassword:'secret'};
    expect(pricingPresetFormSchema.parse(form).expensePercent).toBe('10');
    expect(()=>pricingPresetFormSchema.parse({...form,downPaymentPercent:'100.001'})).toThrow();
    expect(()=>productPricingSchema.parse({costPrice:'100',pricingPresetId:'',useCustomPricing:true,customExpensePercent:'',customProfitPercent:'',customDiscountBufferPercent:'',customInstallmentMarkupPercent:'',customDownPaymentPercent:'',customInstallmentMonths:'3',customCalculationMode:'COMPOUND',reason:'Update pricing',accountPassword:'secret'})).toThrow();
  });
});
