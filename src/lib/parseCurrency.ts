/**
 * Parser monetário centralizado para formatos BR e internacionais.
 * Aceita: 1234,56 | 1.234,56 | 1234.56 | R$ 1.234,56 | -1.234,56
 * Retorna número em formato decimal JS ou null se inválido.
 */
export function parseCurrency(raw: string | null | undefined): number | null {
  if (!raw) return null;

  // Remove prefixos monetários, espaços e caracteres não numéricos exceto . , -
  let cleaned = raw.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!cleaned) return null;

  // Detect negative
  const isNegative = cleaned.startsWith('-') || cleaned.startsWith('(');
  cleaned = cleaned.replace(/^[-(]+|[)]+$/g, '');

  // Count dots and commas
  const dots = (cleaned.match(/\./g) || []).length;
  const commas = (cleaned.match(/,/g) || []).length;

  if (commas === 1 && dots === 0) {
    // "1234,56" → BR decimal
    cleaned = cleaned.replace(',', '.');
  } else if (commas === 1 && dots >= 1) {
    // "1.234,56" → BR thousands + decimal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (dots === 1 && commas === 0) {
    // "1234.56" → already correct OR "1.234" (ambiguous, treat as decimal)
    // Keep as-is
  } else if (dots >= 2 && commas === 0) {
    // "1.234.567" → thousands separators only (integer)
    cleaned = cleaned.replace(/\./g, '');
  } else if (commas >= 2) {
    // "1,234,567" → US thousands
    cleaned = cleaned.replace(/,/g, '');
  } else {
    // Remove all non-numeric except dot
    cleaned = cleaned.replace(/[^\d.]/g, '');
  }

  // Final cleanup
  cleaned = cleaned.replace(/[^\d.]/g, '');
  if (!cleaned) return null;

  const value = parseFloat(cleaned);
  if (isNaN(value)) return null;
  return isNegative ? -value : value;
}
