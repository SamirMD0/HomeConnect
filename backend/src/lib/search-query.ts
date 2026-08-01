import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  escapeLikePattern,
  looksLikePhoneQuery,
  normalizePhoneTerm,
  normalizeSearchTerm,
  supportsTrigramSearch,
} from './search-normalize';

/**
 * Trigram-backed id lookup.
 *
 * Returns the ids of rows matching a search term, which callers then feed into
 * their existing Prisma query. Keeping raw SQL to "which ids match" means
 * pagination, sorting, includes, and serialization all stay in Prisma — the
 * search change cannot alter how a record is shaped or ordered.
 *
 * The matcher is deliberately a UNION of two conditions:
 *   * normalized LIKE   -- a strict superset of the ILIKE '%term%' this
 *                          replaces, so nothing that matched before stops
 *   * trigram `%`       -- adds Arabic-variant and typo tolerance
 *
 * SAFETY RULES (see claude/plans/v1.0.9-postgres-pgtrgm-search-plan.md):
 *   * Every identifier comes from the frozen SEARCH_TARGETS map below. User
 *     input is NEVER used to build an identifier.
 *   * Search terms are always bind parameters. LIKE patterns are assembled in
 *     SQL with `||` so the term never becomes part of the statement text.
 *   * LIKE metacharacters in the term are escaped, so typing "50%" searches for
 *     that literal text instead of wildcarding.
 *   * `Prisma.$queryRawUnsafe` must never appear in this file.
 */

interface SearchTarget {
  table: Prisma.Sql;
  /** Restricts the search to live rows, e.g. soft-delete filters. */
  baseFilter: Prisma.Sql | null;
  /** Columns matched as normalized text. */
  textColumns: Prisma.Sql[];
  /** Columns matched as digits-only phone numbers. */
  phoneColumns: Prisma.Sql[];
}

/**
 * Frozen allowlist. Adding a target is a code change reviewed like any other;
 * nothing here can originate from a request.
 */
const SEARCH_TARGETS = {
  customer: {
    table: Prisma.sql`customers`,
    baseFilter: Prisma.sql`"deletedAt" IS NULL`,
    textColumns: [Prisma.sql`name`],
    phoneColumns: [Prisma.sql`phone`],
  },
  supplier: {
    table: Prisma.sql`suppliers`,
    baseFilter: null,
    textColumns: [Prisma.sql`name`, Prisma.sql`"companyName"`],
    phoneColumns: [Prisma.sql`phone`, Prisma.sql`"secondaryPhone"`],
  },
  supplierTransaction: {
    table: Prisma.sql`supplier_transactions`,
    baseFilter: null,
    textColumns: [Prisma.sql`description`, Prisma.sql`reference`],
    phoneColumns: [],
  },
  debt: {
    table: Prisma.sql`debts`,
    baseFilter: null,
    textColumns: [Prisma.sql`description`],
    phoneColumns: [],
  },
} as const satisfies Record<string, SearchTarget>;

export type SearchTargetName = keyof typeof SEARCH_TARGETS;

/**
 * Upper bound on ids returned. Well above any realistic result count for a
 * single-shop dataset; exists so a pathological one-character-ish term cannot
 * build an unbounded `IN (...)` list.
 */
export const MAX_SEARCH_IDS = 2000;

/**
 * Resolves a search term to matching row ids.
 * Returns `null` when the term is blank, meaning "apply no search filter".
 */
export async function findSearchMatchIds(
  target: SearchTargetName,
  rawTerm: string | null | undefined,
  limit: number = MAX_SEARCH_IDS
): Promise<string[] | null> {
  const trimmed = (rawTerm ?? '').trim();
  if (!trimmed) return null;

  const config = SEARCH_TARGETS[target];
  const term = normalizeSearchTerm(trimmed);
  const likeTerm = escapeLikePattern(term);
  const phoneTerm = normalizePhoneTerm(trimmed);
  const useTrigram = supportsTrigramSearch(term);

  const conditions: Prisma.Sql[] = [];

  for (const column of config.textColumns) {
    // Substring match on the normalized column: a superset of the previous ILIKE.
    conditions.push(
      Prisma.sql`hc_search_normalize(${column}) LIKE '%' || ${likeTerm} || '%' ESCAPE '\\'`
    );
    // Similarity match: Arabic variants and typos. Needs >= 3 characters to be
    // meaningful, and uses pg_trgm's default 0.3 threshold.
    if (useTrigram) {
      conditions.push(Prisma.sql`hc_search_normalize(${column}) % ${term}`);
    }
  }

  // Phone is substring-only, never fuzzy: a digit typo must not surface a
  // different customer's record. It is also only probed when the term actually
  // looks like a phone number, so a text search containing digits does not
  // return everyone whose number happens to share them.
  if (phoneTerm && looksLikePhoneQuery(trimmed)) {
    for (const column of config.phoneColumns) {
      conditions.push(
        Prisma.sql`hc_phone_normalize(${column}) LIKE '%' || ${escapeLikePattern(phoneTerm)} || '%' ESCAPE '\\'`
      );
    }
  }

  if (conditions.length === 0) return [];

  const matcher = Prisma.join(conditions, ' OR ');
  const where = config.baseFilter
    ? Prisma.sql`${config.baseFilter} AND (${matcher})`
    : Prisma.sql`(${matcher})`;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM ${config.table} WHERE ${where} LIMIT ${limit}`
  );

  return rows.map((row) => row.id);
}
