import { createHash } from 'node:crypto';
import { ValidationError } from '../errors';

export function importFileHash(csvText: string): string {
  return createHash('sha256').update(csvText, 'utf8').digest('hex');
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
