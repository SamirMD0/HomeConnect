/** Matches both local disposable databases and the hosted CI database. */
export function isIsolatedTestDatabase(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const name = new URL(url).pathname.slice(1);
    return /(^|[_-])(test|ci)([_-]|$)/i.test(name);
  } catch {
    return false;
  }
}
