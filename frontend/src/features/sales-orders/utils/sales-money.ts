export function toCents(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!match) return 0n;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

export function fromCents(value: bigint): string {
  const safe = value < 0n ? 0n : value;
  return `${safe / 100n}.${String(safe % 100n).padStart(2, '0')}`;
}

export function normalizeMoney(value: string): string {
  return fromCents(toCents(value));
}

export function addMoney(left: string, right: string): string {
  return fromCents(toCents(left) + toCents(right));
}

export function subtractMoney(left: string, right: string): string {
  return fromCents(toCents(left) - toCents(right));
}

export function scaleMoney(value: string, wholeQuantity: number): string {
  const quantity = Number.isInteger(wholeQuantity) && wholeQuantity > 0 ? BigInt(wholeQuantity) : 0n;
  return fromCents(toCents(value) * quantity);
}

export function compareMoney(left: string, right: string): -1 | 0 | 1 {
  const difference = toCents(left) - toCents(right);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function isPositiveMoney(value: string): boolean {
  return toCents(value) > 0n;
}
