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

  const match = /\bSET\b([\s\S]+?)\bWHERE\b([\s\S]+)$/i.exec(cleaned);
  if (!match) return false;
  const [, setClause, whereClause] = match;

  const columns = [...setClause.matchAll(/("[^"]+"|\b\w+\b)\s*=/g)].map((found) => unquote(found[1]));
  if (!columns.length) return false;

  return columns.every((column) => new RegExp(`(?:"${escapeRegex(column)}"|\\b${escapeRegex(column)}\\b)\\s+IS\\s+NULL`, 'i').test(whereClause));
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
