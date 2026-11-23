/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF, BOM). Auto-detects ; or , as delimiter. */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export const LISTING_CSV_TEMPLATE = 'title,type,category,area,price,bedrooms,bathrooms,size_m2,furnished,features,description,agent_id\n'
  + '"Bright 2BR in Hadath",rent,apartment,Hadath,650,2,2,110,no,generator;parking;water_well,"Quiet building, ready to move in",karim\n'
  + '"Sea-view 3BR in Jounieh",sale,apartment,Jounieh,245000,3,2,165,no,sea_view;elevator;parking,"Open sea view, 5 min from the seafront",karim\n';
