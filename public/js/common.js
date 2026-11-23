/** Shared helpers for chat + dashboard (no framework). */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Tiny hyperscript: h('div.cls', {onclick}, child, 'text'). */
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ` ${v}`;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined, ...opts, body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || data.errors?.join(', ') || res.statusText); e.status = res.status; throw e; }
  return data;
}

export const money = (n, rent) => `$${Math.round(n).toLocaleString('en-US')}${rent ? '/mo' : ''}`;
export const timeAgo = (iso) => {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso.replace(' ', 'T') + (iso.includes('Z') || iso.includes('T') ? '' : 'Z')).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)}m ago`; if (s < 86400) return `${Math.floor(s / 3600)}h ago`; return `${Math.floor(s / 86400)}d ago`;
};
export const hhmm = (iso) => { const d = new Date(iso.replace(' ', 'T') + 'Z'); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };

/* ---------- theme + brand ---------- */
export function applyBrand(brand) {
  if (!brand) return;
  const r = document.documentElement.style;
  r.setProperty('--brand', brand.primary); r.setProperty('--accent', brand.accent);
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  r.setProperty('--brand-ink', lum(brand.primary) > .5 ? '#10151c' : '#ffffff');
}
export function initTheme() {
  let t; try { t = localStorage.getItem('theme'); } catch { /* private mode */ }
  if (t) document.documentElement.dataset.theme = t;
}
export function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* ignore */ }
  return next;
}
export function setLang(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.body.lang = lang;
  try { localStorage.setItem('ui_lang', lang); } catch { /* ignore */ }
}
export const getLang = (fallback = 'en') => { try { return localStorage.getItem('ui_lang') || fallback; } catch { return fallback; } };

export function toast(msg) {
  let host = $('.toast-host'); if (!host) { host = h('div.toast-host', { role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  const t = h('div.toast', {}, msg); host.append(t); setTimeout(() => t.remove(), 2800);
}

/* ---------- icons (inline SVG, stroke) ---------- */
const P = {
  bed: 'M3 18v-8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8M3 14h18M3 18v2M21 18v2M7 8V6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2',
  bath: 'M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2',
  area: 'M4 4h6M4 4v6M20 20h-6M20 20v-6M4 20l6-6M20 4l-6 6',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  send: 'M5 12l14-8-4 16-3-6-7-2zM12 14l7-10',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM5 11a7 7 0 0 0 14 0M12 18v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cal: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7zM4 10h16M8 3v4M16 3v4',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2A6.5 6.5 0 0 1 21.5 20',
  home: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  kanban: 'M4 4h5v16H4zM10 4h5v10h-5zM16 4h5v13h-5z',
  key: 'M14 10a4 4 0 1 1-3.4-4M10.6 9.4L3 17v4h4l1-1v-2h2l1-1v-2l2.6-2.6',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  inbox: 'M3 13l3-8h12l3 8M3 13v6h18v-6M3 13h5l1 3h6l1-3h5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  swap: 'M7 7h13l-4-4M17 17H4l4 4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11',
  headset: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1v-4zM20 14h-3v5h2a1 1 0 0 0 1-1v-4z',
  bot: 'M12 3v3M7 8h10a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3zM9 13h.01M15 13h.01M9.5 17h5',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};
export function icon(name, size = 18, extra = '') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${P[name] || ''}"/></svg>`;
}
export const ico = (name, size) => { const s = h('span', { style: { display: 'inline-flex' }, html: icon(name, size) }); return s; };

