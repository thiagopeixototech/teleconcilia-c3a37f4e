/**
 * RFC 4180-compliant CSV parser.
 * Handles quoted fields containing separators, newlines, and escaped quotes.
 */
export function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const parseRows = (text: string, sep: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          field += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === sep) {
          row.push(field.trim());
          field = '';
          i++;
        } else if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          row.push(field.trim());
          if (row.some(f => f !== '')) rows.push(row);
          row = [];
          field = '';
          i += 2;
        } else if (ch === '\n') {
          row.push(field.trim());
          if (row.some(f => f !== '')) rows.push(row);
          row = [];
          field = '';
          i++;
        } else {
          field += ch;
          i++;
        }
      }
    }

    if (field || row.length > 0) {
      row.push(field.trim());
      if (row.some(f => f !== '')) rows.push(row);
    }

    return rows;
  };

  // Detect separator from first line
  const firstLineEnd = content.indexOf('\n');
  const firstLine = firstLineEnd > -1 ? content.substring(0, firstLineEnd) : content;
  const sep = firstLine.includes(';') ? ';' : ',';

  const allRows = parseRows(content, sep);
  if (allRows.length < 2) return { headers: [], rows: [] };

  const headers = allRows[0];
  const rows = allRows.slice(1).map(vals => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ''; });
    return row;
  });

  return { headers, rows };
}
