/** Lightweight language/script detection: 'ar' (Arabic script), 'arabizi' (Arabic in Latin letters), 'fr', 'en'. */
const ARABIZI = /\b(baddi|bade|badde|badna|ba7eb|bhebb|esta2jer|esta2jir|ista2jer|2ejar|2eijar|sha2a|shaqqa|sa2a|se3er|s3er|kam|kif|keefak|kifak|shu|chou|shou|3am|3anjad|ktir|kteer|mnih|mni7|marhaba|mar7aba|merhaba|ahla|ahlan|habibi|ya3ni|ma3|bi|3al|bel|mish|msh|lesh|leh|wen|wein|ana|enta|enti|3endi|3ndi|bi7ib|aktar|ashtere|eshtri|esht[ei]ri|bayt|beit|ard|ma2lak|malek|3ared|a3red|ba3d|lahalla2|hala2|halla|yalla|tamem|tmem|shukran|merci|inshallah|ekhtiar|fares|s3er|msh)\b|[a-z][2-9][a-z]|[a-z][2-9]\b/i;
const FRENCH = /\b(bonjour|salut|je (cherche|voudrais|veux|suis|souhaite)|un appartement|louer|acheter|vendre|prix|combien|chambres?|meubl[eé]|quartier|merci|s'il (vous|te) pla[iî]t|budget|visite|propri[eé]taire|bien immobilier|disponible|chez|pour|avec|dans|une|des|les|est-ce)\b/i;
const EN_STRONG = /\b(i|looking|want|buy|rent|apartment|budget|bedroom|bedrooms|please|thanks|hello|hi|how|much|the|and|with|for|in|to|a)\b/i;

export function detectLanguage(text, previous = 'en') {
  const t = String(text || '');
  const arabic = (t.match(/[؀-ۿ]/g) || []).length;
  const latin = (t.match(/[a-zA-Z]/g) || []).length;
  if (arabic > 0 && arabic >= latin * 0.5) return 'ar';
  if (!latin) return previous;
  const words = t.toLowerCase().split(/\s+/).filter(Boolean);
  const ar = words.filter((w) => ARABIZI.test(w)).length;
  const fr = words.filter((w) => FRENCH.test(w)).length + (/[éèêàçùôî]/i.test(t) ? 1 : 0);
  const en = words.filter((w) => EN_STRONG.test(w) && !ARABIZI.test(w)).length;
  if (ar > 0 && ar >= fr && ar >= Math.max(1, en * 0.5)) return 'arabizi';
  if (fr > en && fr >= 1) return 'fr';
  if (en > 0) return 'en';
  return previous;
}
/** Is the message written in a Latin script? */
export const isArabic = (l) => l === 'ar' || l === 'arabizi';
