import { Decimal } from '@prisma/client/runtime/library';

/**
 * Bound checks for decimal strings that never throw.
 *
 * Zod 4 runs every check on a schema so it can report all issues at once, which
 * means a `.refine()` still fires after an earlier `.regex()` has already failed.
 * Calling `new Decimal('')` inside such a refine raises DecimalError, and because
 * the throw escapes the schema, even `safeParse` blows up and the request turns
 * into a 500 instead of a 400. Parsing defensively keeps the refine total, so
 * malformed input falls through to the regex message it should have had.
 */
function parse(value: string): Decimal | null {
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

export function isDecimalAtMost(value: string, maximum: Decimal.Value): boolean {
  const parsed = parse(value);
  return parsed !== null && parsed.lessThanOrEqualTo(maximum);
}

export function isDecimalGreaterThan(value: string, minimum: Decimal.Value): boolean {
  const parsed = parse(value);
  return parsed !== null && parsed.greaterThan(minimum);
}
