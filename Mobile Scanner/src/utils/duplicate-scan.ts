export const DUPLICATE_SCAN_WINDOW_MS = 2_500;

export interface RecentSubmission {
  code: string;
  submittedAt: number;
}

const canonicalCode = (value: string) => value.trim().toLocaleUpperCase('en-US');

export function shouldSuppressDuplicate(
  previous: RecentSubmission | null,
  code: string,
  now: number,
  windowMs = DUPLICATE_SCAN_WINDOW_MS
): boolean {
  if (!previous) return false;
  return canonicalCode(previous.code) === canonicalCode(code) && now - previous.submittedAt < windowMs;
}

export function recentSubmission(code: string, submittedAt: number): RecentSubmission {
  return { code: canonicalCode(code), submittedAt };
}
