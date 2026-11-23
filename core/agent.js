import { getDb, j } from './db.js';
import { getOffice } from './offices.js';
import { buildSystemPrompt } from './prompt.js';
import { TOOL_DEFS, runTool } from './tools.js';
import { getProvider, providerName } from './llm/index.js';
import { T } from './llm/i18n.js';
import { detectLanguage } from './lang.js';
import { looksLikeInjection, rateLimitConversation, sanitizeInput } from './guard.js';
import { addMessage, getConversation, getLead, getMessages, getOrCreateConversation, recomputeLead } from './store.js';
import { bus, emitEvent } from './events.js';
import { maybeSummarize } from './summarize.js';
import { log } from './logger.js';

const MAX_TOOL_ROUNDS = 5;
// words a model uses to claim a viewing is booked / a property registered (en/fr/ar/arabizi)
const CLAIM = /((is|are|been|now|successfully|all|you're|you are) (booked|confirmed|set|registered)|booked (for|you|your)|(your|the) (viewing|visit|appointment)[^.!?]{0,40}(confirmed|booked)|confirmed (for|your)|i('ve| have) (booked|registered)|c.est (r[eé]serv|confirm)|(est|sont) (r[eé]serv|confirm)|r[eé]servation (est )?confirm|تم (ال)?(حجز|تأكيد|تسجيل)|حجزتلك|تأكدت الزيارة|ثبّ?تت ال|et2akadet el ziyara|7ajazt)/i;

/** Strips the hidden <chips>…</chips> suffix from a token stream and collects its options. */
export class ChipFilter {
  constructor() { this.buf = ''; this.swallow = false; this.raw = ''; }
  /** @returns {string} text that is safe to show now */
  push(delta) {
    if (this.swallow) { this.raw += delta; return ''; }
    this.buf += delta;
    const i = this.buf.indexOf('<chips');
    if (i >= 0) { const out = this.buf.slice(0, i); this.raw = this.buf.slice(i); this.buf = ''; this.swallow = true; return out; }
    // hold back a possible partial "<chips" prefix at the end
    const keep = (() => { for (let n = Math.min(6, this.buf.length); n > 0; n--) if ('<chips'.startsWith(this.buf.slice(-n))) return n; return 0; })();
    const out = this.buf.slice(0, this.buf.length - keep);
    this.buf = this.buf.slice(this.buf.length - keep);
    return out;
  }
  end() { const rest = this.swallow ? '' : this.buf; this.buf = ''; return rest; }
  chips() { const m = this.raw.match(/<chips>([\s\S]*?)(<\/chips>|$)/); return m ? m[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 3) : []; }
}

