/** Parses the admin's per-print stages. Safety against the product maximum is enforced by the backend. */
export function parseManualDiscountStages(value: string): number[] | null {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 12 || parts.some((part) => !/^[1-9]\d?$/.test(part))) return null;
  return parts.map(Number);
}
