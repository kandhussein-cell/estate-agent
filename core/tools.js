import { validateInput } from './validate.js';
import { canonicalArea, canonicalFeature, FEATURE_KEYS } from './areas.js';
import { bookSlot, checkSlot, freeSlots } from './scheduling.js';
import { agentById } from './offices.js';
import { emitEvent } from './events.js';
import { getConversation, getLead, getListing, listingRow, recomputeLead } from './store.js';
import { humanSlot, isValidLocal, nowLocal } from './time.js';
import { j } from './db.js';

const S = (extra = {}) => ({ type: 'string', maxLength: 500, ...extra });

/** Tool definitions in Anthropic format. `input_schema` is also used for server-side validation. */
export const TOOL_DEFS = [
  { name: 'search_listings', description: 'Search available listings. Always call before recommending anything. Returns up to 3 best matches (exact or closest alternatives, flagged by "exact").',
    input_schema: { type: 'object', required: ['type'], properties: {
      type: { type: 'string', enum: ['sale', 'rent'], description: 'sale = buying, rent = renting' },
      min_price: { type: 'number', minimum: 0, description: 'USD (monthly for rent)' }, max_price: { type: 'number', minimum: 0, description: 'USD (monthly for rent)' },
      area: S({ description: 'Area name, e.g. Hadath, Achrafieh, Hamra' }), bedrooms: { type: 'integer', minimum: 0, maximum: 10 },
      furnished: { type: 'boolean' }, features: { type: 'array', maxItems: 6, items: { type: 'string', enum: FEATURE_KEYS }, description: 'Required features' },
      category: S({ enum: ['apartment', 'duplex', 'studio', 'office', 'shop', 'land', 'villa'] }) } } },
  { name: 'get_listing', description: 'Full details of one listing by id.', input_schema: { type: 'object', required: ['id'], properties: { id: { type: 'integer', minimum: 1 } } } },
  { name: 'compare_listings', description: 'Side-by-side comparison of 2-3 listings.', input_schema: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', maxItems: 3, items: { type: 'integer', minimum: 1 } } } } },
  { name: 'check_viewing_slots', description: 'Free viewing slots for a listing (real calendar of the listing agent). Offer 2-3 of them.',
    input_schema: { type: 'object', required: ['listing_id'], properties: { listing_id: { type: 'integer', minimum: 1 },
      date_range: { type: 'object', properties: { from: S({ description: 'YYYY-MM-DD' }), to: S({ description: 'YYYY-MM-DD' }) } } } } },
  { name: 'book_viewing', description: 'Book a viewing. Only after the customer chose a slot and gave name + phone. datetime format YYYY-MM-DDTHH:mm (local time) taken from check_viewing_slots.',
    input_schema: { type: 'object', required: ['listing_id', 'name', 'phone', 'datetime'], properties: { listing_id: { type: 'integer', minimum: 1 }, name: S({ maxLength: 80 }), phone: S({ maxLength: 30 }), datetime: S({ maxLength: 16 }) } } },
  { name: 'cancel_or_reschedule_viewing', description: 'Cancel a viewing, or reschedule when new_datetime is given. Requires the phone used for the booking.',
    input_schema: { type: 'object', required: ['phone', 'viewing_id'], properties: { phone: S({ maxLength: 30 }), viewing_id: { type: 'integer', minimum: 1 }, new_datetime: S({ maxLength: 16 }) } } },
  { name: 'save_or_update_lead', description: 'Save what you learned about the customer. Call whenever you learn something new (name, phone, budget, area, etc.).',
    input_schema: { type: 'object', properties: { name: S({ maxLength: 80 }), phone: S({ maxLength: 30 }), intent: { type: 'string', enum: ['buy', 'rent', 'owner'] },
      budget: { type: 'number', minimum: 0, description: 'USD (monthly if renting)' }, areas: { type: 'array', maxItems: 5, items: S({ maxLength: 40 }) }, bedrooms: { type: 'integer', minimum: 0, maximum: 10 },
      furnished: { type: 'boolean' }, timeline: S({ maxLength: 120 }), financing: { type: 'string', enum: ['cash', 'loan', 'payment_plan', 'unknown'] },
      decision_maker: S({ maxLength: 120 }), notes: S({ maxLength: 500 }) } } },
  { name: 'create_owner_lead', description: 'Register a property owner who wants to list their property with us.',
    input_schema: { type: 'object', required: ['name', 'phone', 'rent_or_sale'], properties: { name: S({ maxLength: 80 }), phone: S({ maxLength: 30 }),
      property_type: S({ maxLength: 60 }), area: S({ maxLength: 60 }), asking_price: { type: 'number', minimum: 0 }, rent_or_sale: { type: 'string', enum: ['rent', 'sale'] }, notes: S({ maxLength: 500 }) } } },
  { name: 'request_human_handoff', description: 'Flag the conversation for a human agent: angry customer, asks for a person, negotiates price, legal/mortgage questions, or a hot lead ready to close.',
    input_schema: { type: 'object', required: ['reason', 'urgency'], properties: { reason: S({ maxLength: 300 }), urgency: { type: 'string', enum: ['low', 'medium', 'high'] } } } },
];

/** Normalize Lebanese/international phone numbers to +E.164-ish. Returns null when invalid. */
export function normalizePhone(raw) {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = `+${d.slice(2)}`;
  if (d.startsWith('+')) d = `+${d.slice(1).replace(/\D/g, '')}`;
  else if (d.startsWith('961')) d = `+${d}`;
  else if (d.startsWith('0')) d = `+961${d.slice(1)}`;
  else if (/^\d{7,8}$/.test(d)) d = `+961${d}`;
  else d = `+${d}`;
  return /^\+\d{9,15}$/.test(d) ? d : null;
}

const fmtListing = (db, office, l, extra = {}) => {
  const booked = db.prepare(`SELECT COUNT(*) n FROM viewings WHERE office_id=? AND listing_id=? AND status='booked' AND start_at>=?`).get(office.id, l.id, nowLocal(office)).n;
  const agent = agentById(office, l.agent_id);
  return { id: l.id, ref: l.ref, title: l.title, type: l.type, category: l.category, area: l.area, price: l.price, currency: 'USD', price_unit: l.type === 'rent' ? 'per month' : 'total',
    price_per_m2: l.type === 'sale' && l.size_m2 ? Math.round(l.price / l.size_m2) : null, bedrooms: l.bedrooms, bathrooms: l.bathrooms, size_m2: l.size_m2, furnished: l.furnished,
    features: l.features, description: l.description, agent: agent?.name, upcoming_viewings_booked: booked, ...extra };
};
const card = (l, d) => ({ id: l.id, ref: l.ref, title: l.title, type: l.type, category: l.category, area: l.area, price: l.price, bedrooms: l.bedrooms, bathrooms: l.bathrooms,
  size_m2: l.size_m2, furnished: l.furnished, features: l.features, hue: l.hue, photos: l.photos, price_per_m2: d.price_per_m2, reason: d.match_reasons?.[0] || null, demand: d.upcoming_viewings_booked });

/** Rank listings against criteria. Returns scored candidates with reasons and mismatches. */
function rank(listings, q) {
  const area = q.area ? canonicalArea(q.area) || q.area : null;
  const feats = (q.features || []).map((f) => canonicalFeature(f) || f);
  return listings.map((l) => {
    let pts = 0; const reasons = []; const miss = [];
    if (area) { if (l.area.toLowerCase() === area.toLowerCase()) { pts += 40; reasons.push(`in ${l.area}`); } else miss.push(`area (${l.area})`); }
    let hard = false;
    if (q.max_price) { if (l.price <= q.max_price) { pts += 25; reasons.push('within budget'); } else { const over = Math.round((l.price / q.max_price - 1) * 100); miss.push(`${over}% over budget`); if (over <= 30) pts += 10 - over / 5; else { pts -= 20; hard = true; } } }
    if (q.min_price && l.price < q.min_price) { miss.push('below min price'); pts -= 3; }
    if (q.bedrooms != null) { if (l.bedrooms === q.bedrooms) { pts += 15; reasons.push(`${l.bedrooms} bedrooms`); } else if (l.bedrooms > q.bedrooms) { pts += 8; reasons.push(`${l.bedrooms} bedrooms (extra room)`); } else { miss.push(`only ${l.bedrooms} bedrooms`); pts -= 10; } }
    if (q.furnished != null) { if (l.furnished === q.furnished) { pts += 6; if (q.furnished) reasons.push('furnished'); } else miss.push(q.furnished ? 'not furnished' : 'furnished'); }
    for (const f of feats) { if (l.features.includes(f)) { pts += 5; reasons.push(f.replace(/_/g, ' ')); } else miss.push(`no ${f.replace(/_/g, ' ')}`); }
    if (q.category && l.category !== q.category) { miss.push(`category (${l.category})`); pts -= 15; hard = true; }
    return { l, pts, reasons, miss, hard };
  });
}

const HANDLERS = {
  search_listings(ctx, q) {
    const { db, office } = ctx;
    const rows = db.prepare('SELECT * FROM listings WHERE office_id=? AND available=1 AND type=?').all(office.id, q.type).map(listingRow);
    const ranked = rank(rows, q).sort((a, b) => b.pts - a.pts);
    const exact = ranked.filter((r) => r.miss.length === 0);
    const pick = (exact.length ? exact : ranked.filter((r) => !r.hard && r.pts > -15)).slice(0, 3);
    const results = pick.map((r) => fmtListing(db, office, r.l, { match_reasons: r.reasons, mismatches: r.miss }));
    ctx.touch?.('area', q.area);
    return {
      data: { exact_match: exact.length > 0, count: results.length, note: results.length === 0 ? 'No listings match; offer to notify the customer when new ones arrive.' : exact.length ? undefined : 'No exact match. These are the closest alternatives; mention honestly what differs (see mismatches).', results },
      ui: results.length ? { type: 'listings', exact: exact.length > 0, items: pick.map((r, i) => card(r.l, results[i])) } : undefined,
    };
  },
  get_listing(ctx, { id }) {
    const l = getListing(ctx.db, ctx.office.id, id);
    if (!l || !l.available) return { data: { error: 'not_found_or_unavailable' } };
    const d = fmtListing(ctx.db, ctx.office, l, { match_reasons: [] });
    return { data: d, ui: { type: 'listings', exact: true, items: [card(l, d)] } };
  },
  compare_listings(ctx, { ids }) {
    const ls = ids.map((id) => getListing(ctx.db, ctx.office.id, id)).filter(Boolean);
    if (ls.length < 2) return { data: { error: 'need_at_least_two_valid_listings' } };
    const rows = ls.map((l) => fmtListing(ctx.db, ctx.office, l));
    return { data: { listings: rows }, ui: { type: 'compare', items: ls.map((l, i) => card(l, rows[i])) } };
  },
  check_viewing_slots(ctx, { listing_id, date_range }) {
    const l = getListing(ctx.db, ctx.office.id, listing_id);
    if (!l || !l.available) return { data: { error: 'not_found_or_unavailable' } };
    const from = date_range?.from && /^\d{4}-\d{2}-\d{2}$/.test(date_range.from) ? `${date_range.from}T00:00` : undefined;
    const to = date_range?.to && /^\d{4}-\d{2}-\d{2}$/.test(date_range.to) ? date_range.to : undefined;
    const slots = freeSlots(ctx.db, ctx.office, l, { from, to, limit: 6, now: ctx.now });
    const lang = ctx.language || 'en';
    const out = slots.map((s) => ({ datetime: s.start, label: humanSlot(s.start, lang) }));
    return { data: { listing_id, listing: l.title, agent: agentById(ctx.office, l.agent_id)?.name, slots: out, note: out.length ? 'Offer 2-3 of these. Use datetime values exactly when booking.' : 'No free slots in that range; try another range or hand off.' },
      ui: out.length ? { type: 'slots', listing_id, title: l.title, slots: out.slice(0, 6) } : undefined };
  },
  book_viewing(ctx, a) {
    const { db, office } = ctx;
    const l = getListing(db, office.id, a.listing_id);
    if (!l || !l.available) return { data: { booked: false, reason: 'listing_unavailable' } };
    const phone = normalizePhone(a.phone);
    if (!phone) return { data: { booked: false, reason: 'invalid_phone', hint: 'Ask the customer for a valid phone number.' } };
    if (a.name.length < 2) return { data: { booked: false, reason: 'invalid_name' } };
    if (!isValidLocal(a.datetime)) return { data: { booked: false, reason: 'invalid_datetime', hint: 'Use YYYY-MM-DDTHH:mm from check_viewing_slots.' } };
    const conv = getConversation(db, office.id, ctx.conversationId);
    const r = bookSlot(db, office, l, { name: a.name, phone, start: a.datetime, leadId: conv?.lead_id ?? null, now: ctx.now });
    if (!r.ok) {
      const alt = freeSlots(db, office, l, { from: a.datetime, limit: 3, now: ctx.now }).map((s) => ({ datetime: s.start, label: humanSlot(s.start, ctx.language) }));
      return { data: { booked: false, reason: r.reason, alternatives: alt }, ui: alt.length ? { type: 'slots', listing_id: l.id, title: l.title, slots: alt } : undefined };
    }
    if (conv?.lead_id) {
      db.prepare("UPDATE leads SET name=COALESCE(name,?), phone=?, viewing_requested=1, updated_at=datetime('now') WHERE id=?").run(a.name, phone, conv.lead_id);
      recomputeLead(db, office, conv.lead_id);
    }
    emitEvent(office.id, 'viewing_booked', { viewing_id: r.id, listing_id: l.id, lead_id: conv?.lead_id, start: a.datetime });
    const conf = { viewing_id: r.id, listing_id: l.id, title: l.title, area: l.area, start: a.datetime, end: r.end, label: humanSlot(a.datetime, ctx.language), agent: r.agent.name, agent_phone: r.agent.phone, name: a.name };
    return { data: { booked: true, ...conf, reminders: 'We will send a reminder 24h and 2h before.' }, ui: { type: 'booking', ...conf } };
  },
  cancel_or_reschedule_viewing(ctx, a) {
    const { db, office } = ctx;
    const phone = normalizePhone(a.phone);
    const v = db.prepare("SELECT * FROM viewings WHERE office_id=? AND id=? AND status='booked'").get(office.id, a.viewing_id);
    // Identical response for "not found" and "wrong phone": never reveal other customers' bookings.
    if (!v || !phone || v.phone !== phone) return { data: { ok: false, reason: 'not_found' } };
    if (!a.new_datetime) {
      db.prepare("UPDATE viewings SET status='cancelled' WHERE id=?").run(v.id);
      emitEvent(office.id, 'viewing_cancelled', { viewing_id: v.id });
      return { data: { ok: true, action: 'cancelled', viewing_id: v.id } };
    }
    const l = getListing(db, office.id, v.listing_id);
    const c = checkSlot(db, office, l, a.new_datetime, { ignoreViewingId: v.id, now: ctx.now });
    if (!c.ok) {
      const alt = freeSlots(db, office, l, { from: a.new_datetime, limit: 3, now: ctx.now }).map((s) => ({ datetime: s.start, label: humanSlot(s.start, ctx.language) }));
      return { data: { ok: false, reason: c.reason, alternatives: alt } };
    }
    db.prepare('UPDATE viewings SET start_at=?, end_at=?, remind24=0, remind2=0 WHERE id=?').run(a.new_datetime, c.end, v.id);
    emitEvent(office.id, 'viewing_booked', { viewing_id: v.id, rescheduled: true });
    const conf = { viewing_id: v.id, listing_id: l.id, title: l.title, area: l.area, start: a.new_datetime, end: c.end, label: humanSlot(a.new_datetime, ctx.language), agent: c.agent.name, agent_phone: c.agent.phone, name: v.name };
    return { data: { ok: true, action: 'rescheduled', ...conf }, ui: { type: 'booking', ...conf } };
  },
  save_or_update_lead(ctx, a) {
    const { db, office } = ctx;
    const conv = getConversation(db, office.id, ctx.conversationId);
    if (!conv?.lead_id) return { data: { error: 'no_lead' } };
    const lead = getLead(db, office.id, conv.lead_id);
    const phone = a.phone ? normalizePhone(a.phone) : null;
    if (a.phone && !phone) return { data: { saved: false, reason: 'invalid_phone', hint: 'Ask for a valid phone number.' } };
    const areas = [...new Set([...lead.areas, ...(a.areas || []).map((x) => canonicalArea(x) || x)])].slice(0, 5);
    const notes = a.notes ? `${lead.notes ? lead.notes + '\n' : ''}${a.notes}` : lead.notes;
    db.prepare(`UPDATE leads SET name=COALESCE(?,name), phone=COALESCE(?,phone), intent=COALESCE(?,intent), budget=COALESCE(?,budget), areas=?, bedrooms=COALESCE(?,bedrooms),
      furnished=COALESCE(?,furnished), timeline=COALESCE(?,timeline), financing=COALESCE(?,financing), decision_maker=COALESCE(?,decision_maker), notes=?, language=?, updated_at=datetime('now') WHERE id=?`)
      .run(a.name ?? null, phone, a.intent ?? null, a.budget ?? null, JSON.stringify(areas), a.bedrooms ?? null, a.furnished == null ? null : a.furnished ? 1 : 0, a.timeline ?? null, a.financing ?? null, a.decision_maker ?? null, notes, conv.language, lead.id);
    const r = recomputeLead(db, office, lead.id);
    return { data: { saved: true, lead_score: r.score, temperature: r.temperature, missing: ['intent', 'budget', 'areas', 'bedrooms', 'timeline', 'financing'].filter((k) => { const v = { ...lead, ...a }[k]; return v == null || (Array.isArray(v) && !v.length); }) } };
  },
  create_owner_lead(ctx, a) {
    const { db, office } = ctx;
    const phone = normalizePhone(a.phone);
    if (!phone) return { data: { saved: false, reason: 'invalid_phone' } };
    const r = db.prepare('INSERT INTO owner_leads (office_id,name,phone,property_type,area,asking_price,rent_or_sale,notes) VALUES (?,?,?,?,?,?,?,?)')
      .run(office.id, a.name, phone, a.property_type ?? null, a.area ? canonicalArea(a.area) || a.area : null, a.asking_price ?? null, a.rent_or_sale, a.notes ?? '');
    const conv = getConversation(db, office.id, ctx.conversationId);
    if (conv?.lead_id) { db.prepare("UPDATE leads SET name=COALESCE(name,?), phone=?, intent='owner', updated_at=datetime('now') WHERE id=?").run(a.name, phone, conv.lead_id); recomputeLead(db, office, conv.lead_id); }
    emitEvent(office.id, 'owner_lead', { owner_lead_id: Number(r.lastInsertRowid) });
    return { data: { saved: true, owner_lead_id: Number(r.lastInsertRowid), next: 'An agent will call to arrange a valuation visit.' }, ui: { type: 'note', kind: 'owner' } };
  },
  request_human_handoff(ctx, a) {
    const { db, office } = ctx;
    const conv = getConversation(db, office.id, ctx.conversationId);
    db.prepare("UPDATE conversations SET handoff_reason=?, handoff_urgency=?, updated_at=datetime('now') WHERE id=?").run(a.reason, a.urgency, ctx.conversationId);
    if (conv?.lead_id) {
      db.prepare("UPDATE leads SET notes=?, updated_at=datetime('now') WHERE id=?").run(`${getLead(db, office.id, conv.lead_id).notes ? getLead(db, office.id, conv.lead_id).notes + '\n' : ''}[HANDOFF ${a.urgency}] ${a.reason}`, conv.lead_id);
      recomputeLead(db, office, conv.lead_id);
    }
    emitEvent(office.id, 'handoff', { conversation_id: ctx.conversationId, lead_id: conv?.lead_id, reason: a.reason, urgency: a.urgency });
    return { data: { handoff: true, urgency: a.urgency, office_hours: office.hours.label, instruction: 'Tell the customer a human agent will contact them shortly. Do not continue negotiating.' }, ui: { type: 'handoff', urgency: a.urgency } };
  },
};

/**
 * Validate and execute a tool. The model can only affect the DB through here.
 * @param {{db:any, office:object, conversationId:number, language?:string, now?:string, touch?:Function}} ctx
 * @returns {{data:object, ui?:object, error?:string}}
 */
export function runTool(ctx, name, input) {
  const def = TOOL_DEFS.find((t) => t.name === name);
  if (!def || !HANDLERS[name]) return { data: { error: `unknown_tool:${name}` }, error: 'unknown_tool' };
  const v = validateInput(def.input_schema, input);
  if (!v.ok) return { data: { error: 'invalid_input', details: v.errors }, error: 'invalid_input' };
  try { return HANDLERS[name](ctx, v.value); } catch (e) { return { data: { error: 'tool_failed' }, error: String(e.message) }; }
}
export { j };
