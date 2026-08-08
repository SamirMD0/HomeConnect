import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { normalizeScanCode } from './scan-code';

/** Resolved from the repo root, which is where vitest runs from. */
const CONTRACT_PATH = path.resolve(process.cwd(), 'backend/src/lib/scan-code-cases.json');

/**
 * The browser mirror is held to the same contract file as the server
 * implementation in backend/src/lib. Read at runtime rather than imported,
 * because the TypeScript project references keep frontend and backend programs
 * apart — this is the seam that proves the two copies still agree.
 *
 * If this fails, the mirror has drifted: fix the copy, do not edit the fixture
 * unless the backend behaviour genuinely changed.
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

describe('scan code contract (browser mirror)', () => {
  for (const entry of cases) {
    const input = inputOf(entry);
    const label = input.length > 40 ? `${input.length} characters` : JSON.stringify(input);
    it(`normalizes ${label}`, () => {
      expect(normalizeScanCode(input)).toEqual(expectedOf(entry));
    });
  }
});
