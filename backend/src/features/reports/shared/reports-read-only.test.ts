import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPORTS_ROOT = join(process.cwd(), 'backend', 'src', 'features', 'reports');
const WRITE_PATTERNS = [
  /\.\s*(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/,
  /\$transaction\s*\(/,
  /runFinancialTransaction\s*\(/,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('Reports source boundary', () => {
  it('contains no database or financial write operation', () => {
    const violations = sourceFiles(REPORTS_ROOT).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return WRITE_PATTERNS.filter((pattern) => pattern.test(source)).map((pattern) => ({ file, pattern: pattern.source }));
    });

    expect(violations).toEqual([]);
  });
});
