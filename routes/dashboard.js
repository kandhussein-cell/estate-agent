import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { getDb, j } from '../core/db.js';
import { getOffice, listOffices } from '../core/offices.js';
import { checkPin, makeSession, requireAuth } from '../core/auth.js';
import { bus, emitEvent } from '../core/events.js';
import { getConversation, getLead, getListing, getMessages, getSettings, saveSettings, leadRow, listingRow, recomputeLead } from '../core/store.js';
import { validateInput } from '../core/validate.js';
import { deliver } from '../core/delivery.js';
import { runFollowups, sendFollowup } from '../core/followups.js';
import { seedDemo } from '../core/seed.js';
import { nowLocal, addDays } from '../core/time.js';
import { ROOT, config } from '../core/config.js';
import { FEATURE_KEYS, canonicalArea, canonicalFeature } from '../core/areas.js';
import { parseCsv, LISTING_CSV_TEMPLATE } from '../core/csv.js';

export const dashRouter = Router();
const officeOf = (req) => getOffice(req.query.office);
const STAGES = ['new', 'qualified', 'viewing', 'negotiation', 'closed'];

dashRouter.post('/login', (req, res) => {
  if (!checkPin(req.body?.pin)) return res.status(401).json({ error: 'Wrong PIN' });
  res.cookie('dash', makeSession(), { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600e3, secure: process.env.NODE_ENV === 'production' });
  res.json({ ok: true });
});
dashRouter.post('/logout', (req, res) => { res.clearCookie('dash'); res.json({ ok: true }); });
dashRouter.get('/session', requireAuth, (req, res) => res.json({ ok: true, demoMode: config.demoMode }));

dashRouter.use(requireAuth);

/* ---------------- live events ---------------- */
dashRouter.get('/events', (req, res) => {
  const office = officeOf(req);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');
  const on = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  bus.on(`office:${office.id}`, on);
  const hb = setInterval(() => res.write(': hb\n\n'), 25000);
  req.on('close', () => { clearInterval(hb); bus.off(`office:${office.id}`, on); });
});

/* ---------------- KPIs & analytics ---------------- */
dashRouter.get('/kpis', (req, res) => {
  const db = getDb(); const o = officeOf(req); const now = nowLocal(o);
  const monday = addDays(`${now.slice(0, 10)}T00:00`, -((new Date(`${now.slice(0, 10)}T00:00:00Z`).getUTCDay() + 6) % 7)).slice(0, 10);
  const sunday = addDays(`${monday}T00:00`, 6).slice(0, 10);
  const one = (sql, ...a) => db.prepare(sql).get(o.id, ...a);
  const funnel = Object.fromEntries(STAGES.map((s) => [s, one('SELECT COUNT(*) n FROM leads WHERE office_id=? AND stage=?', s).n]));
  const total = one('SELECT COUNT(*) n FROM leads WHERE office_id=?').n;
  const ms = one("SELECT AVG(json_extract(meta,'$.ms')) a FROM messages WHERE office_id=? AND role='assistant' AND json_extract(meta,'$.ms') IS NOT NULL").a;
  res.json({
    newToday: one("SELECT COUNT(*) n FROM leads WHERE office_id=? AND date(created_at)=date('now')").n,
    hot: one("SELECT COUNT(*) n FROM leads WHERE office_id=? AND temperature='hot' AND stage<>'closed'").n,
    viewingsWeek: one("SELECT COUNT(*) n FROM viewings WHERE office_id=? AND status='booked' AND substr(start_at,1,10) BETWEEN ? AND ?", monday, sunday).n,
    avgResponseSec: ms ? Math.round(ms / 100) / 10 : null,
    handoffs: one("SELECT COUNT(*) n FROM conversations WHERE office_id=? AND handoff_reason IS NOT NULL AND mode<>'closed'").n,
    funnel, total, conversion: total ? Math.round((funnel.closed / total) * 100) : 0,
  });
});

