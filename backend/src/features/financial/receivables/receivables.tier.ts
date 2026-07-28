import { ReceivableTier } from './receivables.types';

/**
 * Tier order, worst last. The index doubles as the sort rank used by the
 * "standing" sort, so a higher rank always means a worse paying customer.
 */
export const RECEIVABLE_TIER_ORDER: ReceivableTier[] = [
  'NO_ACTIVITY',
  'CURRENT',
  'WATCH',
  'LATE',
  'SEVERE',
  'CRITICAL',
];

/** Tiers that can be reached by escalating/de-escalating an overdue customer. */
const OVERDUE_TIER_ORDER: ReceivableTier[] = ['WATCH', 'LATE', 'SEVERE', 'CRITICAL'];

const LOW_PAID_RATIO_PERCENT = 25;
const HIGH_PAID_RATIO_PERCENT = 75;

export interface ReceivableTierInput {
  /** Countable obligations: one per debt, one per non-cancelled installment. */
  billsTotal: number;
  overdueItemCount: number;
  /** Days between the oldest unpaid overdue due date and the business date. */
  maxOverdueDays: number;
  /** Integer 0-100. */
  paidRatioPercent: number;
  /** Non-voided payments the customer has ever made. */
  paymentCount: number;
}

export interface ReceivableTierResult {
  tier: ReceivableTier;
  tierReason: string;
  rank: number;
}

export function receivableTierRank(tier: ReceivableTier): number {
  return RECEIVABLE_TIER_ORDER.indexOf(tier);
}

export function determineReceivableTier(input: ReceivableTierInput): ReceivableTierResult {
  if (input.billsTotal === 0) {
    return result('NO_ACTIVITY', 'No debts or installment plans recorded');
  }

  if (input.overdueItemCount === 0) {
    return result('CURRENT', `Nothing overdue · ${input.paidRatioPercent}% paid`);
  }

  if (input.paymentCount === 0) {
    return result('CRITICAL', `${lateLabel(input.maxOverdueDays)} · never paid anything`);
  }

  const baseTier = baseTierForOverdueDays(input.maxOverdueDays);
  let tier = baseTier;
  let adjustment = '';

  if (input.paidRatioPercent < LOW_PAID_RATIO_PERCENT) {
    tier = shiftOverdueTier(baseTier, 1);
    adjustment = ' · escalated, under 25% paid';
  } else if (input.paidRatioPercent >= HIGH_PAID_RATIO_PERCENT) {
    tier = shiftOverdueTier(baseTier, -1);
    adjustment = ' · eased, over 75% paid';
  }

  return result(
    tier,
    `${lateLabel(input.maxOverdueDays)} · ${input.paidRatioPercent}% paid${adjustment}`
  );
}

function baseTierForOverdueDays(maxOverdueDays: number): ReceivableTier {
  if (maxOverdueDays > 90) return 'CRITICAL';
  if (maxOverdueDays > 60) return 'SEVERE';
  if (maxOverdueDays > 30) return 'LATE';
  return 'WATCH';
}

/**
 * Moves within the overdue band only: an overdue customer never becomes
 * CURRENT, and never escalates past CRITICAL.
 */
function shiftOverdueTier(tier: ReceivableTier, offset: number): ReceivableTier {
  const currentIndex = OVERDUE_TIER_ORDER.indexOf(tier);
  if (currentIndex === -1) return tier;
  const nextIndex = Math.min(Math.max(currentIndex + offset, 0), OVERDUE_TIER_ORDER.length - 1);
  return OVERDUE_TIER_ORDER[nextIndex];
}

function lateLabel(maxOverdueDays: number): string {
  if (maxOverdueDays <= 0) return 'Overdue today';
  return `${maxOverdueDays} ${maxOverdueDays === 1 ? 'day' : 'days'} late`;
}

function result(tier: ReceivableTier, tierReason: string): ReceivableTierResult {
  return {
    tier,
    tierReason,
    rank: receivableTierRank(tier),
  };
}
