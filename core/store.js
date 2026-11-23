import { j } from './db.js';
import { emitEvent } from './events.js';
import { scoreLead } from './scoring.js';
import { humanSlot, nowLocal } from './time.js';

/** Parse JSON columns of a listing row. */
export function listingRow(r) {
  if (!r) return null;
  return { ...r, features: j(r.features, []), photos: j(r.photos, []), furnished: !!r.furnished, available: !!r.available };
}
export function leadRow(r) {
  if (!r) return null;
  return { ...r, areas: j(r.areas, []), furnished: r.furnished == null ? null : !!r.furnished, viewing_requested: !!r.viewing_requested };
}
export const getListing = (db, officeId, id) => listingRow(db.prepare('SELECT * FROM listings WHERE office_id=? AND id=?').get(officeId, id));
export const getLead = (db, officeId, id) => leadRow(db.prepare('SELECT * FROM leads WHERE office_id=? AND id=?').get(officeId, id));
export const getConversation = (db, officeId, id) => {
  const r = db.prepare('SELECT * FROM conversations WHERE office_id=? AND id=?').get(officeId, id);
  return r ? { ...r, state: j(r.state, {}) } : null;
};

/** Find or create a conversation (and a lead stub so the dashboard is live from message one). */
export function getOrCreateConversation(db, officeId, { id, channel = 'web', externalId = null, language = 'en' } = {}) {
  let conv = id ? getConversation(db, officeId, id) : null;
  if (!conv && externalId) {
    const r = db.prepare('SELECT id FROM conversations WHERE office_id=? AND channel=? AND external_id=? ORDER BY id DESC LIMIT 1').get(officeId, channel, externalId);
    if (r) conv = getConversation(db, officeId, r.id);
  }
  if (conv) return conv;
  const lead = db.prepare('INSERT INTO leads (office_id,source,language,phone) VALUES (?,?,?,?)').run(officeId, channel, language, channel === 'whatsapp' ? externalId : null);
  const c = db.prepare('INSERT INTO conversations (office_id,lead_id,channel,external_id,language) VALUES (?,?,?,?,?)').run(officeId, lead.lastInsertRowid, channel, externalId, language);
  emitEvent(officeId, 'lead_created', { lead_id: Number(lead.lastInsertRowid), conversation_id: Number(c.lastInsertRowid) });
  return getConversation(db, officeId, Number(c.lastInsertRowid));
}

export function addMessage(db, officeId, conversationId, role, content, meta = {}) {
  const r = db.prepare('INSERT INTO messages (office_id,conversation_id,role,content,meta) VALUES (?,?,?,?,?)').run(officeId, conversationId, role, content, JSON.stringify(meta));
  db.prepare("UPDATE conversations SET updated_at=datetime('now') WHERE id=?").run(conversationId);
  return Number(r.lastInsertRowid);
}
export const getMessages = (db, conversationId, afterId = 0) =>
  db.prepare('SELECT * FROM messages WHERE conversation_id=? AND id>? ORDER BY id').all(conversationId, afterId).map((m) => ({ ...m, meta: j(m.meta, {}) }));

/** Plain-language 2-line summary generated from structured data (no LLM call needed). */
export function buildSummary(lead, viewings = []) {
  const bits = [];
  const intent = lead.intent === 'buy' ? 'buy' : lead.intent === 'rent' ? 'rent' : lead.intent === 'owner' ? 'list a property' : 'explore options';
  bits.push(`${lead.name || 'Visitor'} wants to ${intent}${lead.areas?.length ? ` in ${lead.areas.join(' / ')}` : ''}${lead.budget ? `, budget ≈ $${Math.round(lead.budget).toLocaleString('en-US')}${lead.intent === 'rent' ? '/mo' : ''}` : ''}${lead.bedrooms ? `, ${lead.bedrooms} BR` : ''}.`);
  const l2 = [];
  if (lead.timeline) l2.push(`Timeline: ${lead.timeline}`);
  if (lead.financing && lead.financing !== 'unknown') l2.push(`Financing: ${lead.financing.replace('_', ' ')}`);
  if (viewings.length) l2.push(`Viewing ${humanSlot(viewings[0].start_at)}`);
  if (lead.phone) l2.push('phone on file');
  return `${bits[0]}\n${l2.length ? l2.join(' · ') + '.' : 'Still gathering details.'}`;
}

/**
 * Recompute score/temperature/stage/summary for a lead and broadcast the change.
 * Called after every customer message and every tool write.
 */
export function recomputeLead(db, office, leadId) {
  const lead = getLead(db, office.id, leadId);
  if (!lead) return null;
  const conv = db.prepare('SELECT id FROM conversations WHERE lead_id=? ORDER BY id DESC LIMIT 1').get(leadId);
  const userMessages = conv ? db.prepare("SELECT COUNT(*) n FROM messages WHERE conversation_id=? AND role='user'").get(conv.id).n : 0;
  const viewings = db.prepare("SELECT * FROM viewings WHERE office_id=? AND lead_id=? AND status='booked' ORDER BY start_at").all(office.id, leadId);
  let areaMatches = lead.areas.length;
  if (lead.areas.length && lead.intent) {
    const ph = lead.areas.map(() => '?').join(',');
    areaMatches = db.prepare(`SELECT COUNT(*) n FROM listings WHERE office_id=? AND available=1 AND type=? AND area IN (${ph})`).get(office.id, lead.intent === 'buy' ? 'sale' : 'rent', ...lead.areas).n;
  }
  const { score, temperature } = scoreLead(lead, { userMessages, hasViewing: viewings.length > 0, areaMatches, fastReplies: true });
  let stage = lead.stage;
  if (stage === 'new' && lead.intent && (lead.budget || lead.areas.length)) stage = 'qualified';
  if (viewings.length && ['new', 'qualified'].includes(stage)) stage = 'viewing';
  const summary = buildSummary(lead, viewings);
  db.prepare("UPDATE leads SET score=?, temperature=?, stage=?, summary=?, updated_at=datetime('now') WHERE id=?").run(score, temperature, stage, summary, leadId);
  emitEvent(office.id, 'lead_updated', { lead_id: leadId, score, temperature, stage });
  return { score, temperature, stage, summary };
}

export const nowFor = (office) => nowLocal(office);

/** Per-office editable settings stored in the DB (company description + FAQ), layered over offices/<id>.json. */
export function getSettings(db, officeId) {
  const rows = db.prepare('SELECT key,value FROM office_settings WHERE office_id=?').all(officeId);
  const m = Object.fromEntries(rows.map((r) => [r.key, j(r.value)]));
  return { about: m.about || '', faq: Array.isArray(m.faq) ? m.faq : [] };
}
export function saveSettings(db, officeId, { about, faq }) {
  const up = db.prepare('INSERT INTO office_settings (office_id,key,value) VALUES (?,?,?) ON CONFLICT(office_id,key) DO UPDATE SET value=excluded.value');
  up.run(officeId, 'about', JSON.stringify(about || ''));
  up.run(officeId, 'faq', JSON.stringify(faq || []));
}
/** Office config merged with its dashboard-edited settings. */
export function withSettings(db, office) {
  const s = getSettings(db, office.id);
  return { ...office, about: s.about, faq: [...(office.faq || []), ...s.faq] };
}
