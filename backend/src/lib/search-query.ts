import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import {
  escapeLikePattern,
  looksLikePhoneQuery,
  normalizePhoneTerm,
  normalizeSearchTerm,
  supportsTrigramSearch,
  tokenizeSearchTerm,
} from './search-normalize';

/**
 * Trigram-backed id lookup.
 *
 * Returns the ids of rows matching a search term, which callers then feed into
 * their existing Prisma query. Keeping raw SQL to "which ids match" means
 * pagination, sorting, includes, and serialization all stay in Prisma — the
 * search change cannot alter how a record is shaped or ordered.
 *
 * Each token deliberately unions two conditions:
 *   * normalized LIKE   -- a strict superset of the ILIKE '%term%' this
 *                          replaces, so nothing that matched before stops
 *   * trigram `%`       -- adds Arabic-variant and typo tolerance
 * AND-mode searches require every query word to match at least one allowed
 * field. PHRASE-mode targets retain their existing whole-query semantics.
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
  /** Whether words are all required or the input is treated as one phrase. */
  tokenMode: 'AND' | 'PHRASE';
}

/**
 * Frozen allowlist. Adding a target is a code change reviewed like any other;
 * nothing here can originate from a request.
 */
const SEARCH_TARGETS = {
  customer: {
    table: Prisma.sql`customers`,
    baseFilter: Prisma.sql`"deletedAt" IS NULL`,
    textColumns: [Prisma.sql`name`, Prisma.sql`address`, Prisma.sql`notes`],
    phoneColumns: [Prisma.sql`phone`],
    tokenMode: 'AND',
  },
  customerNamePhone: {
    table: Prisma.sql`customers`,
    baseFilter: Prisma.sql`"deletedAt" IS NULL`,
    textColumns: [Prisma.sql`name`],
    phoneColumns: [Prisma.sql`phone`],
    tokenMode: 'AND',
  },
  supplier: {
    table: Prisma.sql`suppliers`,
    baseFilter: null,
    textColumns: [Prisma.sql`name`, Prisma.sql`"companyName"`],
    phoneColumns: [Prisma.sql`phone`, Prisma.sql`"secondaryPhone"`],
    tokenMode: 'PHRASE',
  },
  supplierTransaction: {
    table: Prisma.sql`supplier_transactions`,
    baseFilter: null,
    textColumns: [Prisma.sql`description`, Prisma.sql`reference`],
    phoneColumns: [],
    tokenMode: 'PHRASE',
  },
  debt: {
    table: Prisma.sql`debts`,
    baseFilter: null,
    textColumns: [Prisma.sql`description`],
    phoneColumns: [],
    tokenMode: 'PHRASE',
  },
  product: {
    table: Prisma.sql`products`,
    baseFilter: null,
    textColumns: [
      Prisma.sql`name`, Prisma.sql`model`, Prisma.sql`brand`, Prisma.sql`sku`,
      Prisma.sql`barcode`, Prisma.sql`notes`, Prisma.sql`"specificationNotes"`,
      Prisma.sql`specifications::text`,
    ],
    phoneColumns: [],
    tokenMode: 'AND',
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
  // AND targets require every word while allowing different fields to satisfy
  // different words. PHRASE targets intentionally retain whole-query matching.
  // A phone-only query remains one token so separators/spaces normalize as a
  // single phone number rather than becoming several unrelated requirements.
  const searchTokens = config.tokenMode === 'AND' && !looksLikePhoneQuery(trimmed)
    ? tokenizeSearchTerm(trimmed)
    : [trimmed];
  const tokenMatchers: Prisma.Sql[] = [];

  for (const rawToken of searchTokens) {
    const term = normalizeSearchTerm(rawToken);
    const unitMatch = term.match(/^(\d+(?:[.,]\d+)?)([a-z\u0600-\u06FF]{1,6})$/i);
    const likeTerms = unitMatch ? [term, `${unitMatch[1]} ${unitMatch[2]}`] : [term];
    const conditions: Prisma.Sql[] = [];

    for (const column of config.textColumns) {
      // Substring match on the normalized column: a superset of the previous ILIKE.
      for (const likeTerm of likeTerms) {
        conditions.push(
          Prisma.sql`hc_search_normalize(${column}) LIKE '%' || ${escapeLikePattern(likeTerm)} || '%' ESCAPE '\\'`
        );
      }
      // Similarity match preserves the existing Arabic-variant and typo tolerance.
      if (supportsTrigramSearch(term)) {
        conditions.push(Prisma.sql`hc_search_normalize(${column}) % ${term}`);
      }
    }

    // Phone is substring-only, never fuzzy: a digit typo must not surface a
    // different customer's record. It is only probed for phone-shaped tokens.
    const phoneTerm = normalizePhoneTerm(rawToken);
    if (phoneTerm && looksLikePhoneQuery(rawToken)) {
      for (const column of config.phoneColumns) {
        conditions.push(
          Prisma.sql`hc_phone_normalize(${column}) LIKE '%' || ${escapeLikePattern(phoneTerm)} || '%' ESCAPE '\\'`
        );
      }
    }

    if (conditions.length > 0) {
      tokenMatchers.push(Prisma.sql`(${Prisma.join(conditions, ' OR ')})`);
    }
  }

  if (tokenMatchers.length === 0) return [];

  const matcher = Prisma.join(tokenMatchers, config.tokenMode === 'AND' ? ' AND ' : ' OR ');
  const where = config.baseFilter
    ? Prisma.sql`${config.baseFilter} AND (${matcher})`
    : Prisma.sql`(${matcher})`;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM ${config.table} WHERE ${where} LIMIT ${limit}`
  );

  return rows.map((row) => row.id);
}
