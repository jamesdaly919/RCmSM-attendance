// Minimal CSV parser that handles quoted fields, commas and newlines
// inside quotes — the format Google Sheets' CSV export produces.

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Turns raw CSV text into an array of objects keyed by the header row.
// Header names are lowercased and trimmed so small typos in casing
// or spacing in the sheet don't break the app.
export function csvToObjects(text) {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every((cell) => cell.trim() === "")) continue; // skip blank rows
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? "").trim();
    });
    out.push(obj);
  }
  return out;
}
