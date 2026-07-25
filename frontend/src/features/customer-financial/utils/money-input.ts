const MONEY_INPUT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export function isValidMoneyInput(value: string): boolean {
  return MONEY_INPUT_PATTERN.test(value.trim()) && moneyToCents(value) > 0n;
}

export function sanitizeMoneyInput(value: string): string {
  return value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/^(\d+)(\.\d{0,2}).*$/, '$1$2');
}

export function canonicalMoneyInput(value: string): string {
  const trimmed = value.trim();
  if (!MONEY_INPUT_PATTERN.test(trimmed)) return trimmed;
  const [whole, cents = ''] = trimmed.split('.');
  return `${whole}.${cents.padEnd(2, '0').slice(0, 2)}`;
}

export function moneyToCents(value: string): bigint {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{0,2})?$/.test(trimmed)) return -1n;
  const [whole, cents = ''] = trimmed.split('.');
  return BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0').slice(0, 2));
}

export function centsToMoney(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = cents % 100n;
  return `${whole.toString()}.${fraction.toString().padStart(2, '0')}`;
}

export function isMoneyLessThanOrEqual(left: string, right: string): boolean {
  const leftCents = moneyToCents(left);
  const rightCents = moneyToCents(right);
  return leftCents >= 0n && rightCents >= 0n && leftCents <= rightCents;
}
