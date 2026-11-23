import cron from 'node-cron';
import { getDb } from './db.js';
import { getOffice, listOffices } from './offices.js';
import { config } from './config.js';
import { getProvider, providerName } from './llm/index.js';
import { deliver } from './delivery.js';
import { getListing, leadRow } from './store.js';
import { emitEvent } from './events.js';
import { hoursBetween, humanSlot, nowLocal } from './time.js';
import { log } from './logger.js';

const L = (lang) => (['ar', 'arabizi', 'fr'].includes(lang) ? lang : 'en');
const what = (lead, lang) => {
  const area = lead.areas?.[0];
  const rent = lead.intent === 'rent';
  const m = { en: `${rent ? 'a rental' : 'a property to buy'}${area ? ` in ${area}` : ''}`, fr: `${rent ? 'une location' : 'un bien à acheter'}${area ? ` à ${area}` : ''}`,
    ar: `${rent ? 'إيجار' : 'عقار للشراء'}${area ? ` بـ${area}` : ''}`, arabizi: `${rent ? 'ejar' : 'shere'}${area ? ` bi ${area}` : ''}` };
  return m[lang];
};
const TEMPLATES = {
  '24h': {
    en: (n, a, o, w) => `Hi${n ? ' ' + n : ''}, it's ${a} from ${o}. Still looking for ${w}? I can line up a quick viewing this week if you like.`,
    fr: (n, a, o, w) => `Bonjour${n ? ' ' + n : ''}, c'est ${a} de ${o}. Vous cherchez toujours ${w} ? Je peux organiser une visite cette semaine.`,
    ar: (n, a, o, w) => `مرحبا${n ? ' ' + n : ''}، أنا ${a} من ${o}. لساتك عم تدوّر على ${w}؟ فيني رتبلك زيارة هالأسبوع إذا بتحب.`,
    arabizi: (n, a, o, w) => `Marhaba${n ? ' ' + n : ''}, ana ${a} mn ${o}. Lesa 3am tdawwer 3ala ${w}? Fine rattbelak ziyara hal esbou3 eza bte7eb.`,
  },
  '72h': {
    en: (n, a, o, w) => `Hi${n ? ' ' + n : ''}, ${a} from ${o} again. New options for ${w} came in — want me to send the best ones?`,
    fr: (n, a, o, w) => `Bonjour${n ? ' ' + n : ''}, ${a} de ${o}. De nouvelles offres pour ${w} sont arrivées — je vous envoie les meilleures ?`,
    ar: (n, a, o, w) => `مرحبا${n ? ' ' + n : ''}، ${a} من ${o}. نزلو خيارات جديدة لـ${w}. بتحب ابعتلك أحسنها؟`,
    arabizi: (n, a, o, w) => `Marhaba${n ? ' ' + n : ''}, ${a} mn ${o}. Nezlo khayarat jdide la ${w}. Bte7eb ebba3tlak a7sanhon?`,
  },
  reminder24: {
    en: (v) => `Reminder: your viewing of ${v.title} is tomorrow, ${v.label}, with ${v.agent}. Reply here if you need to reschedule.`,
    fr: (v) => `Rappel : votre visite de ${v.title} est demain, ${v.label}, avec ${v.agent}. Répondez ici pour la déplacer.`,
    ar: (v) => `تذكير: زيارتك لـ${v.title} بكرا ${v.label} مع ${v.agent}. إذا بدك تغيّر الموعد رد هون.`,
    arabizi: (v) => `Tazkir: ziyaretak la ${v.title} bokra ${v.label} ma3 ${v.agent}. Eza baddak tghayyer el maw3ad rod hon.`,
  },
  reminder2: {
    en: (v) => `See you soon! Your viewing of ${v.title} starts at ${v.time} with ${v.agent} (${v.phone}).`,
    fr: (v) => `À tout à l'heure ! Votre visite de ${v.title} commence à ${v.time} avec ${v.agent} (${v.phone}).`,
    ar: (v) => `منشوفك قريباً! زيارتك لـ${v.title} الساعة ${v.time} مع ${v.agent} (${v.phone}).`,
    arabizi: (v) => `Menshoufak ba2reb! Ziyaretak la ${v.title} el sa3a ${v.time} ma3 ${v.agent} (${v.phone}).`,
  },
};

/** Draft a personalized follow-up (LLM when available, template otherwise). */
export async function draftFollowup(office, lead, kind) {
  const lang = L(lead.language);
  const base = TEMPLATES[kind][lang](lead.name, office.assistantName || office.name, office.name, what(lead, lang));
  if (providerName() === 'mock') return base;
  try {
    const res = await getProvider().complete({
      system: `You write short WhatsApp follow-ups for ${office.name}, a Lebanese real estate office. Max 45 words, warm, no pressure, one clear next step, reply in the customer's language/script (${lead.language}). Never invent listings or prices. Output only the message.`,
      messages: [{ role: 'user', content: `Customer: ${lead.name || 'unknown'}. Wants: ${lead.intent || '?'} ${lead.areas.join('/') || ''} budget ${lead.budget || '?'} ${lead.bedrooms ?? ''}BR. Timeline: ${lead.timeline || '?'}. Silent for ${kind === '24h' ? '1 day' : '3 days'}.` }], tools: [] });
    return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() || base;
  } catch (e) { log.warn('followup_llm_failed', { msg: e.message }); return base; }
}