dashRouter.get('/analytics', (req, res) => {
  const db = getDb(); const o = officeOf(req);
  const q = (sql, ...a) => db.prepare(sql).all(o.id, ...a);
  const byDay = q("SELECT date(created_at) d, COUNT(*) n FROM leads WHERE office_id=? AND created_at>=datetime('now','-13 days') GROUP BY d ORDER BY d");
  res.json({
    bySource: q('SELECT source k, COUNT(*) n FROM leads WHERE office_id=? GROUP BY source ORDER BY n DESC'),
    byArea: q('SELECT value k, COUNT(*) n FROM leads, json_each(leads.areas) WHERE office_id=? GROUP BY value ORDER BY n DESC LIMIT 8'),
    temperature: q('SELECT temperature k, COUNT(*) n FROM leads WHERE office_id=? GROUP BY temperature'),
    budgets: q(`SELECT intent, CASE WHEN intent='rent' THEN CASE WHEN budget<500 THEN '<$500' WHEN budget<1000 THEN '$500–1k' WHEN budget<2000 THEN '$1–2k' ELSE '$2k+' END
      ELSE CASE WHEN budget<150000 THEN '<$150k' WHEN budget<300000 THEN '$150–300k' WHEN budget<600000 THEN '$300–600k' ELSE '$600k+' END END k, COUNT(*) n
      FROM leads WHERE office_id=? AND budget>0 AND intent IN ('rent','buy') GROUP BY intent,k`),
    languages: q('SELECT language k, COUNT(*) n FROM leads WHERE office_id=? GROUP BY language ORDER BY n DESC'),
    byDay,
  });
});

/* ---------------- leads ---------------- */
dashRouter.get('/leads', (req, res) => {
  const db = getDb(); const o = officeOf(req);
  const rows = db.prepare(`SELECT l.*, c.id conversation_id, c.mode, c.handoff_reason, c.handoff_urgency,
    (SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) last_message,
    (SELECT start_at FROM viewings v WHERE v.lead_id=l.id AND v.status='booked' ORDER BY start_at LIMIT 1) next_viewing
    FROM leads l LEFT JOIN conversations c ON c.lead_id=l.id WHERE l.office_id=? GROUP BY l.id ORDER BY l.updated_at DESC LIMIT 500`).all(o.id);
  res.json(rows.map(leadRow));
});

dashRouter.get('/leads/:id', (req, res) => {
  const db = getDb(); const o = officeOf(req);
  const lead = getLead(db, o.id, Number(req.params.id));
  if (!lead) return res.status(404).json({ error: 'not found' });
  const conv = db.prepare('SELECT * FROM conversations WHERE lead_id=? ORDER BY id DESC LIMIT 1').get(lead.id);
  const messages = conv ? getMessages(db, conv.id).filter((m) => m.role !== 'system').map((m) => ({ id: m.id, role: m.role, content: m.content, ui: m.meta.ui || [], agent: m.meta.agent, followup: m.meta.followup, at: m.created_at })) : [];
  const viewings = db.prepare('SELECT v.*, l.title listing_title FROM viewings v JOIN listings l ON l.id=v.listing_id WHERE v.lead_id=? ORDER BY v.start_at').all(lead.id);
  const followups = db.prepare('SELECT * FROM followups WHERE lead_id=? ORDER BY id DESC LIMIT 5').all(lead.id);
  res.json({ lead, conversation: conv ? { id: conv.id, mode: conv.mode, channel: conv.channel, language: conv.language, handoff_reason: conv.handoff_reason, handoff_urgency: conv.handoff_urgency } : null, messages, viewings, followups });
});

