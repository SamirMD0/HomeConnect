type DateFormat = 'dmy' | 'd-mon-y' | 'iso';

export function ValidUntil({ value, format }: { value?: string; format: DateFormat }) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  const text = format === 'iso'
    ? value.slice(0, 10)
    : format === 'd-mon-y'
      ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
      : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
  return <p className="pricing-card-valid-until">Valid until: <time dateTime={value.slice(0, 10)}>{text}</time></p>;
}
