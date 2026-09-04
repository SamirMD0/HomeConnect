import { NextFunction, Request, Response } from 'express';
import { PricingPresetsRepository } from '../presets/pricing-presets.repository';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import { calculatePricing } from '../domain/pricing-calculator';
import { parsePricingPercent } from '../domain/pricing-percent';
import { presetConfig } from './pricing-resolution';
import { PricingCalculateInput } from './pricing-calculator.validator';
import { Decimal } from '@prisma/client/runtime/library';
import { Currency } from '@prisma/client';
import { TaxRepository } from '../../tax/tax.repository';
import { businessDateToPrisma, todayInBusinessTimezone } from '../../financial/domain/business-date';
import { moneyToApiString } from '../../financial/domain/money';
import { presentExVatPrice } from '../../tax/domain/vat';

export class PricingCalculatorController {
  static async calculate(req: Request<unknown, unknown, PricingCalculateInput>, res: Response, next: NextFunction) {
    try {
      const input = req.body;
      const overrides = input.overrides ?? {};
      const preset = input.presetId ? await PricingPresetsRepository.findById(input.presetId) : await PricingPresetsRepository.findActiveDefault();
      if (input.presetId && !preset) throw new NotFoundError('Pricing preset not found');
      if (input.presetId && preset && (!preset.isActive || preset.archivedAt)) {
        throw new ValidationError('Pricing preset must be active', { field: 'presetId' });
      }
      const base = preset ? presetConfig(preset, input.installmentMonths) : completeOverrideConfig(overrides, input.installmentMonths);
      const config = {
        ...base,
        expensePercent: overrides.expensePercent === undefined ? base.expensePercent : parsePricingPercent(overrides.expensePercent),
        profitPercent: overrides.profitPercent === undefined ? base.profitPercent : parsePricingPercent(overrides.profitPercent),
        discountBufferPercent: overrides.discountBufferPercent === undefined ? base.discountBufferPercent : parsePricingPercent(overrides.discountBufferPercent),
        installmentMarkupPercent: overrides.installmentMarkupPercent === undefined ? base.installmentMarkupPercent : parsePricingPercent(overrides.installmentMarkupPercent),
        downPaymentPercent: overrides.downPaymentPercent === undefined ? base.downPaymentPercent : parsePricingPercent(overrides.downPaymentPercent, new Decimal(100)),
        calculationMode: overrides.calculationMode ?? base.calculationMode,
        roundingMode: overrides.roundingMode ?? base.roundingMode,
      };
      const result = calculatePricing(new Decimal(input.costPrice), config);
      const taxProfile = await TaxRepository.findEffectiveProfile(null, businessDateToPrisma(todayInBusinessTimezone()));
      const presentation = taxProfile ? presentExVatPrice(result.cashPrice, taxProfile.taxRate.ratePercent, Currency.USD) : null;
      res.json({
        success: true,
        data: {
          ...result,
          ...(presentation ? {
            cashPriceExVat: moneyToApiString(presentation.priceExVat),
            vatAmount: moneyToApiString(presentation.vatAmount),
            cashPriceIncVat: moneyToApiString(presentation.priceIncVat),
            taxRatePercent: taxProfile!.taxRate.ratePercent.toFixed(3),
            taxCode: taxProfile!.code,
          } : {}),
        },
      });
    } catch (error) { next(error); }
  }
}

function completeOverrideConfig(overrides: NonNullable<PricingCalculateInput['overrides']>, installmentMonths?: number) {
  const required = ['expensePercent','profitPercent','discountBufferPercent','installmentMarkupPercent','downPaymentPercent','calculationMode','roundingMode'] as const;
  const missing = required.find((field) => overrides[field] === undefined);
  if (missing || installmentMonths === undefined) throw new ValidationError('A preset or complete overrides are required', { field: missing ?? 'installmentMonths' });
  return {
    expensePercent: parsePricingPercent(overrides.expensePercent!), profitPercent: parsePricingPercent(overrides.profitPercent!),
    discountBufferPercent: parsePricingPercent(overrides.discountBufferPercent!), installmentMarkupPercent: parsePricingPercent(overrides.installmentMarkupPercent!),
    downPaymentPercent: parsePricingPercent(overrides.downPaymentPercent!, new Decimal(100)), installmentMonths,
    calculationMode: overrides.calculationMode!, roundingMode: overrides.roundingMode!,
  };
}