const PATCH = { type: 'object', properties: { stage: { type: 'string', enum: STAGES }, notes: { type: 'string', maxLength: 2000 }, name: { type: 'string', maxLength: 80 }, phone: { type: 'string', maxLength: 30 } } };
dashRouter.patch('/leads/:id', (req, res) => {
  const db = getDb(); const o = officeOf(req); const id = Number(req.params.id);
  const v = validateInput(PATCH, req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  if (!getLead(db, o.id, id)) return res.status(404).json({ error: 'not found' });
  const a = v.value;
  db.prepare("UPDATE leads SET stage=COALESCE(?,stage), notes=COALESCE(?,notes), name=COALESCE(?,name), phone=COALESCE(?,phone), updated_at=datetime('now') WHERE id=? AND office_id=?").run(a.stage ?? null, a.notes ?? null, a.name ?? null, a.phone ?? null, id, o.id);
  recomputeLead(db, o, id);
  emitEvent(o.id, 'lead_updated', { lead_id: id, by: 'human' });
  res.json(getLead(db, o.id, id));
});

dashRouter.post('/leads/:id/takeover', (req, res) => {
  const db = getDb(); const o = officeOf(req);
  const conv = db.prepare('SELECT * FROM conversations WHERE office_id=? AND lead_id=? ORDER BY id DESC LIMIT 1').get(o.id, Number(req.params.id));
  if (!conv) return res.status(404).json({ error: 'no conversation' });
  const on = req.body?.on !== false;
  db.prepare('UPDATE conversations SET mode=? WHERE id=?').run(on ? 'human' : 'ai', conv.id);
  bus.emit(`conv:${conv.id}`, { type: 'mode', mode: on ? 'human' : 'ai' });
  emitEvent(o.id, 'lead_updated', { lead_id: conv.lead_id, mode: on ? 'human' : 'ai' });
  res.json({ mode: on ? 'human' : 'ai' });
});

dashRouter.post('/leads/:id/reply', async (req, res) => {
  const db = getDb(); const o = officeOf(req);
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  const conv = db.prepare('SELECT * FROM conversations WHERE office_id=? AND lead_id=? ORDER BY id DESC LIMIT 1').get(o.id, Number(req.params.id));
  if (!text || !conv) return res.status(400).json({ error: 'text and conversation required' });
  if (conv.mode !== 'human') { db.prepare("UPDATE conversations SET mode='human' WHERE id=?").run(conv.id); bus.emit(`conv:${conv.id}`, { type: 'mode', mode: 'human' }); }
  const agent = String(req.body?.agent || o.agents[0].name);
  const id = await deliver(db, o, conv.id, text, { role: 'human', meta: { agent } });
  res.json({ id });
});

/* ---------------- viewings ---------------- */
dashRouter.get('/viewings', (req, res) => {
  const o = officeOf(req);
  const from = String(req.query.from || '0000-00-00'); const to = String(req.query.to || '9999-12-31');
  res.json(getDb().prepare(`SELECT v.*, l.title listing_title, l.area listing_area, l.ref listing_ref FROM viewings v JOIN listings l ON l.id=v.listing_id
    WHERE v.office_id=? AND v.status<>'cancelled' AND substr(v.start_at,1,10) BETWEEN ? AND ? ORDER BY v.start_at`).all(o.id, from, to));
});
dashRouter.patch('/viewings/:id', (req, res) => {
  const o = officeOf(req); const status = req.body?.status;
  if (!['cancelled', 'done', 'booked'].includes(status)) return res.status(400).json({ error: 'bad status' });
  getDb().prepare('UPDATE viewings SET status=? WHERE id=? AND office_id=?').run(status, Number(req.params.id), o.id);
  emitEvent(o.id, 'viewing_changed', { viewing_id: Number(req.params.id) });
  res.json({ ok: true });
});

/* ---------------- listings ---------------- */
const LISTING = { type: 'object', required: ['title', 'type', 'category', 'area', 'price'], properties: {
  title: { type: 'string', maxLength: 120 }, type: { type: 'string', enum: ['sale', 'rent'] }, category: { type: 'string', enum: ['apartment', 'duplex', 'studio', 'office', 'shop', 'land', 'villa'] },
  area: { type: 'string', maxLength: 60 }, price: { type: 'number', minimum: 1, maximum: 1e8 }, bedrooms: { type: 'integer', minimum: 0, maximum: 20 }, bathrooms: { type: 'integer', minimum: 0, maximum: 20 },
  size_m2: { type: 'integer', minimum: 0, maximum: 1e6 }, furnished: { type: 'boolean' }, features: { type: 'array', maxItems: 12, items: { type: 'string', enum: FEATURE_KEYS } },
  description: { type: 'string', maxLength: 1000 }, available: { type: 'boolean' }, agent_id: { type: 'string', maxLength: 40 } } };

dashRouter.get('/listings', (req, res) => {
  const o = officeOf(req);
  res.json(getDb().prepare(`SELECT *, (SELECT COUNT(*) FROM viewings v WHERE v.listing_id=listings.id AND v.status='booked') viewings FROM listings WHERE office_id=? ORDER BY id DESC`).all(o.id).map((r) => ({ ...listingRow(r), viewings: r.viewings })));
});
dashRouter.post('/listings', (req, res) => {
  const db = getDb(); const o = officeOf(req);
  const v = validateInput(LISTING, req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  const a = v.value; const n = db.prepare('SELECT COUNT(*) n FROM listings WHERE office_id=?').get(o.id).n + 1;
  const r = db.prepare(`INSERT INTO listings (office_id,ref,title,type,category,area,price,bedrooms,bathrooms,size_m2,furnished,features,description,available,agent_id,hue) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(o.id, `${o.brand.logoText}-${String(n).padStart(3, '0')}`, a.title, a.type, a.category, a.area, a.price, a.bedrooms ?? 0, a.bathrooms ?? 1, a.size_m2 ?? 0, a.furnished ? 1 : 0, JSON.stringify(a.features || []), a.description ?? '', a.available === false ? 0 : 1, a.agent_id || o.agents[0].id, Math.floor(Math.random() * 300));
  emitEvent(o.id, 'listing_changed', { id: Number(r.lastInsertRowid) });
  res.status(201).json(getListing(db, o.id, Number(r.lastInsertRowid)));
});
dashRouter.put('/listings/:id', (req, res) => {
  const db = getDb(); const o = officeOf(req); const id = Number(req.params.id);
  if (!getListing(db, o.id, id)) return res.status(404).json({ error: 'not found' });
  const partial = { ...LISTING, required: [] };
  const v = validateInput(partial, req.body);
  if (!v.ok) return res.status(400).json({ errors: v.errors });
  const a = v.value; const sets = []; const vals = [];
  for (const [k, val] of Object.entries(a)) { sets.push(`${k}=?`); vals.push(k === 'features' ? JSON.stringify(val) : typeof val === 'boolean' ? +val : val); }
  if (sets.length) db.prepare(`UPDATE listings SET ${sets.join(',')} WHERE id=? AND office_id=?`).run(...vals, id, o.id);
  emitEvent(o.id, 'listing_changed', { id });
  res.json(getListing(db, o.id, id));
});
dashRouter.delete('/listings/:id', (req, res) => {
  const db = getDb(); const o = officeOf(req); const id = Number(req.params.id);
  db.prepare("UPDATE viewings SET status='cancelled' WHERE listing_id=? AND office_id=? AND status='booked'").run(id, o.id);
  db.prepare('DELETE FROM listings WHERE id=? AND office_id=?').run(id, o.id);
  emitEvent(o.id, 'listing_changed', { id });
  res.json({ ok: true });
});

const upload = multer({ storage: multer.diskStorage({ destination: path.join(ROOT, 'public', 'uploads'), filename: (req, file, cb) => cb(null, `${crypto.randomBytes(8).toString('hex')}${{ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype] || '.bin'}`) }),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });
dashRouter.post('/listings/:id/photo', upload.single('photo'), (req, res) => {
  const db = getDb(); const o = officeOf(req); const id = Number(req.params.id);
  const l = getListing(db, o.id, id);
  if (!l) return res.status(404).json({ error: 'not found' });
  if (!req.file) return res.status(400).json({ error: 'Upload a JPG, PNG or WebP under 4 MB' });
  const photos = [...l.photos, `/uploads/${req.file.filename}`].slice(-6);
  db.prepare('UPDATE listings SET photos=? WHERE id=?').run(JSON.stringify(photos), id);
  res.json({ photos });
});

/* ---------------- owner leads, follow-ups, demo ---------------- */
dashRouter.get('/owner-leads', (req, res) => res.json(getDb().prepare('SELECT * FROM owner_leads WHERE office_id=? ORDER BY id DESC').all(officeOf(req).id)));
dashRouter.patch('/owner-leads/:id', (req, res) => {
  const status = req.body?.status;
  if (!['new', 'contacted', 'valuation', 'signed', 'lost'].includes(status)) return res.status(400).json({ error: 'bad status' });
  getDb().prepare('UPDATE owner_leads SET status=? WHERE id=? AND office_id=?').run(status, Number(req.params.id), officeOf(req).id);
  res.json({ ok: true });
});
dashRouter.get('/followups', (req, res) => res.json(getDb().prepare(`SELECT f.*, l.name lead_name FROM followups f LEFT JOIN leads l ON l.id=f.lead_id WHERE f.office_id=? ORDER BY f.id DESC LIMIT 30`).all(officeOf(req).id)));
dashRouter.post('/followups/:id/send', async (req, res) => res.json({ ok: await sendFollowup(getDb(), officeOf(req), Number(req.params.id)) }));
dashRouter.post('/followups/run', async (req, res) => res.json({ created: await runFollowups(getDb(), officeOf(req)) }));

dashRouter.post('/demo/reset', (req, res) => {
  if (!config.demoMode) return res.status(403).json({ error: 'demo mode is off' });
  const o = officeOf(req); seedDemo(getDb(), o); emitEvent(o.id, 'reset', {});
  res.json({ ok: true });
});

/* ---------------- company info + CSV import (so each office can load its own data) ---------------- */
dashRouter.get('/company', (req, res) => {
  const o = officeOf(req);
  const s = getSettings(getDb(), o.id);
  res.json({ about: s.about, faq: s.faq, baseFaq: o.faq || [] });
});
dashRouter.put('/company', (req, res) => {
  const o = officeOf(req);
  const about = String(req.body?.about ?? '').slice(0, 3000);
  const faq = (Array.isArray(req.body?.faq) ? req.body.faq : []).slice(0, 60)
    .map((f) => ({ q: String(f?.q ?? '').trim().slice(0, 300), a: String(f?.a ?? '').trim().slice(0, 1000) })).filter((f) => f.q && f.a);
  saveSettings(getDb(), o.id, { about, faq });
  emitEvent(o.id, 'company_changed', {});
  res.json({ about, faq });
});

dashRouter.get('/listings-template', (req, res) => {
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="listings-template.csv"' }).send(LISTING_CSV_TEMPLATE);
});
dashRouter.post('/listings/import', (req, res) => {
  const db = getDb(); const o = officeOf(req);
  const rows = parseCsv(req.body?.csv).slice(0, 500);
  if (!rows.length) return res.status(400).json({ error: 'No rows found. Use the template: first line = column names.' });
  const yes = (v) => /^(1|yes|y|true|ye|نعم|oui)$/i.test(String(v || '').trim());
  const ins = db.prepare(`INSERT INTO listings (office_id,ref,title,type,category,area,price,bedrooms,bathrooms,size_m2,furnished,features,description,available,agent_id,hue) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`);
  const errors = []; let imported = 0;
  let n = db.prepare('SELECT COUNT(*) n FROM listings WHERE office_id=?').get(o.id).n;
  db.transaction(() => {
    rows.forEach((r, i) => {
      const feats = String(r.features || '').split(/[;|]/).map((x) => canonicalFeature(x.trim())).filter(Boolean);
      const v = validateInput(LISTING, { title: r.title, type: String(r.type || '').toLowerCase(), category: String(r.category || 'apartment').toLowerCase(), area: canonicalArea(r.area) || r.area, price: r.price,
        bedrooms: r.bedrooms || 0, bathrooms: r.bathrooms || 0, size_m2: r.size_m2 || 0, furnished: yes(r.furnished), features: feats, description: r.description, agent_id: r.agent_id });
      if (!v.ok) { errors.push({ row: i + 2, error: v.errors.join('; ') }); return; }
      const a = v.value; n += 1;
      const agent = o.agents.some((x) => x.id === a.agent_id) ? a.agent_id : o.agents[0].id;
      ins.run(o.id, `${o.brand.logoText}-${String(n).padStart(3, '0')}`, a.title, a.type, a.category, a.area, a.price, a.bedrooms ?? 0, a.bathrooms ?? 1, a.size_m2 ?? 0, a.furnished ? 1 : 0, JSON.stringify(a.features || []), a.description ?? '', agent, Math.floor(Math.random() * 300));
      imported += 1;
    });
  })();
  emitEvent(o.id, 'listing_changed', { imported });
  res.json({ imported, errors: errors.slice(0, 20), skipped: errors.length });
});
dashRouter.get('/offices', (req, res) => res.json(listOffices().map((id) => ({ id, name: getOffice(id).name, brand: getOffice(id).brand }))));
export { j, getConversation };
