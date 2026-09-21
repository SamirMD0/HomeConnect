import { doBlockBody, splitSqlStatements, stripSqlNoise } from './sql-statement-splitter';

/**
 * Rejects destructive SQL before it can run.
 *
 * The plan's rule is "no DROP / TRUNCATE / DELETE / ALTER COLUMN … TYPE", but a
 * substring search for those words rejects almost every real repair file:
 *   - `ON DELETE RESTRICT` is a foreign-key action, not a DELETE statement
 *   - `'WORKSHOP_DROP_OFF'` is an enum value
 *   - `ALTER COLUMN "customerId" DROP NOT NULL` relaxes a constraint and
 *     destroys nothing
 *   - every file's header comment literally says "No DROP, TRUNCATE, DELETE"
 *
 * So the scanner works on noise-stripped statements and judges the *leading
 * verb*, plus a small set of genuinely destructive clauses. Every repair file in
 * `backend/prisma/repair/` is asserted to pass, which is what stops this from
 * being tightened into uselessness later.
 */

export type SqlViolationCode =
  | 'DROP_STATEMENT'
  | 'TRUNCATE_STATEMENT'
  | 'DELETE_STATEMENT'
  | 'UPDATE_STATEMENT'
  | 'DROP_COLUMN'
  | 'DROP_CONSTRAINT'
  | 'COLUMN_TYPE_CHANGE';

export interface SqlViolation {
  code: SqlViolationCode;
  message: string;
  /** 1-based index of the offending statement within the file. */
  statementIndex: number;
  excerpt: string;
}

export interface SqlSafetyResult {
  safe: boolean;
  violations: SqlViolation[];
  statementCount: number;
}

interface Rule {
  code: SqlViolationCode;
  test: RegExp;
  message: string;
}

