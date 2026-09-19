import { Decimal } from '@prisma/client/runtime/library';

export const INTERNAL_PRICE_CODE_PREFIX = 'P';

/** A staff memory aid only. It is derived, non-unique, and never an identifier. */
export function formatInternalPriceCode(value: Decimal): string | null {
  if (value.lessThanOrEqualTo(0)) return null;
  return `${INTERNAL_PRICE_CODE_PREFIX}${value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0)}`;
}

export type LabelSecretEncodingMode = 'STAGED_DISCOUNT' | 'PRICE' | 'DISCOUNT_PERCENTAGE' | 'OFFSET_PRICE' | 'DIGIT_MAP_PRICE';

export interface LabelSecretEncodingRule {
  mode: LabelSecretEncodingMode;
  prefix: string;
  suffix: string;
  offset: { toString(): string };
  digitMap: string | null;
  decimalPlaces: number;
}

export interface LabelSecretEncodingOptions {
  /** Admin-selected discount steps for this print run. Omit for automatic steps. */
  discountStages?: number[];
  /** Injectable only so automatic-code tests remain deterministic. */
  random?: () => number;
}

export class UnsafeDiscountStagesError extends Error {
  constructor(message: string) { super(message); this.name = 'UnsafeDiscountStagesError'; }
}

/**
 * Produces a deterministic, display-only staff aid. This is obfuscation, not
 * encryption, and the result is never used as a product or barcode identity.
 */
export function encodeLabelSecretValue(publicPrice: Decimal, hiddenPrice: Decimal, rule: LabelSecretEncodingRule, options: LabelSecretEncodingOptions = {}): string {
  const places = Math.max(0, Math.min(2, rule.decimalPlaces));
  let payload: string;
  switch (rule.mode) {
    case 'STAGED_DISCOUNT':
      return encodeStagedDiscount(publicPrice, hiddenPrice, rule, options);
    case 'DISCOUNT_PERCENTAGE':
      payload = publicPrice.minus(hiddenPrice).dividedBy(publicPrice).times(100).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
      break;
    case 'OFFSET_PRICE':
      { const transformed = hiddenPrice.plus(new Decimal(rule.offset.toString()));
        if (transformed.lessThanOrEqualTo(0)) throw new Error('Offset encoding must remain positive');
        payload = transformed.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places); }
      break;
    case 'DIGIT_MAP_PRICE': {
      const map = rule.digitMap ?? '';
      if (map.length !== 10 || new Set(map).size !== 10) throw new Error('Digit-map encoding requires ten unique characters');
      payload = hiddenPrice.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0).replace(/\d/g, (digit) => map[Number(digit)]);
      break;
    }
    case 'PRICE':
      payload = hiddenPrice.toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toFixed(places);
      break;
    default:
      throw new Error('Unsupported label-secret encoding mode');
  }
  return `${rule.prefix}${payload}${rule.suffix}`;
}

/**
 * Builds a staff instruction such as `7K2Q1WZ`.
 *
 * The numbers are real percentage steps. Their sum never exceeds the direct
 * public-to-hidden discount, so applying them to the original public price is
 * safe; applying them sequentially is slightly more conservative. Letters are
 * random camouflage and have no pricing meaning.
 */
function encodeStagedDiscount(publicPrice: Decimal, hiddenPrice: Decimal, rule: LabelSecretEncodingRule, options: LabelSecretEncodingOptions): string {
  const maximum = publicPrice.minus(hiddenPrice).dividedBy(publicPrice).times(100);
  if (!maximum.isPositive()) throw new UnsafeDiscountStagesError('The maximum discount must be positive');
  const stages = options.discountStages ?? automaticDiscountStages(maximum, options.random);
  validateDiscountStages(stages, maximum);

  const letters = randomLetters(stages.length + 1, options.random);
  const body = stages.map((stage, index) => `${stage}${letters[index]}`).join('') + letters.at(-1);
  return `${rule.prefix}${body}${rule.suffix}`;
}

export function automaticDiscountStages(maximum: Decimal, random: () => number = Math.random): number[] {
  let remaining = maximum.floor().toNumber();
  if (remaining < 1) {
    const fractional = maximum.toDecimalPlaces(1, Decimal.ROUND_FLOOR).toNumber();
    if (fractional <= 0) throw new UnsafeDiscountStagesError('The maximum discount is too small to encode');
    return [fractional];
  }

  const stages: number[] = [];
  while (remaining > 0) {
    const keepForAnotherStage = stages.length === 0 && remaining > 1 ? 1 : 0;
    const largest = Math.min(7, remaining - keepForAnotherStage);
    const step = 1 + Math.floor(clampRandom(random()) * largest);
    stages.push(step);
    remaining -= step;
    if (stages.length >= 12 && remaining > 0) {
      stages[stages.length - 1] += remaining;
      remaining = 0;
    }
  }
  return stages;
}

function validateDiscountStages(stages: number[], maximum: Decimal) {
  if (!stages.length || stages.length > 12 || stages.some((stage) => !Number.isInteger(stage) || stage < 1 || stage > 99)) {
    throw new UnsafeDiscountStagesError('Use 1 to 12 whole-number discount steps between 1% and 99%');
  }
  const total = stages.reduce((sum, stage) => sum + stage, 0);
  if (new Decimal(total).greaterThan(maximum)) {
    throw new UnsafeDiscountStagesError(`Discount steps total ${total}% but the safe maximum is ${maximum.toDecimalPlaces(2).toFixed(2)}%`);
  }
}

function randomLetters(count: number, random: () => number = Math.random): string[] {
  const available = [...'ABCDEFGHJKLMNPQRSTUVWXYZ'];
  const selected: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const position = Math.floor(clampRandom(random()) * available.length);
    selected.push(available.splice(position, 1)[0]);
  }
  return selected;
}

const clampRandom = (value: number) => Math.max(0, Math.min(0.999999999999, value));

/** Display-only employee aid. The canonical SKU and barcode remain unchanged. */
export function formatStaffLabelCode(sku: string, encodedCode: string): string {
  const displayCode = /^P\d+$/.test(encodedCode) ? `K${encodedCode.slice(1)}Z` : encodedCode;
  return `${sku}-${displayCode}`;
}
