/**
 * RFC-4180-ish CSV utilities for the tenants importer.
 * Kept dependency-free so it can be unit-tested without pulling in services.
 */

export const stripBom = (content: string): string =>
  content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

/**
 * Full CSV parser: keeps quoted fields intact, including newlines
 * and commas inside double quotes, and handles escaped quotes ("").
 */
export const parseCsv = (content: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field.trim()); field = ''; };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  while (i < content.length) {
    const char = content[i];
    if (inQuotes) {
      if (char === '"') {
        if (content[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += char; i += 1; continue;
    }
    if (char === '"') { inQuotes = true; i += 1; continue; }
    if (char === ',') { pushField(); i += 1; continue; }
    if (char === '\n') { pushRow(); i += 1; continue; }
    if (char === '\r') { i += 1; continue; } // \r\n handled by the \n branch; lone \r skipped
    field += char; i += 1;
  }
  pushRow();
  return rows;
};
