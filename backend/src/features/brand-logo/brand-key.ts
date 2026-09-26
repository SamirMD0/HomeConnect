export function normalizeBrandSpelling(name: string | null): string | null {
  if (name === null) return null;
  const collapsed = name.trim().replace(/\s+/gu, ' ');
  return collapsed || null;
}

export function normalizeBrandKey(name: string | null): string | null {
  return normalizeBrandSpelling(name)?.toLocaleLowerCase('en-US') ?? null;
}
