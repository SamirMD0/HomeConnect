import { parseCsvRecords } from '../../lib/csv-import';
import { ValidationError } from '../../lib/errors';
import { normalizePhoneTerm } from '../../lib/search-normalize';
import { createCustomerSchema } from '../../validators/customers.validator';
import { parseMoney } from '../financial/domain/money';
import { parseBusinessDate } from '../financial/domain/business-date';

export const MAX_CUSTOMER_IMPORT_BYTES = 750_000;
export const MAX_CUSTOMER_IMPORT_ROWS = 2_000;
export const customerImportFields = [
  'name',
  'phone',
  'address',
  'notes',
  'creditLimit',
  'openingBalance',
  'currency',
  'dueDate',
  'isActive',
] as const;
export type CustomerImportField = (typeof customerImportFields)[number];
export type ColumnMapping = Partial<Record<CustomerImportField, number | null>>;
export interface CsvDocument {
  headers: string[];
  records: string[][];
  snapshot?: Record<number, string>;
}
const aliases: Record<CustomerImportField, string[]> = {
  name: ['name', 'customer name', 'الاسم'],
  phone: ['phone', 'phone number', 'الهاتف'],
  address: ['address', 'العنوان'],
  notes: ['notes', 'ملاحظات'],
  creditLimit: ['credit limit', 'سقف الدين'],
  openingBalance: ['opening balance', 'opening balance amount', 'رصيد افتتاحي'],
  currency: ['currency', 'opening balance currency', 'العملة'],
  dueDate: ['due date', 'opening balance due date', 'تاريخ الاستحقاق'],
  isActive: ['active', 'نشط'],
};
export function detectColumnMapping(headers: string[]): ColumnMapping {
  return Object.fromEntries(
    customerImportFields
      .map((field) => [
        field,
        headers.findIndex((header) => aliases[field].includes(header.trim().toLowerCase())),
      ])
      .filter(([, index]) => Number(index) >= 0)
  );
}
export function parseCustomerCsv(csvText: string): CsvDocument {
  if (Buffer.byteLength(csvText, 'utf8') > MAX_CUSTOMER_IMPORT_BYTES)
    throw new ValidationError('CSV file cannot exceed 750 KB');
  const [headers, ...records] = parseCsvRecords(csvText.replace(/^\uFEFF/, ''));
  if (!headers || !records.length)
    throw new ValidationError('No customer rows were found in the CSV');
  if (records.length > MAX_CUSTOMER_IMPORT_ROWS)
    throw new ValidationError('A customer import cannot exceed 2000 rows');
  return { headers, records };
}
export function mapCustomerRows(document: CsvDocument, mapping: ColumnMapping) {
  const indices = Object.values(mapping).filter((index): index is number => index != null);
  if (
    new Set(indices).size !== indices.length ||
    indices.some((index) => index >= document.headers.length)
  )
    throw new ValidationError('Each mapped CSV column must exist and may be used only once');
  return document.records.map((cells, index) => {
    const cell = (field: CustomerImportField) =>
      mapping[field] == null ? '' : (cells[mapping[field]!] ?? '').trim();
    const issues: string[] = [];
    const data: {
      name: string;
      phone: string;
      address?: string;
      notes?: string;
      creditLimit?: string | null;
    } = { name: cell('name'), phone: cell('phone') };
    for (const field of ['address', 'notes'] as const)
      if (mapping[field] != null) data[field] = cell(field);
    if (cell('creditLimit')) data.creditLimit = cell('creditLimit');
    const validated = createCustomerSchema.safeParse(data);
    if (!validated.success) issues.push(...validated.error.issues.map((issue) => issue.message));
    const phoneKey = normalizePhoneTerm(data.phone);
    if (!phoneKey) issues.push('Phone must contain digits');
    const currency = cell('currency').toUpperCase() || 'USD';
    if (currency !== 'USD' && currency !== 'LBP') issues.push('Currency must be USD or LBP');
    const openingBalance = cell('openingBalance') || '0';
    try {
      if (parseMoney(openingBalance, currency === 'LBP' ? 'LBP' : 'USD').isNegative())
        issues.push('Opening balance cannot be negative');
    } catch (error) {
      issues.push(error instanceof Error ? error.message : 'Invalid opening balance');
    }
    const dueDate = cell('dueDate') || null;
    try {
      if (dueDate) parseBusinessDate(dueDate);
    } catch {
      issues.push('Due date must be a valid YYYY-MM-DD date');
    }
    const active = cell('isActive').toLowerCase();
    const yes = ['', 'true', '1', 'yes', 'نعم', 'نشط'];
    const no = ['false', '0', 'no', 'لا', 'غير نشط'];
    if (!yes.includes(active) && !no.includes(active))
      issues.push('Active must be true/false, yes/no or 1/0');
    if (cells.length > document.headers.length) issues.push('Row has more values than the header');
    return {
      rowNumber: index + 2,
      ...data,
      ...(validated.success ? validated.data : {}),
      phoneKey,
      currency: currency as 'USD' | 'LBP',
      openingBalance,
      dueDate,
      isActive: !no.includes(active),
      issues,
    };
  });
}
export type ParsedCustomerImportRow = ReturnType<typeof mapCustomerRows>[number];
