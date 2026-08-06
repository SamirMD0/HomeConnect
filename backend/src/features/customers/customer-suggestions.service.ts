import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { findSearchMatchIds } from '../../lib/search-query';
import {
  looksLikePhoneQuery,
  MIN_TRIGRAM_LENGTH,
  normalizeSearchTerm,
} from '../../lib/search-normalize';

const SUGGESTION_THRESHOLD = 0.45;
const MAX_SUGGESTIONS = 3;

export interface CustomerSearchSuggestion {
  query: string;
  count: number;
}

export class CustomerSuggestionsService {
  static async suggest(rawTerm: string | null | undefined, requestedLimit = MAX_SUGGESTIONS) {
    const trimmed = (rawTerm ?? '').trim();
    const normalized = normalizeSearchTerm(trimmed);
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_SUGGESTIONS);
    if (normalized.length < MIN_TRIGRAM_LENGTH || looksLikePhoneQuery(trimmed)) return [];

    const primaryMatches = await findSearchMatchIds('customer', trimmed);
    if (primaryMatches && primaryMatches.length > 0) return [];

    const candidates = await prisma.$queryRaw<Array<{ query: string; score: number }>>(
      Prisma.sql`
        SELECT name AS query,
               word_similarity(${normalized}, hc_search_normalize(name)) AS score
        FROM customers
        WHERE "deletedAt" IS NULL
          AND word_similarity(${normalized}, hc_search_normalize(name)) >= ${SUGGESTION_THRESHOLD}
        ORDER BY score DESC, name ASC
        LIMIT ${limit * 5}
      `
    );

    const suggestions: CustomerSearchSuggestion[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const key = normalizeSearchTerm(candidate.query);
      if (seen.has(key)) continue;
      seen.add(key);
      const matches = await findSearchMatchIds('customerNamePhone', candidate.query);
      const count = matches?.length ?? 0;
      if (count > 0) suggestions.push({ query: candidate.query, count });
      if (suggestions.length === limit) break;
    }
    return suggestions;
  }
}
