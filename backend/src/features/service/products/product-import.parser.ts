import { createHash } from 'node:crypto';
import { ValidationError } from '../../../lib/errors';

export const MAX_PRODUCT_IMPORT_ROWS = 500;
export const MAX_PRODUCT_IMPORT_BYTES = 750_000;

export interface ParsedProductImportRow {
  rowNumber: number;
  family: string;
  externalCode: string;
  description: string;
  quantity: number;
  costUsd: string | null;
  issues: string[];
}

export function normalizeExternalCode(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleUpperCase('en-US');
}

export function importFileHash(csvText: string): string {
  return createHash('sha256').update(csvText, 'utf8').digest('hex');
}

export function parseProductInventoryCsv(csvText: string): ParsedProductImportRow[] {
  if (Buffer.byteLength(csvText, 'utf8') > MAX_PRODUCT_IMPORT_BYTES) {
    throw new ValidationError('CSV file cannot exceed 750 KB');
  }
  const records = parseCsvRecords(csvText.replace(/^\uFEFF/, ''));
  const rows = records.flatMap((record, index) => {
    const parsed = parseReportRecord(record, index + 1);
    return parsed ? [parsed] : [];
  });
  if (rows.length === 0) throw new ValidationError('No product rows were found in the CSV');
  if (rows.length > MAX_PRODUCT_IMPORT_ROWS) {
    throw new ValidationError(`A product import cannot exceed ${MAX_PRODUCT_IMPORT_ROWS} rows`);
  }
  return rows;
}

function parseReportRecord(record: string[], rowNumber: number): ParsedProductImportRow | null {
  const familyLabel = findCell(record, 'Family:');
  const codeLabel = findCell(record, 'Code');
  const descriptionLabel = findCell(record, 'Description');
  const quantityLabel = findCell(record, 'Qty', codeLabel + 1);
  const costLabel = findCell(record, 'Cost USD');
  const totalLabel = findCell(record, 'Total', costLabel + 1);
  if ([familyLabel, codeLabel, descriptionLabel, quantityLabel, costLabel, totalLabel].some((index) => index < 0)) return null;

  // This accounting report repeats its column labels on every physical row;
  // the five product values immediately follow the final `Total` label.
  const valueStart = totalLabel + 1;
  const family = record[familyLabel + 1]?.trim() ?? '';
  const externalCode = record[valueStart]?.trim() ?? '';
  const description = record[valueStart + 1]?.trim() ?? '';
  const rawQuantity = record[valueStart + 2]?.trim() ?? '';
  const rawCost = record[valueStart + 3]?.trim() ?? '';
  const issues: string[] = [];
  const quantityNumber = Number(rawQuantity);
  const costNumber = Number(rawCost);

  if (!externalCode) issues.push('Product code is required');
  if (externalCode.length > 120) issues.push('Product code cannot exceed 120 characters');
  if (!description) issues.push('Product description is required');
  if (description.length > 200) issues.push('Product description cannot exceed 200 characters');
  if (!family) issues.push('Family is required');
  if (!Number.isInteger(quantityNumber) || quantityNumber < 0 || quantityNumber > 100_000) {
    issues.push('Quantity must be a whole number between 0 and 100,000');
  }
  if (rawCost && (!Number.isFinite(costNumber) || costNumber < 0)) issues.push('Cost USD must be a non-negative number');

  return {
    rowNumber,
    family,
    externalCode,
    description,
    quantity: Number.isInteger(quantityNumber) ? quantityNumber : 0,
    // A zero cost in this report means "not supplied", not a free product.
    costUsd: Number.isFinite(costNumber) && costNumber > 0 ? costNumber.toFixed(2) : null,
    issues,
  };
}

function findCell(record: string[], value: string, after = 0): number {
  return record.findIndex((cell, index) => index >= after && cell.trim().toLocaleLowerCase('en-US') === value.toLocaleLowerCase('en-US'));
}

/** RFC-4180 compatible enough for quoted commas, doubled quotes, and CRLF/LF. */
export function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"' && field.length === 0) { quoted = true; continue; }
    if (character === ',') { record.push(field); field = ''; continue; }
    if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      record.push(field); field = '';
      if (record.some((cell) => cell.length > 0)) records.push(record);
      record = [];
      continue;
    }
    field += character;
  }
  if (quoted) throw new ValidationError('CSV contains an unterminated quoted value');
  record.push(field);
  if (record.some((cell) => cell.length > 0)) records.push(record);
  return records;
}
