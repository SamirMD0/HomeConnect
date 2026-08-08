import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { normalizeScanCode } from './scan-code';

/** Resolved from the repo root, which is where vitest runs from. */
const CONTRACT_PATH = path.resolve(process.cwd(), 'backend/src/lib/scan-code-cases.json');

/**
 * `scan-code-cases.json` is the shared contract. The browser mirror in
 * frontend/src/features/scanner/utils is asserted against the very same file,
 * which is what allows the two implementations to be separate modules without
 * drifting apart — TypeScript project references stop either side from
 * importing the other, so the agreement is pinned by data instead.
 */
interface ContractCase {
  raw?: string;
  repeat?: [string, number];
  expected: { ok: boolean; code?: string; repeatCode?: [string, number]; reason?: string };
}

const { cases } = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8')) as { cases: ContractCase[] };

const inputOf = (entry: ContractCase) => entry.raw ?? entry.repeat![0].repeat(entry.repeat![1]);
const expectedOf = (entry: ContractCase) => entry.expected.ok
  ? { ok: true, code: entry.expected.repeatCode ? entry.expected.repeatCode[0].repeat(entry.expected.repeatCode[1]) : entry.expected.code }
  : { ok: false, reason: entry.expected.reason };

describe('scan code contract (server)', () => {
  it('covers every case in the shared fixture', () => {
    expect(cases.length).toBeGreaterThan(20);
  });

  for (const entry of cases) {
    const input = inputOf(entry);
    const label = input.length > 40 ? `${input.length} characters` : JSON.stringify(input);
    it(`normalizes ${label}`, () => {
      expect(normalizeScanCode(input)).toEqual(expectedOf(entry));
    });
  }
});
