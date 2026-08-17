export type CsvValue = string | number | boolean | null | undefined;

export function escapeCsvValue(value: CsvValue): string {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Excel needs the BOM to detect Arabic UTF-8 text correctly. */
export function buildCsv(headers: readonly CsvValue[], rows: ReadonlyArray<readonly CsvValue[]>): string {
  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\r\n')}\r\n`;
}
