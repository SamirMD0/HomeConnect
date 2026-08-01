import { describe, expect, it } from 'vitest';
import {
  escapeLikePattern,
  looksLikePhoneQuery,
  MIN_TRIGRAM_LENGTH,
  normalizePhoneTerm,
  normalizeSearchTerm,
  supportsTrigramSearch,
} from './search-normalize';

/**
 * These cases mirror the SQL assertions run against hc_search_normalize in
 * migration 20260801091000. If one side changes, the other must change with it
 * or the expression indexes stop matching.
 */
describe('normalizeSearchTerm', () => {
  it('unifies every alef variant', () => {
    expect(normalizeSearchTerm('أحمد')).toBe('احمد');
    expect(normalizeSearchTerm('إبراهيم')).toBe('ابراهيم');
    expect(normalizeSearchTerm('آدم')).toBe('ادم');
    expect(normalizeSearchTerm('ٱحمد')).toBe('احمد');
  });

  it('strips tashkeel and tatweel', () => {
    expect(normalizeSearchTerm('مُحَمَّد')).toBe(normalizeSearchTerm('محمد'));
    expect(normalizeSearchTerm('أحـمــد')).toBe('احمد');
  });

  it('folds alef maqsura to yeh', () => {
    expect(normalizeSearchTerm('مصطفى')).toBe(normalizeSearchTerm('مصطفي'));
  });

  it('folds teh marbuta to heh', () => {
    expect(normalizeSearchTerm('فاطمة')).toBe('فاطمه');
    expect(normalizeSearchTerm('فاطمة')).toBe(normalizeSearchTerm('فاطمه'));
  });

  it('lowercases English', () => {
    expect(normalizeSearchTerm('AHMAD')).toBe('ahmad');
    expect(normalizeSearchTerm('Ahmad')).toBe(normalizeSearchTerm('ahmad'));
  });

  it('handles mixed Arabic and English', () => {
    expect(normalizeSearchTerm('Samsung ثلاجة')).toBe('samsung ثلاجه');
  });

  it('is null-safe and returns an empty string', () => {
    expect(normalizeSearchTerm(null)).toBe('');
    expect(normalizeSearchTerm(undefined)).toBe('');
    expect(normalizeSearchTerm('')).toBe('');
  });

  it('leaves already-normalized text untouched', () => {
    const normalized = normalizeSearchTerm('احمد');
    expect(normalizeSearchTerm(normalized)).toBe(normalized);
  });
});

describe('normalizePhoneTerm', () => {
  it('keeps digits only', () => {
    expect(normalizePhoneTerm('70 123-456')).toBe('70123456');
    expect(normalizePhoneTerm('+961 (70) 123456')).toBe('96170123456');
    expect(normalizePhoneTerm('70/123/456')).toBe('70123456');
  });

  it('is null-safe', () => {
    expect(normalizePhoneTerm(null)).toBe('');
    expect(normalizePhoneTerm(undefined)).toBe('');
  });

  it('returns empty for text with no digits', () => {
    expect(normalizePhoneTerm('ahmad')).toBe('');
  });
});

describe('escapeLikePattern', () => {
  it('escapes LIKE metacharacters so users cannot wildcard the query', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLikePattern('ahmad')).toBe('ahmad');
    expect(escapeLikePattern('أحمد')).toBe('أحمد');
  });

  it('is null-safe', () => {
    expect(escapeLikePattern(null)).toBe('');
  });
});

describe('looksLikePhoneQuery', () => {
  it('accepts digits with the usual separators', () => {
    expect(looksLikePhoneQuery('70123456')).toBe(true);
    expect(looksLikePhoneQuery('70-123 456')).toBe(true);
    expect(looksLikePhoneQuery('+961 (70) 123456')).toBe(true);
    expect(looksLikePhoneQuery('03/091')).toBe(true);
  });

  it('rejects text that merely contains digits', () => {
    // Without this gate, "50%" would surface every customer whose phone
    // contains "50" — noise, not a result.
    expect(looksLikePhoneQuery('50%')).toBe(false);
    expect(looksLikePhoneQuery('ahmad70')).toBe(false);
    expect(looksLikePhoneQuery('محمد 70')).toBe(false);
  });

  it('rejects too-few digits', () => {
    expect(looksLikePhoneQuery('70')).toBe(false);
    expect(looksLikePhoneQuery('-')).toBe(false);
    expect(looksLikePhoneQuery('')).toBe(false);
  });
});

describe('supportsTrigramSearch', () => {
  it('requires at least three characters', () => {
    expect(MIN_TRIGRAM_LENGTH).toBe(3);
    expect(supportsTrigramSearch('a')).toBe(false);
    expect(supportsTrigramSearch('ab')).toBe(false);
    expect(supportsTrigramSearch('abc')).toBe(true);
    expect(supportsTrigramSearch('  ab  ')).toBe(false);
    expect(supportsTrigramSearch('احمد')).toBe(true);
  });
});
