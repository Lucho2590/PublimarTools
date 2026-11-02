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

/**
 * Valida el dígito verificador (módulo 11) además del largo. Usar antes de
 * facturar o consultar el padrón de ARCA; `isValidCuit` queda para los
 * formularios que solo exigen 11 dígitos.
 */
export function isValidCuitChecksum(value: string | undefined | null): boolean {
  const digits = cleanCuit(value);
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return expected === Number(digits[10]);
}