/** Create drafts for silent leads (24h, 72h) and viewing reminders (24h, 2h). Returns number of items created. */
export async function runFollowups(db = getDb(), office = getOffice(), { sendNow = false } = {}) {
  let created = 0;
  const silent = db.prepare(`SELECT * FROM leads WHERE office_id=? AND stage NOT IN ('closed') AND intent IS NOT NULL AND intent<>'owner' AND last_customer_msg_at IS NOT NULL
    AND followup_stage < 2 AND (julianday('now') - julianday(last_customer_msg_at)) * 24 >= CASE followup_stage WHEN 0 THEN 24 ELSE 72 END`).all(office.id);
  for (const row of silent) {
    const lead = leadRow(row);
    const conv = db.prepare('SELECT id, mode FROM conversations WHERE lead_id=? ORDER BY id DESC LIMIT 1').get(lead.id);
    if (!conv || conv.mode === 'human') continue;
    const silentH = (Date.now() - new Date(`${lead.last_customer_msg_at.replace(' ', 'T')}Z`).getTime()) / 3600000;
    const kind = lead.followup_stage === 0 && silentH < 72 ? '24h' : '72h';
    const draft = await draftFollowup(office, lead, kind);
    db.prepare('INSERT INTO followups (office_id,lead_id,kind,draft) VALUES (?,?,?,?)').run(office.id, lead.id, kind, draft);
    db.prepare('UPDATE leads SET followup_stage=? WHERE id=?').run(kind === '24h' ? 1 : 2, lead.id);
    created++;
    emitEvent(office.id, 'followup_ready', { lead_id: lead.id, kind });
  }
  const now = nowLocal(office);
  const vs = db.prepare("SELECT * FROM viewings WHERE office_id=? AND status='booked' AND start_at>?").all(office.id, now);
  for (const v of vs) {
    const h = hoursBetween(now, v.start_at);
    const kind = h <= 2 && !v.remind2 ? 'reminder2' : h <= 24 && !v.remind24 && h > 2 ? 'reminder24' : null;
    if (!kind || !v.lead_id) continue;
    const lead = leadRow(db.prepare('SELECT * FROM leads WHERE id=?').get(v.lead_id));
    const listing = getListing(db, office.id, v.listing_id);
    const agent = office.agents.find((a) => a.id === v.agent_id);
    const lang = L(lead.language);
    const text = TEMPLATES[kind][lang]({ title: listing.title, label: humanSlot(v.start_at, lang), time: v.start_at.slice(11), agent: agent?.name, phone: agent?.phone });
    db.prepare(`UPDATE viewings SET ${kind === 'reminder2' ? 'remind2=1, remind24=1' : 'remind24=1'} WHERE id=?`).run(v.id);
    const f = db.prepare('INSERT INTO followups (office_id,lead_id,viewing_id,kind,draft) VALUES (?,?,?,?,?)').run(office.id, lead.id, v.id, kind, text);
    created++;
    if (sendNow || config.demoMode) await sendFollowup(db, office, Number(f.lastInsertRowid));
  }
  if (config.demoMode || sendNow) {
    const ready = db.prepare(`SELECT id FROM followups WHERE office_id=? AND status='ready' AND kind IN ('24h','72h') AND (julianday('now')-julianday(created_at))*1440 >= ?`).all(office.id, sendNow ? -1 : 5);
    for (const r of ready) await sendFollowup(db, office, r.id);
  }
  return created;
}

/** Send a drafted follow-up through the customer's channel. */
export async function sendFollowup(db, office, id) {
  const f = db.prepare("SELECT * FROM followups WHERE office_id=? AND id=? AND status='ready'").get(office.id, id);
  if (!f) return false;
  const conv = db.prepare('SELECT id FROM conversations WHERE lead_id=? ORDER BY id DESC LIMIT 1').get(f.lead_id);
  if (!conv) return false;
  await deliver(db, office, conv.id, f.draft, { meta: { followup: f.kind } });
  db.prepare("UPDATE followups SET status='sent', sent_at=datetime('now') WHERE id=?").run(id);
  emitEvent(office.id, 'followup_sent', { lead_id: f.lead_id, id });
  return true;
}

/** Start the scheduler (every minute). */
export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    for (const id of listOffices()) { try { await runFollowups(getDb(), getOffice(id)); } catch (e) { log.error('followup_cron_failed', { msg: e.message }); } }
  });
  log.info('scheduler_started');
}
