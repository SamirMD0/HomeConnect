const DIACRITICS = /[ً-ْـ]/g;
const FOLDABLE = /[أإآٱىة]/g;
const FOLD: Record<string, string> = { أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا', ى: 'ي', ة: 'ه' };

export const normalizeCustomerSearch = (value: string): string =>
  value.toLowerCase().replace(DIACRITICS, '').replace(FOLDABLE, (char) => FOLD[char] ?? char).trim().replace(/\s+/g, ' ');
