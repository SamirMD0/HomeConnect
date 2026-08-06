/** Formats an eight-digit local phone for display without changing stored data. */
export function formatCustomerPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 8
    ? `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    : phone;
}
