/**
 * Normaliza CPF/CNPJ: remove caracteres não numéricos e
 * adiciona zeros à esquerda para garantir 11 dígitos (CPF) ou 14 dígitos (CNPJ).
 */
export function normalizeCpfCnpj(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  // CNPJ: 12-14 dígitos → pad para 14
  if (digits.length >= 12 && digits.length <= 14) {
    return digits.padStart(14, '0');
  }
  // CPF: 9-11 dígitos → pad para 11
  if (digits.length >= 9 && digits.length <= 11) {
    return digits.padStart(11, '0');
  }
  return digits;
}
