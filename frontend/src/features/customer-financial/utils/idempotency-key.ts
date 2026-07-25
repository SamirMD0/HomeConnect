export function createClientIdempotencyKey(prefix: string): string {
  const random = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
