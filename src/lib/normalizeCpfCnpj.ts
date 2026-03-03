/**
 * Normaliza CPF/CNPJ para armazenamento: remove caracteres não numéricos.
 * Mantém a quantidade original de dígitos.
 */
export function normalizeCpfCnpj(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[^\d]/g, '');
}

/**
 * Normaliza CPF/CNPJ para comparação/match: remove caracteres não numéricos
 * E remove zeros à esquerda para garantir match entre formatos diferentes
 * (ex: "09340809000137" e "9340809000137" resultam no mesmo valor).
 */
export function normalizeCpfCnpjForMatch(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/[^\d]/g, '');
  return digits.replace(/^0+/, '') || '0';
}