/** Convert stored messages to Anthropic format, annotating assistant turns with internal tool notes. */
export function toLlmMessages(rows) {
  const out = [];
  for (const m of rows) {
    let role; let content;
    if (m.role === 'user') { role = 'user'; content = m.content; }
    else if (m.role === 'assistant') { role = 'assistant'; content = m.content; }
    else if (m.role === 'human') { role = 'assistant'; content = `[human agent ${m.meta.agent || ''}]: ${m.content}`; }
    else continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === role && typeof prev.content === 'string') prev.content += `\n${content}`;
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

const noteFor = (name, data) => {
  if (name === 'search_listings') return `search_listings → ${data.results?.map((r) => `#${r.id} ${r.title} $${r.price}`).join(', ') || 'no results'}${data.exact_match === false ? ' (closest, not exact)' : ''}`;
  if (name === 'check_viewing_slots') return `slots for #${data.listing_id}: ${data.slots?.map((s) => s.datetime).join(', ')}`;
  if (name === 'book_viewing') return data.booked ? `booked viewing #${data.viewing_id} ${data.start}` : `booking failed: ${data.reason}`;
  return `${name} ok`;
};

async function callModel(args, hasEmitted) {
  const provider = getProvider();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await provider.complete(args); } catch (e) {
      lastErr = e;
      const status = e?.status;
      const retryable = !status || status === 429 || status >= 500 || /timeout|ECONN|network|overloaded/i.test(String(e?.message));
      log.warn('llm_error', { attempt, status, msg: String(e?.message).slice(0, 200) });
      if (!retryable || hasEmitted() || attempt === 1) break;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Core entry point, channel-agnostic.
 * @param {object} p
 * @param {string} p.officeId
 * @param {number} [p.conversationId]
 * @param {string} [p.externalId]   stable id of the customer on the channel (e.g. WhatsApp number)
 * @param {string} p.channel        'web' | 'whatsapp' | ...
 * @param {string} p.text           customer message
 * @param {(ev:object)=>void} [p.onEvent]  streaming callbacks: meta | delta | tool | ui | done
 * @param {string} [p.now]          override "now" (tests) as YYYY-MM-DDTHH:mm office-local
 * @param {object} [p.db]
 * @returns {Promise<{conversationId:number, replies:object[], mode:string}>}
 */
export async function handleMessage({ officeId, conversationId, externalId, channel = 'web', text, onEvent = () => {}, now, db = getDb() }) {
  const office = getOffice(officeId);
  const clean = sanitizeInput(text);
  let conv = getOrCreateConversation(db, office.id, { id: conversationId, channel, externalId, language: office.languages[0] });
  onEvent({ type: 'meta', conversationId: conv.id });
  if (!clean) return { conversationId: conv.id, replies: [], mode: conv.mode };

  if (!rateLimitConversation(`conv:${conv.id}`, { max: 25, windowMs: 60000 })) {
    const msg = 'You are sending messages too fast — please wait a moment. / الرجاء الانتظار قليلاً.';
    onEvent({ type: 'delta', text: msg }); onEvent({ type: 'done' });
    return { conversationId: conv.id, replies: [{ content: msg }], mode: conv.mode, rateLimited: true };
  }

  const isUiAction = /\(#\d+\)\s*$/.test(clean) || /^\s*(compare|comparer)\b.*#\d+/i.test(clean) || /^\s*قارن\s.*#\d+/.test(clean);
  const language = isUiAction ? conv.language : detectLanguage(clean, conv.language);
  if (language !== conv.language) db.prepare('UPDATE conversations SET language=? WHERE id=?').run(language, conv.id);
  conv.language = language;
  onEvent({ type: 'lang', language });
  const injection = looksLikeInjection(clean);
  addMessage(db, office.id, conv.id, 'user', clean, injection ? { flagged: 'injection' } : {});
  db.prepare("UPDATE leads SET last_customer_msg_at=datetime('now'), followup_stage=0, language=? WHERE id=?").run(language, conv.lead_id);
  recomputeLead(db, office, conv.lead_id);
  emitEvent(office.id, 'message', { conversation_id: conv.id, lead_id: conv.lead_id, role: 'user' });
  bus.emit(`conv:${conv.id}`, { type: 'message', role: 'user' });

  if (conv.mode === 'human') { onEvent({ type: 'human_mode' }); onEvent({ type: 'done' }); return { conversationId: conv.id, replies: [], mode: 'human' }; }

  const startedAt = Date.now();
  let emitted = false;
  const filter = new ChipFilter();
  let fullText = '';
  const uis = []; const notes = []; const successes = new Set();
  let stateUpdate = {};
  const emitText = (d) => { const v = filter.push(d); if (v) { emitted = true; fullText += v; onEvent({ type: 'delta', text: v }); } };

  try {
    await maybeSummarize(db, office, conv).catch((e) => log.warn('summarize_failed', { msg: e.message }));
    conv = getConversation(db, office.id, conv.id);
    const lead = getLead(db, office.id, conv.lead_id);
    const viewings = db.prepare("SELECT * FROM viewings WHERE office_id=? AND lead_id=? AND status='booked' ORDER BY start_at").all(office.id, lead.id);
    const rows = getMessages(db, conv.id, conv.summary_upto);
    const messages = toLlmMessages(rows);
    const toolNotes = rows.filter((r) => r.role === 'assistant' && r.meta.notes?.length).slice(-3).flatMap((r) => r.meta.notes);
    const system = buildSystemPrompt(office, { lead, conversation: conv, viewings, summary: conv.summary, injectionFlag: injection, toolNotes });
    const userHistory = rows.filter((r) => r.role === 'user').map((r) => r.content).slice(-30);
    const ctx = { db, office, conversationId: conv.id, language, now, touch: () => {} };
    let state = { ...conv.state };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (round > 0 && fullText && !fullText.endsWith(' ')) { /* separate rounds */ }
      const res = await callModel({ system, messages, tools: TOOL_DEFS, onText: emitText, ctx: { language, lead, state, userText: clean, userHistory, viewings } }, () => emitted);
      const tail = filter.end(); if (tail) { fullText += tail; emitted = true; onEvent({ type: 'delta', text: tail }); }
      if (res.stateUpdate) { stateUpdate = { ...stateUpdate, ...res.stateUpdate }; state = { ...state, ...res.stateUpdate }; }
      const uses = res.content.filter((b) => b.type === 'tool_use');
      if (!uses.length) break;
      messages.push({ role: 'assistant', content: res.content });
      const results = [];
      for (const u of uses) {
        onEvent({ type: 'tool', name: u.name });
        const r = runTool(ctx, u.name, u.input);
        log.info('tool', { name: u.name, ok: !r.error, conv: conv.id });
        notes.push(noteFor(u.name, r.data));
        if (!r.error && (r.data.booked || r.data.saved || r.data.ok)) successes.add(u.name);
        if (r.ui) { uis.push(r.ui); onEvent({ type: 'ui', ui: r.ui }); }
        if (u.name === 'search_listings' && r.data.results) state = { ...state, shown: r.data.results.map((x) => ({ id: x.id, title: x.title, price: x.price, type: x.type, area: x.area })), lastSearch: u.input };
        if (u.name === 'check_viewing_slots' && r.data.slots) state = { ...state, slots: r.data.slots, slotListing: r.data.listing_id };
        if (u.name === 'book_viewing' && r.data.booked) state = { ...state, slots: [], slotListing: null };
        stateUpdate = { ...stateUpdate, ...Object.fromEntries(['shown', 'lastSearch', 'slots', 'slotListing'].filter((k) => state[k] !== conv.state[k]).map((k) => [k, state[k]])) };
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(r.data), is_error: !!r.error });
      }
      messages.push({ role: 'user', content: results });
      if (round === MAX_TOOL_ROUNDS - 1) break;
    }
    // Truthfulness guard: never let the model claim a booking/registration its tools did not perform.
    const claimed = CLAIM.test(fullText);
    if (claimed && !successes.has('book_viewing') && !successes.has('cancel_or_reschedule_viewing') && !successes.has('create_owner_lead')) {
      fullText = T[language in T ? language : 'en'].notBooked();
      onEvent({ type: 'replace', text: fullText });
      log.warn('hallucinated_confirmation_blocked', { conv: conv.id });
    }
    const chips = filter.chips();
    if (!fullText.trim()) fullText = T[language in T ? language : 'en'].error();
    const id = addMessage(db, office.id, conv.id, 'assistant', fullText.trim(), { ui: uis, chips, notes, ms: Date.now() - startedAt });
    db.prepare('UPDATE conversations SET state=? WHERE id=?').run(JSON.stringify({ ...conv.state, ...stateUpdate }), conv.id);
    db.prepare("UPDATE leads SET last_reply_at=datetime('now') WHERE id=?").run(conv.lead_id);
    recomputeLead(db, office, conv.lead_id);
    onEvent({ type: 'chips', chips });
    onEvent({ type: 'done', messageId: id });
    emitEvent(office.id, 'message', { conversation_id: conv.id, lead_id: conv.lead_id, role: 'assistant' });
    return { conversationId: conv.id, replies: [{ id, content: fullText.trim(), ui: uis, chips }], mode: conv.mode, provider: providerName(), tools: notes };
  } catch (e) {
    log.error('agent_failed', { msg: e.message, stack: e.stack?.split('\n').slice(0, 3).join(' | ') });
    const msg = T[language in T ? language : 'en'].error();
    if (!emitted) onEvent({ type: 'delta', text: msg });
    addMessage(db, office.id, conv.id, 'assistant', fullText.trim() ? `${fullText.trim()} ${msg}` : msg, { error: true });
    emitEvent(office.id, 'agent_error', { conversation_id: conv.id });
    onEvent({ type: 'done', error: true });
    return { conversationId: conv.id, replies: [{ content: msg }], mode: conv.mode, error: true };
  }
}

export { j };
