import { z } from 'zod';

const percentPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const atMost = (value:string, maximum:string) => {
  const [whole, fraction=''] = value.split('.');
  const [maxWhole, maxFraction=''] = maximum.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  if (normalizedWhole.length !== maxWhole.length) return normalizedWhole.length < maxWhole.length;
  if (normalizedWhole !== maxWhole) return normalizedWhole < maxWhole;
  return fraction.padEnd(3,'0') <= maxFraction.padEnd(3,'0');
};
const percent = (label:string, maximum='999.999') => z.string().trim().regex(percentPattern, `${label} must have up to 3 decimals`).refine((value)=>atMost(value,maximum),`${label} is too large`);

export const pricingPresetFormSchema = z.object({
  name:z.string().trim().min(1).max(200), productType:z.string().trim().max(120),
  expensePercent:percent('Expenses'), profitPercent:percent('Profit'), discountBufferPercent:percent('Discount buffer'),
  installmentMarkupPercent:percent('Installment markup'), downPaymentPercent:percent('Down payment','100.000'),
  defaultInstallmentMonths:z.string().trim().regex(/^\d+$/).refine((value)=>BigInt(value)>=1n&&BigInt(value)<=120n,'Months must be between 1 and 120'),
  calculationMode:z.enum(['COMPOUND','SIMPLE']), roundingMode:z.enum(['NONE','NEAREST_0_50','NEAREST_1','CEIL_1']),
  notes:z.string().trim().max(2000), sampleCost:z.string().trim().regex(moneyPattern).refine((value)=>value!=='0'&&!/^0\.0{1,2}$/.test(value),'Sample cost must be greater than zero'),
  reason:z.string().trim().min(5).max(1000), accountPassword:z.string(),
});
export const pricingActionSchema=z.object({reason:z.string().trim().min(5).max(1000),accountPassword:z.string().min(1)});
const productPricingShape={
  costPrice:z.string().trim().refine((value)=>value===''||(moneyPattern.test(value)&&value!=='0'&&!/^0\.0{1,2}$/.test(value)),'Cost must be greater than zero with up to 2 decimals'),
  pricingPresetId:z.string(), useCustomPricing:z.boolean(), installmentEnabled:z.boolean(), customExpensePercent:z.string(), customProfitPercent:z.string(), customDiscountBufferPercent:z.string(),
  customInstallmentMarkupPercent:z.string(), customDownPaymentPercent:z.string(), customInstallmentMonths:z.string(), customCalculationMode:z.enum(['COMPOUND','SIMPLE']),
};
const validateProductPricing=(value:z.infer<z.ZodObject<typeof productPricingShape>>,context:z.RefinementCtx)=>{
  if(!value.useCustomPricing)return;
  const fields: Array<'customExpensePercent'|'customProfitPercent'|'customDiscountBufferPercent'|'customInstallmentMarkupPercent'|'customDownPaymentPercent'> = [
    'customExpensePercent','customProfitPercent','customDiscountBufferPercent',
    ...(value.installmentEnabled?['customInstallmentMarkupPercent','customDownPaymentPercent'] as const:[]),
  ];
  for(const field of fields){const max=field==='customDownPaymentPercent'?'100.000':'999.999';if(!percentPattern.test(value[field])||!atMost(value[field],max))context.addIssue({code:'custom',path:[field],message:'Enter a valid percentage'});}
  if(value.installmentEnabled&&(!/^\d+$/.test(value.customInstallmentMonths)||BigInt(value.customInstallmentMonths)<1n||BigInt(value.customInstallmentMonths)>120n))context.addIssue({code:'custom',path:['customInstallmentMonths'],message:'Months must be between 1 and 120'});
};
export const productPricingConfigurationSchema=z.object(productPricingShape).superRefine(validateProductPricing);
export const productPricingPreviewOverridesSchema=z.object({
  previewInstallmentMonths:z.string().trim().refine((value)=>value===''||(/^\d+$/.test(value)&&BigInt(value)>=1n&&BigInt(value)<=120n),'Months must be between 1 and 120'),
  previewDownPaymentPercent:z.string().trim().refine((value)=>value===''||(percentPattern.test(value)&&atMost(value,'100.000')),'Down payment must be between 0 and 100'),
  previewInstallmentMarkupPercent:z.string().trim().refine((value)=>value===''||(percentPattern.test(value)&&atMost(value,'999.999')),'Enter a non-negative markup percentage'),
});
export const productPricingSchema=z.object({...productPricingShape,
  reason:z.string().trim().min(5).max(1000),accountPassword:z.string().min(1),
}).superRefine(validateProductPricing);
export type PricingPresetFormValues=z.infer<typeof pricingPresetFormSchema>;
export type ProductPricingFormValues=z.infer<typeof productPricingSchema>;
export type ProductPricingConfigurationFormValues=z.infer<typeof productPricingConfigurationSchema>;