export const FEATURE_LABELS = {
  en: { generator: 'Generator', electricity_24_7: '24/7 power', water_well: 'Water well', parking: 'Parking', sea_view: 'Sea view', elevator: 'Elevator', solar: 'Solar', balcony: 'Balcony', garden: 'Garden', security: 'Security' },
  ar: { generator: 'مولد', electricity_24_7: 'كهرباء 24/7', water_well: 'بير مي', parking: 'موقف', sea_view: 'إطلالة بحرية', elevator: 'مصعد', solar: 'طاقة شمسية', balcony: 'شرفة', garden: 'حديقة', security: 'حراسة' },
  fr: { generator: 'Groupe él.', electricity_24_7: 'Courant 24/7', water_well: 'Puits', parking: 'Parking', sea_view: 'Vue mer', elevator: 'Ascenseur', solar: 'Solaire', balcony: 'Balcon', garden: 'Jardin', security: 'Sécurité' },
};
const FEAT_PATH = { generator: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z', electricity_24_7: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z', water_well: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', parking: 'M7 20V4h6a4.5 4.5 0 0 1 0 9H7', sea_view: 'M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 20c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M12 3v6M8 6h8', elevator: 'M5 3h14v18H5zM9 10l3-3 3 3M9 14l3 3 3-3', solar: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2', balcony: 'M4 10h16M6 10v10M10 10v10M14 10v10M18 10v10M4 20h16M7 10V6h10v4', garden: 'M12 21v-8M12 13c-4 0-6-2-6-6 4 0 6 2 6 6zM12 13c4 0 6-2 6-6-4 0-6 2-6 6z', security: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z' };
export const featIcon = (k, s = 13) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${FEAT_PATH[k] || 'M5 12l5 5L20 7'}"/></svg>`;

/** Generated placeholder artwork (SVG data URI) so no external images are needed. */
export function propArt(hue = 200, category = 'apartment', w = 640, hgt = 400) {
  const c1 = `hsl(${hue} 55% 38%)`; const c2 = `hsl(${(hue + 40) % 360} 60% 62%)`; const sky = `hsl(${hue} 70% 88%)`;
  const shapes = {
    land: '<path d="M0 300 Q160 250 320 290 T640 270 V400 H0z" fill="rgba(255,255,255,.28)"/><path d="M0 340 Q200 300 400 335 T640 320 V400 H0z" fill="rgba(0,0,0,.14)"/>',
    villa: '<path d="M170 300V210l150-80 150 80v90z" fill="rgba(255,255,255,.88)"/><path d="M150 215l170-92 170 92" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="10" stroke-linecap="round"/><rect x="290" y="240" width="60" height="60" rx="4" fill="rgba(0,0,0,.25)"/><rect x="195" y="235" width="55" height="40" rx="3" fill="rgba(0,0,0,.18)"/><rect x="390" y="235" width="55" height="40" rx="3" fill="rgba(0,0,0,.18)"/>',
    shop: '<rect x="150" y="170" width="340" height="140" fill="rgba(255,255,255,.9)"/><path d="M135 170h370l-25-45H160z" fill="rgba(0,0,0,.28)"/><rect x="180" y="205" width="160" height="105" rx="3" fill="rgba(0,0,0,.18)"/><rect x="360" y="215" width="100" height="95" rx="3" fill="rgba(0,0,0,.28)"/>',
  };
  const tower = '<rect x="205" y="110" width="110" height="200" rx="4" fill="rgba(255,255,255,.9)"/><rect x="330" y="160" width="100" height="150" rx="4" fill="rgba(255,255,255,.75)"/><rect x="150" y="190" width="70" height="120" rx="4" fill="rgba(255,255,255,.6)"/>'
    + Array.from({ length: 12 }, (_, i) => `<rect x="${222 + (i % 3) * 30}" y="${126 + Math.floor(i / 3) * 44}" width="16" height="24" rx="2" fill="rgba(0,0,0,.2)"/>`).join('')
    + Array.from({ length: 6 }, (_, i) => `<rect x="${346 + (i % 2) * 40}" y="${176 + Math.floor(i / 2) * 44}" width="16" height="24" rx="2" fill="rgba(0,0,0,.16)"/>`).join('');
  const art = shapes[category] || (category === 'land' ? shapes.land : tower);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="${w}" height="${hgt}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><circle cx="520" cy="90" r="46" fill="${sky}" opacity=".55"/><rect y="310" width="640" height="90" fill="rgba(0,0,0,.16)"/>${art}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
export const listingImg = (l) => (l.photos?.length ? l.photos[0] : propArt(l.hue, l.category));
