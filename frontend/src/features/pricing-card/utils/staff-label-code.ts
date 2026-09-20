/**
 * Formats the display-only employee aid without importing the backend pricing
 * module. That module depends on Prisma's Node-only Decimal runtime and cannot
 * be bundled for the browser.
 */
export function formatStaffLabelCode(sku: string, encodedCode: string): string {
  const displayCode = /^P\d+$/.test(encodedCode) ? `K${encodedCode.slice(1)}Z` : encodedCode;
  return `${sku}-${displayCode}`;
}
