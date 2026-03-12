/**
 * Locale-aware date parser for Brazilian CSV imports.
 * 
 * Priority: DD/MM/YYYY (Brazilian standard) for ambiguous dates.
 * Strips time components, handles 2-digit years, ISO format, and Excel serial dates.
 */
export function parseDate(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null;

  // Handle Excel serial dates
  if (typeof value === 'number' && value > 1 && value < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().split('T')[0];
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Strip time component (e.g. "01/10/2025 15:14" → "01/10/2025")
  const dateOnly = raw.replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, '').trim();

  const expandYear = (y: string): string => {
    if (y.length === 4) return y;
    const num = parseInt(y, 10);
    return num >= 0 && num <= 49 ? `20${y.padStart(2, '0')}` : `19${y.padStart(2, '0')}`;
  };

  // ISO: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = dateOnly.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD/MM/YYYY, MM/DD/YYYY, or ambiguous
  const slashMatch = dateOnly.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (slashMatch) {
    const [, p1, p2, p3] = slashMatch;
    const year = expandYear(p3);
    const n1 = parseInt(p1, 10);
    const n2 = parseInt(p2, 10);

    if (n1 > 12) {
      // First part > 12 → must be day → DD/MM/YYYY
      return `${year}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
    } else if (n2 > 12) {
      // Second part > 12 → must be day → MM/DD/YYYY
      return `${year}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
    } else {
      // Ambiguous (both ≤ 12): assume Brazilian DD/MM/YYYY
      return `${year}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
    }
  }

  return null;
}
