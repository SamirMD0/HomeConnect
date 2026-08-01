import React from 'react';
import { Link } from 'react-router-dom';
import { PricingCalculationResult, PricingPreview } from '../types/pricing.types';
import { pricingLabels, pricingUnavailableLabels } from '../utils/pricing-labels';

export const PricingPreviewCard:React.FC<{preview?:PricingPreview|PricingCalculationResult|null;loading?:boolean;stale?:boolean;costPrice?:string;percents?:{expensePercent:string;profitPercent:string;discountBufferPercent:string;downPaymentPercent:string}}>=({preview,loading,stale,costPrice,percents})=>{
  if(loading&&!preview)return <div className="h-52 animate-pulse rounded-lg bg-slate-100" aria-label="Loading pricing preview"/>;
  if(!preview)return <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">{pricingLabels.pricingPreview}</div>;
  if('pricingAvailable'in preview&&!preview.pricingAvailable){return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{pricingUnavailableLabels[preview.reason]}{preview.reason==='NO_DEFAULT_PRESET'&&<Link className="ml-2 font-semibold underline" to="/pricing-presets">{pricingLabels.createPreset}</Link>}</div>;}
  const result='installment'in preview?{...preview.breakdown,...preview.installment,cashPrice:preview.cashPrice,priceWithoutDiscountBuffer:preview.priceWithoutDiscountBuffer,internalPriceCode:preview.internalPriceCode}:preview;
  const inputs='inputs'in preview?preview.inputs:percents;
  return <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-opacity ${stale?'opacity-60':''}`} aria-label={pricingLabels.pricingPreview}>
    <h3 className="text-sm font-semibold text-slate-800">{pricingLabels.pricingPreview}</h3>
    <dl className="mt-3 space-y-2 text-sm">
      {costPrice&&<Line label={pricingLabels.costPrice} value={costPrice}/>}<Line label={`+ ${pricingLabels.expensePercent}${inputs?.expensePercent?` (${inputs.expensePercent}%)`:''}`} value={result.expensesAmount}/><Line label={`+ ${pricingLabels.profitPercent}${inputs?.profitPercent?` (${inputs.profitPercent}%)`:''}`} value={result.profitAmount}/><Line label={`+ ${pricingLabels.discountBufferPercent}${inputs?.discountBufferPercent?` (${inputs.discountBufferPercent}%)`:''}`} value={result.discountBufferAmount}/>
      <Line label="Price before buffer / السعر قبل هامش الخصم" value={result.priceWithoutDiscountBuffer}/>{result.internalPriceCode&&<TextLine label="Internal code / الرمز الداخلي" value={result.internalPriceCode}/>} 
      <div className="border-t border-slate-200 pt-2"><Line strong label={pricingLabels.cashPrice} value={result.cashPrice}/></div>
      <Line label={pricingLabels.installmentPrice} value={result.installmentPrice}/><Line label={pricingLabels.downPayment} value={result.downPayment}/><Line label={pricingLabels.remaining} value={result.remaining}/><Line label={`${pricingLabels.monthlyPayment} × ${result.installmentMonths}`} value={`${result.monthlyPayment}${result.lastInstallmentPayment!==result.monthlyPayment?` (last ${result.lastInstallmentPayment})`:''}`}/>
    </dl>
  </section>;
};
const Line:React.FC<{label:string;value:string;strong?:boolean}>=({label,value,strong})=><div className="flex items-start justify-between gap-4"><dt className={strong?'font-semibold text-slate-900':'text-slate-600'}>{label}</dt><dd dir="ltr" className={`shrink-0 tabular-nums ${strong?'text-lg font-bold text-emerald-700':'font-medium text-slate-900'}`}>${value}</dd></div>;
const TextLine:React.FC<{label:string;value:string}>=({label,value})=><div className="flex items-start justify-between gap-4"><dt className="text-slate-600">{label}</dt><dd className="font-mono font-bold text-slate-900">{value}</dd></div>;
