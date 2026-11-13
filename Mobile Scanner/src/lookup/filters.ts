import type { DateRange } from '@shared/lookup-contracts';
export function localDate(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function monthRange(today = localDate()): DateRange {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
export function validDateRange(range: DateRange): boolean {
  return (
    [range.from, range.to].every(
      (date) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date
    ) && range.from <= range.to
  );
}
export function humanLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (s) => s.toUpperCase());
}
export function contactPhone(value: string): string {
  const digits = value.replace(/\D/g, '').replace(/^00/, '');
  return digits.startsWith('0')
    ? `961${digits.slice(1)}`
    : digits.length === 7 || digits.length === 8
      ? `961${digits}`
      : digits;
}
