/**
 * Normaliza protocolo: se for composto apenas por 7 dígitos, adiciona um zero à esquerda.
 */
export function normalizeProtocolo(protocolo: string | null | undefined): string | null {
  if (!protocolo) return null;
  const trimmed = protocolo.trim();
  if (!trimmed) return null;
  // Se for exatamente 7 dígitos, pad com zero à esquerda
  if (/^\d{7}$/.test(trimmed)) {
    return '0' + trimmed;
  }
  return trimmed;
}
