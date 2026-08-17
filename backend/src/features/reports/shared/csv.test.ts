import { describe, expect, it } from 'vitest';
import { buildCsv, escapeCsvValue } from './csv';

describe('CSV builder', () => {
  it('preserves the BOM, doubled quotes, commas, Arabic text, and CRLF endings byte-for-byte', () => {
    const csv = buildCsv(
      ['Name', 'Notes', 'Amount'],
      [['علي، "بيروت"', 'line 1\nline 2', '150.00']]
    );
    const expected = '\uFEFFName,Notes,Amount\r\n"علي، ""بيروت""","line 1\nline 2",150.00\r\n';

    expect(Buffer.from(csv, 'utf8')).toEqual(Buffer.from(expected, 'utf8'));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('escapes only values containing a comma, quote, or line break', () => {
    expect(escapeCsvValue('plain')).toBe('plain');
    expect(escapeCsvValue('a,b')).toBe('"a,b"');
    expect(escapeCsvValue('a"b')).toBe('"a""b"');
    expect(escapeCsvValue(null)).toBe('');
  });
});
