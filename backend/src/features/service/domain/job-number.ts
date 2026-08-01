const JOB_NUMBER_PATTERN = /^SV-(\d{4})-(\d{4,})$/;

export function formatServiceJobNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new Error('Invalid service job year');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('Invalid service job sequence');
  return `SV-${year}-${String(sequence).padStart(4, '0')}`;
}

export function nextServiceJobNumber(year: number, latest?: string | null): string {
  if (!latest) return formatServiceJobNumber(year, 1);
  const match = JOB_NUMBER_PATTERN.exec(latest);
  if (!match || Number(match[1]) !== year) return formatServiceJobNumber(year, 1);
  return formatServiceJobNumber(year, Number(match[2]) + 1);
}
