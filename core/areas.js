/** Canonical area + feature names and multilingual aliases (Arabic, Arabizi, French, English). */
export const AREA_ALIASES = {
  'Achrafieh': ['achrafieh', 'ashrafieh', 'ashrafiyeh', 'achrafiyeh', 'ashrafiye', 'achrafiye', 'الاشرفية', 'الأشرفية', 'اشرفية', 'أشرفية'],
  'Hamra': ['hamra', 'el hamra', 'الحمرا', 'حمرا', 'الحمراء'],
  'Verdun': ['verdun', 'فردان'],
  'Hadath': ['hadath', 'hadas', 'el hadath', 'hdath', 'الحدث', 'حدث'],
  'Baabda': ['baabda', 'baabdat', 'بعبدا'],
  'Jounieh': ['jounieh', 'jouniye', 'junieh', 'jounie', 'جونية', 'جونيه'],
  'Jal el Dib': ['jal el dib', 'jal eddib', 'jal ed dib', 'jel el dib', 'جل الديب'],
  'Dbayeh': ['dbayeh', 'dbaye', 'dbayyeh', 'dbaiyeh', 'ضبية', 'ضبيه'],
  'Broummana': ['broummana', 'brummana', 'bromana', 'برمانا'],
  'Tripoli': ['tripoli', 'tripolis', 'trablos', 'trabulus', 'طرابلس'],
  'Batroun': ['batroun', 'batrun', 'البترون', 'بترون'],
};

export const FEATURE_ALIASES = {
  generator: ['generator', 'generateur', 'groupe electrogene', 'مولد', 'motor'],
  electricity_24_7: ['24/7 electricity', '24h electricity', 'electricity', 'courant', 'كهرباء', 'kahraba'],
  water_well: ['water well', 'well', 'puits', 'بير', 'be2er', 'biir'],
  parking: ['parking', 'garage', 'موقف', 'كراج', 'karaj'],
  sea_view: ['sea view', 'sea-view', 'vue mer', 'vue sur mer', 'اطلالة بحرية', 'إطلالة بحرية', 'إطلالة على البحر', 'bahr'],
  elevator: ['elevator', 'lift', 'ascenseur', 'مصعد', 'asanser'],
  solar: ['solar', 'solar panels', 'panneaux solaires', 'طاقة شمسية', 'shamsiye'],
  balcony: ['balcony', 'balcon', 'terrace', 'terrasse', 'شرفة', 'تراس', 'balkon'],
  garden: ['garden', 'jardin', 'حديقة', 'jnayne'],
  security: ['security', 'securite', 'حراسة', 'haras'],
};
export const FEATURE_KEYS = Object.keys(FEATURE_ALIASES);

/** Lowercase, strip diacritics, collapse whitespace. */
export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[ً-ٟ̀-ͯ]/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

const isLatin = (a) => /^[a-z0-9 \-]+$/.test(a);
function aliasHit(t, a) {
  if (isLatin(a)) return new RegExp(`(^|[^a-z])${a.replace(/[-\s]+/g, '[- ]?')}([^a-z]|$)`).test(t);
  return t.includes(a);
}

/** All canonical areas mentioned in free text (any language/script), in order of appearance priority. */
export function areasInText(text) {
  const t = norm(text);
  const out = [];
  if (!t) return out;
  for (const [name, aliases] of Object.entries(AREA_ALIASES)) {
    if ([name.toLowerCase(), ...aliases.map(norm)].some((a) => aliasHit(t, a))) out.push(name);
  }
  return out;
}
/** First canonical area in text, or null. */
export const canonicalArea = (text) => areasInText(text)[0] ?? null;

/** Map a feature word/phrase to its canonical key, or null. */
export function canonicalFeature(text) {
  const t = norm(text);
  if (FEATURE_KEYS.includes(t.replace(/ /g, '_'))) return t.replace(/ /g, '_');
  for (const [k, al] of Object.entries(FEATURE_ALIASES)) if (al.some((a) => t === norm(a))) return k;
  return null;
}
export function featuresInText(text) {
  const t = norm(text);
  return FEATURE_KEYS.filter((k) => FEATURE_ALIASES[k].some((a) => aliasHit(t, norm(a))));
}
