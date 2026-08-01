/**
 * Search-term normalization.
 *
 * These functions MUST stay byte-identical to the SQL functions
 * `hc_search_normalize` and `hc_phone_normalize` created in migration
 * 20260801091000_add_search_normalization. If the two ever disagree, the
 * expression indexes silently stop matching and search quietly returns nothing.
 * `search-normalize.test.ts` pins the shared contract.
 *
 * Rules, in the same order as the SQL:
 *   1. lowercase
 *   2. strip tashkeel (U+064B-U+0652) and tatweel (U+0640)
 *   3. unify alef variants, alef maqsura -> yeh, teh marbuta -> heh
 */

/** Tashkeel (harakat) plus tatweel. */
const DIACRITICS = /[ً-ْـ]/g;

/** Arabic letter folding. Keys and values line up with the SQL translate(). */
const LETTER_FOLD: Record<string, string> = {
  'أ': 'ا', // ALEF WITH HAMZA ABOVE -> ALEF
  'إ': 'ا', // ALEF WITH HAMZA BELOW -> ALEF
  'آ': 'ا', // ALEF WITH MADDA ABOVE -> ALEF
  'ٱ': 'ا', // ALEF WASLA           -> ALEF
  'ى': 'ي', // ALEF MAKSURA         -> YEH
  'ة': 'ه', // TEH MARBUTA          -> HEH
};

const FOLDABLE = /[أإآٱىة]/g;

/**
 * Trigram matching needs at least three characters to be meaningful. Below this
 * length callers must fall back to plain substring matching.
 */
export const MIN_TRIGRAM_LENGTH = 3;

export function normalizeSearchTerm(input: string | null | undefined): string {
  const lowered = (input ?? '').toLowerCase();
  const withoutDiacritics = lowered.replace(DIACRITICS, '');
  return withoutDiacritics.replace(FOLDABLE, (char) => LETTER_FOLD[char] ?? char);
}

export function normalizePhoneTerm(input: string | null | undefined): string {
  return (input ?? '').replace(/[^0-9]/g, '');
}

/**
 * Escapes the LIKE metacharacters so a user typing "50%" searches for that
 * literal text instead of wildcarding the query.
 *
 * Callers must pair this with an explicit ESCAPE clause:
 *   col LIKE '%' || ${escapeLikePattern(term)} || '%' ESCAPE '\'
 */
export function escapeLikePattern(input: string | null | undefined): string {
  return (input ?? '').replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** True when the term is long enough for trigram similarity to be useful. */
export function supportsTrigramSearch(term: string): boolean {
  return term.trim().length >= MIN_TRIGRAM_LENGTH;
}

/**
 * True when the raw term looks like someone typing a phone number: digits plus
 * the usual separators, nothing else.
 *
 * Without this gate any term containing a digit would also be matched against
 * phone columns — searching "50%" would surface every customer whose phone
 * contains "50", which is noise rather than a result.
 */
const PHONE_QUERY = /^[0-9+()\s./-]+$/;

export function looksLikePhoneQuery(input: string | null | undefined): boolean {
  const trimmed = (input ?? '').trim();
  if (!trimmed || !PHONE_QUERY.test(trimmed)) return false;
  return normalizePhoneTerm(trimmed).length >= MIN_TRIGRAM_LENGTH;
}
