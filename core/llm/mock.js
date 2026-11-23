import { areasInText, featuresInText, norm } from '../areas.js';
import { looksLikeInjection } from '../guard.js';
import { normalizePhone } from '../tools.js';
import { T, price } from './i18n.js';

/**
 * Offline demo "LLM": a deterministic rule-based policy that speaks the same protocol as the real model
 * (tool_use blocks in, tool_result blocks back, then text). Lets the whole product run with no API key
 * and makes the scenario tests deterministic. NOT a substitute for the real model in production.
 */

const RX = {
  angry: /(angry|furious|unacceptable|terrible|worst|scam|rip.?off|waste of (my )?time|complain|nobody (called|replied|answered)|disgust|ridiculous|useless|مش معقول|زفت|نصب|حرامي|عصبت|أسوأ|اسوأ|بدي اشتكي|مقرف|اشتكي|inadmissible|scandale|arnaque|inacceptable|furieux|nul\b|pas s[eé]rieux|honteux|3asabeyet|mesh ma3'?ool|zeft)/i,
  human: /(real person|human|speak (to|with) (a |an )?(agent|someone|person|manager)|talk to (a |an )?(agent|someone|person|manager)|call me|manager|agent please|بدي احكي مع|حدا حقيقي|مدير|اتصل(وا)? فيي|personne r[eé]elle|conseiller|parler [àa] (quelqu|un)|rappelez-moi|bade a7ki ma3|7ada 7a2i2i|3ayetlo?ne)/i,
  negotiate: /(discount|negotiat|lower the price|best price|final price|reduce the price|can you do|تخفيض|خصم|ينزل السعر|بتنزل|negocier|n[eé]gocier|rabais|baisser le prix|bi nazzel|tnazzel|ente nazzel|se3er nehe2i)/i,
  legal: /(mortgage|legal|lawyer|tax|foreigners? (can|allowed)|ownership law|قانون|محامي|ضريبة|رهن عقاري|juridique|notaire|imp[oô]t|hypoth[eè]que|ma7ami|dari?be)/i,
  offtopic: /(weather|joke|poem|recipe|bitcoin|crypto|politics|football|capital of|write (me )?(some )?code|translate|homework|الطقس|نكتة|meteo|m[eé]t[eé]o|blague)/i,
  owner: /(my (apartment|property|house|flat|land|shop|villa|building|office|place)|list (my|a|an|the)|sell my|rent out|i('m| am) (an? )?owner|owner of|بدي (بيع|أجّر|اجر|أأجر|عرض)|عندي (شقة|بيت|أرض|محل|مكتب)|عقاري|3endi (sha2a|beit|bayt|ard|ma7al)|baddi (be3|bee3|ejjer|ajjer|a3red)|ba3 sha2a|propri[eé]taire|mettre (mon|ma|en vente|en location)|(vendre|louer) (mon|ma)|je (veux|voudrais) (vendre|louer) )/i,
  rent: /(\brent|\brenting|\blease|esta2jer|ista2jer|esta2ger|ejar\b|2ejar|2eijar|\bloyer|louer|location|إيجار|ايجار|استأجر|استاجر|أجار|اجار|للإيجار)/i,
  buy: /(\bbuy|buying|purchase|for sale|eshtri|ashtri|shtri|eshtere|ichtiri|acheter|achat|acqu[eé]rir|اشتري|شراء|أشتري|تملك|للبيع|shere\b)/i,
  viewing: /(\bview(ing)?\b|see (it|the|this)|visit|\bbook|schedule|appointment|زيارة|بدي شوف|بدي زور|موعد|احجز|visite|rendez-vous|\bvoir\b|r[eé]server|shoufo|bade? shouf|zyara|ziyara|maw3ad|mawid|a7jez|ahjez)/i,
  expensive: /(too (expensive|high|much)|expensive|pricey|over (my )?budget|غالي|كتير غالي|ghale|cher|trop cher|ktir ghale|ghalyeh)/i,
  think: /(think about it|let me think|get back to you|بفكر|رح فكر|هفكر|nfakker|je vais r[eé]fl[eé]chir|r[eé]fl[eé]chir|bfakker)/i,
  greeting: /^\s*(hi+|hello+|hey+|hola|salut|bonjour|bonsoir|marhaba|mar7aba|merhaba|ahla+|ahlan|salam|hallo|مرحبا|اهلا|أهلا|هلا|سلام|صباح الخير|مساء الخير|good (morning|evening|afternoon))[\s!.,؟?]*$/i,
  yes: /^\s*(yes|yeah|yep|sure|ok(ay)?|please|oui|d'accord|eh|aywa|ayw[ae]|iy|إي|ايوه|أكيد|تمام|طبعاً|yalla|yala|ok)\b/i,
  cancel: /(cancel|annuler|الغي|إلغاء|elghi)/i,
};

const num = (s, suffix = '') => {
  let t = String(s).trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  t = t.replace(/,/g, '');
  let n = parseFloat(t);
  if (/^(k|الف|ألف)$/i.test(suffix)) n *= 1000;
  if (/^m$/i.test(suffix)) n *= 1e6;
  return n;
};

const ORD = [/^\s*(1|١)\s*$|first|1st|الأول|الاولى|الأولى|premier|awwal|el awwale?/i, /^\s*(2|٢)\s*$|second|2nd|الثاني|التانية|الثانية|deuxi[eè]me|tene|el tene/i, /^\s*(3|٣)\s*$|third|3rd|الثالث|التالتة|troisi[eè]me|talet/i];

/** Pull structured facts out of free text. */
export function extract(text) {
  const raw = String(text || '');
  const out = {};
  const phoneM = raw.match(/(?:\+|00)?\d[\d\s\-().]{6,16}\d/g);
  let t = raw;
  if (phoneM) { for (const p of phoneM) { const ph = normalizePhone(p); if (ph && p.replace(/\D/g, '').length >= 8) { out.phone = ph; t = t.replace(p, ' '); break; } } }
  const n = norm(t);
  const na = t.replace(/[إأآ]/g, 'ا'); // Arabic hamza variants → plain alef
  if (RX.owner.test(t) || RX.owner.test(na)) out.owner = true;
  if (RX.rent.test(t) || RX.rent.test(na)) out.intent = 'rent';
  else if (RX.buy.test(t) || RX.buy.test(na)) out.intent = 'buy';
  if (out.owner) out.intent = 'owner';
  let m;
  if ((m = t.match(/(?:\$|usd\s*)\s*(\d[\d,.]*)\s*(k|m)?/i))) out.budget = num(m[1], m[2] || '');
  else if ((m = t.match(/(\d[\d,.]*)\s*(k|m|الف|ألف)?\s*(?:\$|usd|dollars?|دولار|دولارات|dolar|euros?)/i))) out.budget = num(m[1], m[2] || '');
  else if ((m = t.match(/(?:budget|asking|price|max(?:imum)?|under|up to|around|about|حدود|ميزانية|ميزانيتي|بين|jusqu'?[àa]|environ|s[e3]3er|se3rak|maximum)[^\d]{0,18}(\d[\d,.]*)\s*(k|m|الف|ألف)?/i))) out.budget = num(m[1], m[2] || '');
  else if ((m = t.match(/\b(\d{2,4})\s*(k|الف|ألف)\b/i))) out.budget = num(m[1], m[2]);
  if ((m = t.match(/(\d)\s*(?:br\b|bed|beds|bedrooms?|bdr|غرف|غرفة|chambres?|ch\b|ghoraf|ghorfe|ghorfet)/i))) out.bedrooms = Number(m[1]);
  else if (/غرفتين|ghorfetein|2 ghoraf/i.test(t)) out.bedrooms = 2;
  else if (/\bstudio\b|استوديو/i.test(t)) { out.bedrooms = 0; out.category = 'studio'; }
  if (/\bunfurnished|non meubl|غير مفروش|ghayr (mafroush|mfarrash)|bala (farsh|mafroush)/i.test(t)) out.furnished = false;
  else if (/\bfurnished|meubl|مفروش|mafroush|mfarrash|mafrousheh/i.test(t)) out.furnished = true;
  const areas = areasInText(t);
  if (areas.length) out.areas = areas;
  const feats = featuresInText(t);
  if (feats.length) out.features = feats;
  if (/\boffice\b|\bbureau\b|مكتب|maktab/i.test(t)) out.category = 'office';
  else if (/\bshop\b|boutique|\bmagasin\b|محل|ma7al/i.test(t)) out.category = 'shop';
  else if (/\bland\b|terrain|أرض|\bard\b/i.test(t) && !out.owner) out.category = 'land';
  else if (/\bduplex\b|دوبلكس/i.test(t)) out.category = 'duplex';
  else if (/\bvilla\b|فيلا/i.test(t)) out.category = 'villa';
  if ((m = t.match(/(asap|urgent(ly)?|this month|next month|next week|within \d+ \w+|in \d+ (weeks?|months?)|\d+ (weeks?|months?)|soon|just (looking|exploring)|no rush|هلق|بأقرب وقت|الشهر الجاي|هالشهر|ce mois(-ci)?|le mois prochain|bient[oô]t|rapidement|je regarde|el shahr el jey|hal shahr|bsor3a|3ajel|bas 3am shoof)/i))) out.timeline = m[1];
  if (/\bcash\b|كاش|cash/i.test(t)) out.financing = 'cash';
  else if (/payment plan|installments?|تقسيط|taqsit|facilit[eé]s/i.test(t)) out.financing = 'payment_plan';
  else if (/\bloan\b|قرض|\bpr[eê]t\b|bank loan/i.test(t)) out.financing = 'loan';
  if ((m = t.match(/(?:my name is|i'?m|i am|this is|ismi|esmi|ana|اسمي|أنا|je m'?appelle|je suis|c'?est)\s+([A-Za-z\u00C0-\u017F\u0600-\u06FF][\w\u00C0-\u017F\u0600-\u06FF'-]{1,20}(?:\s+[A-Za-z\u00C0-\u017F\u0600-\u06FF][\w\u00C0-\u017F\u0600-\u06FF'-]{1,20})?)/i))) {
    const cand = m[1].trim();
    if (!/^(looking|an|a|the|interested|from|in|owner|not|here|baddi|bade|want|searching|trying)\b/i.test(cand)) out.name = cand;
  }
  void n;
  out._raw = raw;
  return out;
}

const hasToolResults = (messages) => {
  const last = [...messages].reverse().find((m) => m.role === 'user' && typeof m.content === 'string');
  const idx = messages.lastIndexOf(last);
  return messages.slice(idx + 1);
};
const uid = () => `toolu_mock_${Math.random().toString(36).slice(2, 10)}`;
const callMsg = (calls) => ({ content: calls.map((c) => ({ type: 'tool_use', id: uid(), name: c.name, input: c.input })), stop_reason: 'tool_use' });
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const textMsg = (text, chips, stateUpdate) => (text = cap(text), { content: [{ type: 'text', text: chips?.length ? `${text}\n<chips>${chips.join(' | ')}</chips>` : text }], stop_reason: 'end_turn', stateUpdate });

/** Streams text in small chunks to mimic token streaming. */
async function emit(onText, res) {
  if (!onText) return res;
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parts = text.match(/\S+\s*/g) || [];
  for (const p of parts) { onText(p); await new Promise((r) => setTimeout(r, 12)); }
  return res;
}

/** Same signature as the Anthropic provider; extra `ctx` carries conversation facts. */
export async function complete({ messages, onText, ctx }) {
  const turn = hasToolResults(messages);
  const lang = ctx.language in T ? ctx.language : 'en';
  const t = T[lang];
  const res = turn.length ? compose(turn, ctx, t, lang) : plan(ctx, t, lang);
  return emit(onText, res);
}

/* ---------------------------- planning (before tools) ---------------------------- */

function profile(ctx) {
  const lead = ctx.lead || {};
  const facts = { intent: lead.intent, budget: lead.budget, areas: [...(lead.areas || [])], bedrooms: lead.bedrooms, name: lead.name, phone: lead.phone, timeline: lead.timeline, financing: lead.financing, furnished: lead.furnished };
  let features = []; let category;
  for (const txt of ctx.userHistory) {
    const e = extract(txt);
    for (const k of ['intent', 'budget', 'bedrooms', 'phone', 'timeline', 'financing', 'furnished', 'name']) if (e[k] !== undefined && !(k === 'intent' && e.owner === undefined && facts.intent === 'owner' && false)) facts[k] = e[k];
    if (e.areas) facts.areas = [...new Set([...e.areas])];
    if (e.features) features = [...new Set([...features, ...e.features])];
    if (e.category) category = e.category;
  }
  return { ...facts, features, category };
}

function plan(ctx, t, lang) {
  const text = ctx.userText;
  const e = extract(text);
  const st = ctx.state || {};
  const p = profile(ctx);
  const name = p.name;
  const stateUpdate = {};

  if (looksLikeInjection(text)) return textMsg(t.injection(), t.chipsIntent);
  if (RX.angry.test(text)) return callMsg([{ name: 'request_human_handoff', input: { reason: `Customer upset: "${text.slice(0, 160)}"`, urgency: 'high' } }]);
  if (RX.human.test(text)) return callMsg([{ name: 'request_human_handoff', input: { reason: 'Customer asked to speak with a human agent', urgency: 'medium' } }]);
  if (RX.negotiate.test(text)) return callMsg([{ name: 'request_human_handoff', input: { reason: 'Customer wants to negotiate the price', urgency: 'medium' } }]);
  if (RX.legal.test(text)) return callMsg([{ name: 'request_human_handoff', input: { reason: 'Legal/mortgage/tax question needs a licensed human', urgency: 'medium' } }]);
  if (RX.offtopic.test(text) && !e.intent) return textMsg(t.offtopic(), t.chipsIntent);
  if (RX.greeting.test(text) && !p.intent) return textMsg(t.greet(), t.chipsIntent);

  // ---- owner flow ----
  if (e.owner || st.owner) {
    const o = { ...(st.owner || {}) };
    if (e.name) o.name = e.name;
    if (e.phone) o.phone = e.phone;
    if (e.areas?.length) o.area = e.areas[0];
    if (e.budget) o.asking_price = e.budget;
    if (e.category) o.property_type = e.category;
    else if (/apartment|flat|sha2a|شقة|appartement/i.test(text)) o.property_type = 'apartment';
    else if (/house|villa|بيت|maison/i.test(text) && !o.property_type) o.property_type = 'house';
    if (/\b(rent|ejar|louer|إيجار|لإيجار|اجر|ajjer|ejjer)\b/i.test(text) || (RX.rent.test(text) && !o.rent_or_sale)) o.rent_or_sale = 'rent';
    if (/\b(sell|sale|vendre|بيع|للبيع|be3|bee3|bey3)\b/i.test(text) || /sell/i.test(text)) o.rent_or_sale = 'sale';
    if (st.asked === 'name' && !o.name && text.split(/\s+/).length <= 3 && !/\d/.test(text)) o.name = text.trim();
    if (!o.name) return textMsg(t.ownerAsk.name(), null, { owner: o, asked: 'name' });
    if (!o.phone) return textMsg(t.ownerAsk.phone(o.name), null, { owner: o, asked: 'phone' });
    if (!o.area) return textMsg(t.ownerAsk.area(), t.chipsArea, { owner: o, asked: 'area' });
    if (!o.property_type) return textMsg(t.ownerAsk.type(), null, { owner: o, asked: 'type' });
    if (!o.rent_or_sale || !o.asking_price) return textMsg(t.ownerAsk.price(), null, { owner: o, asked: 'price' });
    return { ...callMsg([{ name: 'create_owner_lead', input: { name: o.name, phone: o.phone, property_type: o.property_type, area: o.area, asking_price: o.asking_price, rent_or_sale: o.rent_or_sale } }]), stateUpdate: { owner: null, asked: null } };
  }

  // ---- cancel ----
  if (RX.cancel.test(text) && e.phone && ctx.viewings?.[0]) {
    return callMsg([{ name: 'cancel_or_reschedule_viewing', input: { phone: e.phone, viewing_id: ctx.viewings[0].id } }]);
  }

  // ---- slot chosen -> booking ----
  const slots = st.slots || [];
  if (slots.length && st.slotListing) {
    let chosen = null;
    const flat = (s) => norm(s).replace(/[^a-z0-9\u0600-\u06ff]/g, '');
    if (!chosen) chosen = slots.find((s) => flat(text).includes(flat(s.label)));
    if (!chosen) { const ix = ORD.findIndex((r) => r.test(text.trim())); if (ix >= 0 && slots[ix]) chosen = slots[ix]; }
    if (!chosen) { const hm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|h)?\b/i); if (hm && /at|ب|à|a |\d:\d/.test(text) && !e.phone) { const hh = String(hm[1]).padStart(2, '0'); chosen = slots.find((s) => s.datetime.slice(11, 13) === hh); } }
    if (chosen) {
      if (name && p.phone) return { ...callMsg([{ name: 'book_viewing', input: { listing_id: st.slotListing, name, phone: p.phone, datetime: chosen.datetime } }]), stateUpdate: { chosenSlot: null } };
      if (name && !p.phone) return textMsg(t.askPhone(name), null, { chosenSlot: chosen.datetime, asked: 'contact' });
      return textMsg(t.askContact(chosen.label), null, { chosenSlot: chosen.datetime, asked: 'contact' });
    }
  }
  if (st.chosenSlot && st.asked === 'contact') {
    let nm2 = name;
    if (!nm2) { const cleaned = text.replace(/(?:\+|00)?\d[\d\s\-().]{6,16}\d/g, '').replace(/[,;:]/g, ' ').trim(); if (cleaned && cleaned.split(/\s+/).length <= 4) nm2 = cleaned; }
    if (nm2 && p.phone) return { ...callMsg([{ name: 'book_viewing', input: { listing_id: st.slotListing, name: nm2, phone: p.phone, datetime: st.chosenSlot } }]), stateUpdate: { chosenSlot: null, asked: null } };
    if (nm2) return textMsg(t.askPhone(nm2), null, { asked: 'contact' });
    return textMsg(t.badPhone(), null, { asked: 'contact' });
  }

  // ---- viewing request ----
  const idM = text.match(/#(\d+)/);
  const listingId = idM ? Number(idM[1]) : st.shown?.[0]?.id;
  if (RX.viewing.test(text) && listingId) {
    return callMsg([{ name: 'check_viewing_slots', input: { listing_id: listingId } }]);
  }
  if (idM && /compare|قارن|comparer|qaren/i.test(text)) {
    const ids = [...text.matchAll(/#(\d+)/g)].map((x) => Number(x[1]));
    if (ids.length >= 2) return callMsg([{ name: 'compare_listings', input: { ids: ids.slice(0, 3) } }]);
  }
  if (/compare|قارن|comparer|qaren/i.test(text) && (st.shown?.length || 0) >= 2) return callMsg([{ name: 'compare_listings', input: { ids: st.shown.slice(0, 3).map((s) => s.id) } }]);

  // ---- price question about shown listings ----
  if (/(how much|price|se3er|s3er|kam|combien|prix|قديش|كم|بكم|سعر)/i.test(text) && st.shown?.length && !p.intent) {
    return textMsg(st.shown.slice(0, 2).map((l) => t.price({ ...l })).join(' '), t.chipsViewing);
  }

  // ---- objections ----
  if (RX.expensive.test(text) && st.lastSearch) {
    const q = { ...st.lastSearch }; q.max_price = Math.round((q.max_price || st.shown?.[0]?.price || 1000) * 0.85);
    return { ...callMsg([{ name: 'search_listings', input: q }]), stateUpdate: { objection: 'price' } };
  }
  if (RX.think.test(text)) return textMsg(t.objectionThink(), t.chipsThink, { asked: 'notify' });

  // ---- qualification + search ----
  const save = {};
  for (const k of ['name', 'phone', 'intent', 'budget', 'bedrooms', 'timeline', 'financing', 'furnished']) if (e[k] !== undefined) save[k] = e[k];
  if (e.areas) save.areas = e.areas;
  if (st.asked === 'budget' && !e.budget && /^\s*\d[\d,.]*\s*(k)?\s*$/i.test(text)) save.budget = num(text.replace(/\s/g, '').replace(/k$/i, ''), /k$/i.test(text.trim()) ? 'k' : '');
  if (st.asked === 'beds' && /^\s*\d\+?\s*$/.test(text)) save.bedrooms = parseInt(text, 10);
  if (st.asked === 'beds' && /studio|استوديو/i.test(text)) save.bedrooms = 0;
  if (st.asked === 'area' && !e.areas) { const a = areasInText(text); if (a.length) save.areas = a; }
  const intent = save.intent || p.intent;
  const merged = { ...p, ...save, areas: save.areas || p.areas, features: p.features };
  const hasCrit = intent && intent !== 'owner' && (merged.budget || merged.areas?.length || merged.category);
  const sig = JSON.stringify([intent, merged.budget, merged.areas, merged.bedrooms, merged.features, merged.category, merged.furnished]);
  const changed = sig !== st.lastSig;
  if (hasCrit && (changed || RX.viewing.test(text) || RX.yes.test(text) === false && false)) {
    const q = { type: intent === 'buy' ? 'sale' : 'rent' };
    if (merged.budget) q.max_price = merged.budget;
    if (merged.areas?.length) q.area = merged.areas[0];
    if (merged.bedrooms != null) q.bedrooms = merged.bedrooms;
    if (merged.furnished != null) q.furnished = merged.furnished;
    if (merged.features?.length) q.features = merged.features;
    if (merged.category) q.category = merged.category;
    const calls = [];
    if (Object.keys(save).length) calls.push({ name: 'save_or_update_lead', input: save });
    calls.push({ name: 'search_listings', input: q });
    return { ...callMsg(calls), stateUpdate: { lastSig: sig, lastSearch: q, asked: null } };
  }
  if (Object.keys(save).length && !changed) {
    // new info that does not change the search (name, phone, timeline...)
    const calls = [{ name: 'save_or_update_lead', input: save }];
    return callMsg(calls);
  }
  if (RX.yes.test(text) && st.shown?.length && st.asked !== 'notify') {
    return callMsg([{ name: 'check_viewing_slots', input: { listing_id: st.shown[0].id } }]);
  }
  if (st.asked === 'notify' && RX.yes.test(text)) {
    return callMsg([{ name: 'save_or_update_lead', input: { notes: 'Customer wants to be notified about new matching listings.' } }]);
  }
  if (Object.keys(save).length) return callMsg([{ name: 'save_or_update_lead', input: save }]);

  // ---- ask next missing item (one at a time) ----
  if (!intent) return textMsg(t.askIntent(), t.chipsIntent, { asked: 'intent' });
  if (!merged.budget) return textMsg(t.askBudget(intent), null, { asked: 'budget' });
  if (!merged.areas?.length) return textMsg(t.askArea(), t.chipsArea, { asked: 'area' });
  return textMsg(t.askIntent(), t.chipsIntent, stateUpdate);
}

/* ---------------------------- composing (after tools) ---------------------------- */

function compose(turn, ctx, t, lang) {
  const results = [];
  const uses = {};
  for (const m of turn) {
    if (m.role === 'assistant') for (const b of m.content) if (b.type === 'tool_use') uses[b.id] = b;
    if (m.role === 'user' && Array.isArray(m.content)) for (const b of m.content) if (b.type === 'tool_result') { try { results.push({ name: uses[b.tool_use_id]?.name, input: uses[b.tool_use_id]?.input, data: JSON.parse(b.content) }); } catch { /* ignore */ } }
  }
  const get = (n) => results.find((r) => r.name === n);
  const name = ctx.lead?.name || get('save_or_update_lead')?.input?.name;

  const b = get('book_viewing');
  if (b) {
    if (b.data.booked) return textMsg(t.booked(b.data), null, { slots: [], slotListing: null, asked: null });
    if (b.data.reason === 'invalid_phone') return textMsg(t.badPhone(), null, { asked: 'contact', chosenSlot: b.input.datetime });
    return textMsg(t.slotTaken(b.data.alternatives || []), null, { slots: (b.data.alternatives || []), chosenSlot: null });
  }
  const o = get('create_owner_lead');
  if (o) return textMsg(o.data.saved ? t.ownerSaved(name || o.input.name) : t.badPhone(), null);
  const h = get('request_human_handoff');
  if (h) return textMsg(t.handoff(h.data.urgency));
  const c = get('cancel_or_reschedule_viewing');
  if (c) return textMsg(c.data.ok ? t.cancelled() : t.notFound(), c.data.ok ? t.chipsViewing : null);
  const cmp = get('compare_listings');
  if (cmp) return textMsg(cmp.data.listings ? (lang === 'ar' ? 'هيدي مقارنة سريعة. أي واحد بيعجبك أكتر؟' : lang === 'fr' ? 'Voici une comparaison rapide. Lequel vous plaît le plus ?' : lang === 'arabizi' ? 'Hayda moqarane sari3a. Ay wahed 3ajabak aktar?' : 'Here is a quick comparison. Which one do you prefer?') : t.error(), t.chipsViewing);
  const s = get('check_viewing_slots');
  if (s) {
    const sl = s.data.slots || [];
    if (!sl.length) return textMsg(t.noSlots());
    return textMsg(t.slots(), null, { slots: sl, slotListing: s.data.listing_id, asked: 'slot' });
  }
  const sr = get('search_listings');
  if (sr) {
    const res = sr.data.results || [];
    const shown = res.map((l) => ({ id: l.id, title: l.title, price: l.price, type: l.type, area: l.area }));
    const stU = { shown, asked: 'viewing' };
    if (!res.length) return textMsg(t.none(name), null, { ...stU, asked: 'notify' });
    const top = { ...res[0], reason: res[0].match_reasons?.filter((r) => !r.startsWith('in ')).slice(0, 2).join(', ') };
    if (!sr.data.exact_match) return textMsg(t.closest(name, top), t.chipsViewing, stU);
    if (ctx.state?.objection === 'price') stU.objection = null;
    return textMsg(t.recs(name, top, res.length - 1, top.upcoming_viewings_booked), t.chipsViewing, stU);
  }
  const sv = get('save_or_update_lead');
  if (sv) {
    const missing = sv.data.missing || [];
    const intent = ctx.lead?.intent || sv.input.intent;
    if (sv.data.saved === false) return textMsg(t.badPhone());
    if (ctx.state?.asked === 'notify') return textMsg(t.ack(name), t.chipsIntent);
    if (missing.includes('budget')) return textMsg(`${t.ack(name)} ${t.askBudget(intent)}`, null, { asked: 'budget' });
    if (missing.includes('areas')) return textMsg(`${t.ack(name)} ${t.askArea()}`, t.chipsArea, { asked: 'area' });
    if (missing.includes('bedrooms')) return textMsg(`${t.ack(name)} ${t.askBeds()}`, t.chipsBeds, { asked: 'beds' });
    if (missing.includes('timeline')) return textMsg(`${t.ack(name)} ${t.askTimeline()}`, t.chipsTimeline, { asked: 'timeline' });
    return textMsg(t.ack(name), t.chipsViewing);
  }
  return textMsg(t.error());
}

export { price };
