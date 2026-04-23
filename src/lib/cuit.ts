export function cleanCuit(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/\D/g, "").slice(0, 11);
}

export function formatCuit(value: string | undefined | null): string {
  const digits = cleanCuit(value);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export function isValidCuit(value: string | undefined | null): boolean {
  return cleanCuit(value).length === 11;
}