const RULES: Rule[] = [
  { code: 'DROP_STATEMENT', test: /^\s*DROP\s+/i, message: 'DROP statements are not allowed in bundled SQL.' },
  { code: 'TRUNCATE_STATEMENT', test: /^\s*TRUNCATE\s+/i, message: 'TRUNCATE is not allowed in bundled SQL.' },
  { code: 'DELETE_STATEMENT', test: /^\s*DELETE\s+FROM\s+/i, message: 'DELETE is not allowed in bundled SQL.' },
  { code: 'UPDATE_STATEMENT', test: /^\s*UPDATE\s+\S+\s+SET\s+/i, message: 'UPDATE may only backfill NULLs in a newly added column, or record migration bookkeeping.' },
  // Inside ALTER TABLE: dropping a column or constraint loses data or integrity.
  // `DROP NOT NULL` / `DROP DEFAULT` are deliberately not matched — they relax a
  // rule without touching a single row, and 1.2.0-repair.sql relies on that.
  { code: 'DROP_COLUMN', test: /\bDROP\s+COLUMN\b/i, message: 'Dropping a column would lose data.' },
  { code: 'DROP_CONSTRAINT', test: /\bDROP\s+CONSTRAINT\b/i, message: 'Dropping a constraint would weaken referential integrity.' },
  // Type changes can silently truncate or fail to cast on a live database.
  { code: 'COLUMN_TYPE_CHANGE', test: /\bALTER\s+COLUMN\s+(?:"[^"]+"|\w+)\s+(?:SET\s+DATA\s+)?TYPE\b/i, message: 'Changing a column type is not allowed in bundled SQL.' },
];

/**
 * Prisma's own bookkeeping table. The failed-row recovery this feature exists to
 * perform *is* an UPDATE against it, so it cannot be treated as business data.
 */
const BOOKKEEPING_TABLE = /^\s*UPDATE\s+"?_prisma_migrations"?\s/i;
const PRODUCT_LABEL_AUTO_BACKFILL = /^\s*UPDATE\s+"?products"?\s+SET\s+"?labelBarcodeSource"?\s*=\s*''\s+WHERE\s+"?labelBarcodeSource"?\s*=\s*''\s+AND\s+"?barcode"?\s+IS\s+NOT\s+NULL\s*$/i;
const PRODUCT_LABEL_AUTO_VALUES = /\bSET\s+"?labelBarcodeSource"?\s*=\s*'AUTO'\s+WHERE\s+"?labelBarcodeSource"?\s*=\s*'SKU'\s+AND\s+"?barcode"?\s+IS\s+NOT\s+NULL\b/i;

/**
 * Migration 20260920200000_update_legacy_template_visuals. The two seeded legacy
 * templates shipped with borderPx=0 / sectionDividers=false, but the ProductLabel
 * they replace draws a 1px border and a divider above the price, so the seeded
 * pair had to be brought back in line. Reviewed and allowed because it is pinned
 * to those two seeded ids and writes two known appearance keys — it cannot reach
 * an operator-authored template. Keep this allow-list exact: the shape is matched
 * against the noise-stripped statement (string literals collapse to '') and every
 * literal value is matched against the original text.
 */
const LEGACY_TEMPLATE_PARITY_SHAPE = /^\s*UPDATE\s+"?pricing_card_templates"?\s+SET\s+"?config"?\s*=\s*jsonb_set\(\s*jsonb_set\(\s*"?config"?\s*,\s*''\s*,\s*''::jsonb\s*,\s*false\s*\)\s*,\s*''\s*,\s*''::jsonb\s*,\s*false\s*\)\s*WHERE\s+"?id"?\s+IN\s*\(\s*''\s*,\s*''\s*,?\s*\)\s*$/i;
const LEGACY_TEMPLATE_PARITY_VALUES = [
  /jsonb_set\(\s*"?config"?\s*,\s*'\{appearance,borderPx\}'\s*,\s*'1'::jsonb\s*,\s*false\s*\)/i,
  /'\{appearance,sectionDividers\}'\s*,\s*'true'::jsonb\s*,\s*false/i,
  /'20000000-0000-4000-8000-000000000003'/i,
  /'20000000-0000-4000-8000-000000000004'/i,
];

/**
 * Migration 20260920220000_refresh_pricing_card_feature_icons. This is a
 * reviewed visual-only refresh pinned to the complete shipped icon code set.
 * It may replace only the SVG column and cannot reach admin-created rows.
 */
const FEATURE_ICON_REFRESH_SHAPE = /^\s*UPDATE\s+"?pricing_card_feature_icons"?\s+SET\s+"?svg"?\s*=\s*refreshed\."?svg"?\s+FROM\s*\(\s*VALUES[\s\S]+\)\s+AS\s+refreshed\s*\(\s*"?code"?\s*,\s*"?svg"?\s*\)\s+WHERE\s+"?pricing_card_feature_icons"?\."?code"?\s*=\s*refreshed\."?code"?\s*$/i;
const FEATURE_ICON_REFRESH_CODES = [
  'qled', 'oled', 'uhd-4k', 'dolby-vision', 'google-tv', 'inverter', 'no-frost',
  'energy-a', 'energy-a-plus', 'spin-1400', 'wifi', 'steam', 'cordless', 'waterproof',
  'brushless', 'usb-c-charging', 'digital-display',
];

/** The same reviewed migration converts only the two shipped grid templates. */
const FEATURE_LAYOUT_REFRESH_SHAPE = /^\s*UPDATE\s+"?pricing_card_templates"?\s+SET\s+"?config"?\s*=\s*jsonb_set\(\s*"?config"?\s*,\s*''\s*,\s*''::jsonb\s*,\s*false\s*\)\s+WHERE\s+"?id"?\s+IN\s*\(\s*''\s*,\s*''\s*\)\s+AND\s+"?config"?\s*#>>\s*''\s+IN\s*\(\s*''\s*,\s*''\s*\)\s*$/i;
const FEATURE_LAYOUT_REFRESH_VALUES = [
  /'\{features,layout\}'/i,
  /'"grid-chip"'::jsonb/i,
  /'20000000-0000-4000-8000-000000000001'/i,
  /'20000000-0000-4000-8000-000000000002'/i,
  /'grid-2x3'/i,
  /'grid-3x2'/i,
];

/**
 * Migration 20260920230000_set_pricing_card_price_prominence. Reviewed and
 * allowed for the same reasons as the two above: pinned to the two seeded shelf
 * templates and writing two known `price` keys. It carries its own guard —
 * `prominence` must still be absent — so it is a backfill in the scanner's own
 * sense, and a template an operator has since tuned is never overwritten.
 */
const PRICE_PROMINENCE_SHAPE = /^\s*UPDATE\s+"?pricing_card_templates"?\s+SET\s+"?config"?\s*=\s*jsonb_set\(\s*jsonb_set\(\s*"?config"?\s*,\s*''\s*,\s*''::jsonb\s*,\s*true\s*\)\s*,\s*''\s*,\s*''::jsonb\s*,\s*false\s*\)\s*WHERE\s+"?id"?\s+IN\s*\(\s*''\s*,\s*''\s*,?\s*\)\s*AND\s+"?config"?\s*#>>\s*''\s+IS\s+NULL\s*$/i;
const PRICE_PROMINENCE_VALUES = [
  /jsonb_set\(\s*"?config"?\s*,\s*'\{price,prominence\}'\s*,\s*'"hero"'::jsonb\s*,\s*true\s*\)/i,
  /'\{price,fontScale\}'\s*,\s*'1'::jsonb\s*,\s*false/i,
  /'20000000-0000-4000-8000-000000000001'/i,
  /'20000000-0000-4000-8000-000000000002'/i,
  /"?config"?\s*#>>\s*'\{price,prominence\}'\s+IS\s+NULL/i,
];

/**
 * Migration 20260921100000_switch_tv_large_to_centered_layout. Reviewed and
 * allowed for the same reasons as the visual-refresh siblings above: pinned
 * to the single seeded TV Large template id, writes exactly one known
 * `appearance.layout` key, and guarded on that key being absent — so an
 * admin who has already picked a layout is never overwritten.
 */
const TV_LARGE_CENTERED_LAYOUT_SHAPE = /^\s*UPDATE\s+"?pricing_card_templates"?\s+SET\s+"?config"?\s*=\s*jsonb_set\(\s*"?config"?\s*,\s*''\s*,\s*''::jsonb\s*,\s*true\s*\)\s*WHERE\s+"?id"?\s*=\s*''\s+AND\s+"?config"?\s*#>>\s*''\s+IS\s+NULL\s*$/i;
const TV_LARGE_CENTERED_LAYOUT_VALUES = [
  /'\{appearance,layout\}'\s*,\s*'"centered"'::jsonb\s*,\s*true/i,
  /'20000000-0000-4000-8000-000000000001'/i,
  /"?config"?\s*#>>\s*'\{appearance,layout\}'\s+IS\s+NULL/i,
];

/**
 * The same reviewed migration brings the two shelf templates' header marks down
 * to the sizes VISUAL_DESIGN §5 and §6 specify, so the hero price has the height
 * it needs. Same two pinned ids, two known `header` keys, and guarded on the
 * shipped sizes so a resized template is left alone.
 */
const HEADER_MARK_SIZE_SHAPE = /^\s*UPDATE\s+"?pricing_card_templates"?\s+SET\s+"?config"?\s*=\s*jsonb_set\(\s*jsonb_set\(\s*"?config"?\s*,\s*''\s*,\s*''::jsonb\s*,\s*false\s*\)\s*,\s*''\s*,\s*''::jsonb\s*,\s*false\s*\)\s*WHERE\s+"?id"?\s+IN\s*\(\s*''\s*,\s*''\s*,?\s*\)\s*AND\s*\(\s*"?config"?\s*#>>\s*''\s*\)\s+IN\s*\(\s*''\s*,\s*''\s*\)\s*$/i;
const HEADER_MARK_SIZE_VALUES = [
  /jsonb_set\(\s*"?config"?\s*,\s*'\{header,companyLogo,sizeMm\}'\s*,\s*'8'::jsonb\s*,\s*false\s*\)/i,
  /'\{header,brand,sizeMm\}'\s*,\s*'10'::jsonb\s*,\s*false/i,
  /'20000000-0000-4000-8000-000000000001'/i,
  /'20000000-0000-4000-8000-000000000002'/i,
  /"?config"?\s*#>>\s*'\{header,companyLogo,sizeMm\}'\s*\)\s+IN\s*\(\s*'18'\s*,\s*'14'\s*\)/i,
];

export function scanSqlForUnsafeStatements(sql: string): SqlSafetyResult {
  return scanStatements(sql, false);
}

function scanStatements(sql: string, insideDoBlock: boolean): SqlSafetyResult {
  const statements = splitSqlStatements(sql);
  const violations: SqlViolation[] = [];

  statements.forEach((statement, position) => {
    const statementNumber = position + 1;

    // Repair logic lives inside DO blocks; scan the body rather than trusting it.
    const body = doBlockBody(statement);
    if (body) {
      for (const inner of scanStatements(body, true).violations) {
        violations.push({ ...inner, statementIndex: statementNumber, excerpt: excerptOf(statement) });
      }
      return;
    }

    const cleaned = insideDoBlock ? stripControlFlow(stripSqlNoise(statement)) : stripSqlNoise(statement);

    for (const rule of RULES) {
      if (!rule.test.test(cleaned)) continue;
      if (rule.code === 'UPDATE_STATEMENT' && isPermittedUpdate(cleaned, statement)) continue;
      violations.push({
        code: rule.code,
        message: rule.message,
        statementIndex: statementNumber,
        excerpt: excerptOf(statement),
      });
    }
  });

  return { safe: violations.length === 0, violations, statementCount: statements.length };
}

/**
 * An UPDATE is allowed only in two shapes:
 *
 *  1. Migration bookkeeping on `_prisma_migrations`.
 *  2. A NULL backfill for a column that was just added — every column being SET
 *     must also be constrained `IS NULL` in the WHERE clause. That restricts the
 *     write to rows which have no value yet, so no existing business figure can
 *     be overwritten. This is the pattern used by the real 1.0.7 and 1.1.2
 *     repairs:
 *         ADD COLUMN IF NOT EXISTS "kind";
 *         UPDATE "debts" SET "kind" = 'STANDARD' WHERE "kind" IS NULL;
 *         ALTER COLUMN "kind" SET NOT NULL;
 */
function isPermittedUpdate(cleaned: string, original: string): boolean {
  if (BOOKKEEPING_TABLE.test(cleaned)) return true;
  // Product label AUTO is a reviewed preference migration, not a financial
  // rewrite: it touches only rows still carrying the old SKU default and only
  // when a saved barcode exists. Keep this allow-list exact.
  if (PRODUCT_LABEL_AUTO_BACKFILL.test(cleaned) && PRODUCT_LABEL_AUTO_VALUES.test(original)) return true;
  // Seeded legacy template appearance parity — pinned to two seeded ids.
  if (LEGACY_TEMPLATE_PARITY_SHAPE.test(cleaned) && LEGACY_TEMPLATE_PARITY_VALUES.every((rule) => rule.test(original))) return true;
  // Curated feature marks — pinned to all and only the 17 shipped codes.
  if (FEATURE_ICON_REFRESH_SHAPE.test(cleaned) && hasExactFeatureIconCodes(original)) return true;
  // Feature layout rename — pinned to the two shipped grid templates.
  if (FEATURE_LAYOUT_REFRESH_SHAPE.test(cleaned) && FEATURE_LAYOUT_REFRESH_VALUES.every((rule) => rule.test(original))) return true;
  // Price prominence — pinned to the two shipped shelf templates, guarded on absence.
  if (PRICE_PROMINENCE_SHAPE.test(cleaned) && PRICE_PROMINENCE_VALUES.every((rule) => rule.test(original))) return true;
  // Header mark sizes for the same two templates, guarded on the shipped sizes.
  if (HEADER_MARK_SIZE_SHAPE.test(cleaned) && HEADER_MARK_SIZE_VALUES.every((rule) => rule.test(original))) return true;
  // TV Large centered-layout switch — pinned to the one seeded id, guarded on absence.
  if (TV_LARGE_CENTERED_LAYOUT_SHAPE.test(cleaned) && TV_LARGE_CENTERED_LAYOUT_VALUES.every((rule) => rule.test(original))) return true;

  const match = /\bSET\b([\s\S]+?)\bWHERE\b([\s\S]+)$/i.exec(cleaned);
  if (!match) return false;
  const [, setClause, whereClause] = match;

  const columns = [...setClause.matchAll(/("[^"]+"|\b\w+\b)\s*=/g)].map((found) => unquote(found[1]));
  if (!columns.length) return false;

  return columns.every((column) => new RegExp(`(?:"${escapeRegex(column)}"|\\b${escapeRegex(column)}\\b)\\s+IS\\s+NULL`, 'i').test(whereClause));
}

function hasExactFeatureIconCodes(sql: string): boolean {
  const codes = [...sql.matchAll(/\(\s*'([^']+)'\s*,\s*'<svg\b/g)].map((match) => match[1]).sort();
  return codes.length === FEATURE_ICON_REFRESH_CODES.length
    && codes.every((code, index) => code === [...FEATURE_ICON_REFRESH_CODES].sort()[index]);
}

/**
 * Inside a DO block a statement rarely starts with its verb — it sits after
 * `BEGIN`, `THEN`, `ELSE` or `LOOP`. Cutting the control-flow prefix re-exposes
 * the verb so the same anchored rules apply, which is how `DO $$ BEGIN DROP
 * TABLE x; END $$` gets caught.
 */
function stripControlFlow(cleaned: string): string {
  let current = cleaned;
  for (let pass = 0; pass < 8; pass += 1) {
    const next = current.replace(/^[\s\S]*?\b(?:BEGIN|DECLARE|THEN|ELSE|LOOP)\b\s*/i, '');
    if (next === current) break;
    current = next;
  }
  return current;
}

const unquote = (value: string) => value.replace(/^"|"$/g, '');
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Throws with every problem listed at once, so a bad file is fixed in one pass. */
export function assertSqlIsSafe(sql: string, label: string): void {
  const result = scanSqlForUnsafeStatements(sql);
  if (result.safe) return;
  const detail = result.violations
    .map((violation) => `  statement ${violation.statementIndex}: ${violation.message} — ${violation.excerpt}`)
    .join('\n');
  throw new Error(`Unsafe SQL rejected in ${label}:\n${detail}`);
}

function excerptOf(statement: string): string {
  const flat = statement.replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}
