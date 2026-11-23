import { Router } from 'express';
import { getDb, j } from '../core/db.js';
import { getOffice, publicOffice, listOffices } from '../core/offices.js';
import { handleMessage } from '../core/agent.js';
import { checkConvToken, convToken } from '../core/auth.js';
import { bus } from '../core/events.js';
import { getConversation, getMessages } from '../core/store.js';
import { providerName } from '../core/llm/index.js';

export const chatRouter = Router();

const sse = (res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  return (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
};

/** Public office config + provider info for the chat UI. */
chatRouter.get('/office', (req, res) => {
  const office = getOffice(req.query.office);
  res.json({ ...publicOffice(office), offices: listOffices().map((id) => ({ id, name: getOffice(id).name, brand: getOffice(id).brand })), provider: providerName() });
});

/** Send a customer message; streams the reply as Server-Sent Events. */
chatRouter.post('/chat/message', async (req, res) => {
  const { text, conversationId, token } = req.body || {};
  const office = getOffice(req.query.office || req.body?.office);
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text required' });
  if (conversationId && !checkConvToken(conversationId, token)) return res.status(403).json({ error: 'bad conversation token' });
  const send = sse(res);
  let closed = false;
  req.on('close', () => { closed = true; });
  try {
    await handleMessage({ officeId: office.id, conversationId: conversationId || undefined, channel: 'web', text,
      onEvent: (ev) => { if (closed) return; send(ev.type === 'meta' ? { ...ev, token: convToken(ev.conversationId) } : ev); } });
  } catch (e) { send({ type: 'error', message: 'Unexpected error' }); }
  res.end();
});

/** History of a conversation (for resume / human replies). */
chatRouter.get('/chat/:id/messages', (req, res) => {
  const id = Number(req.params.id);
  if (!checkConvToken(id, req.query.token)) return res.status(403).json({ error: 'forbidden' });
  const office = getOffice(req.query.office);
  const conv = getConversation(getDb(), office.id, id);
  if (!conv) return res.status(404).json({ error: 'not found' });
  const msgs = getMessages(getDb(), id, Number(req.query.after || 0)).filter((m) => m.role !== 'system')
    .map((m) => ({ id: m.id, role: m.role, content: m.content, ui: m.meta.ui || [], chips: m.meta.chips || [], agent: m.meta.agent, at: m.created_at }));
  res.json({ mode: conv.mode, language: conv.language, messages: msgs });
});

/** Live channel for a conversation: human-agent replies, mode changes, follow-ups. */
chatRouter.get('/chat/:id/events', (req, res) => {
  const id = Number(req.params.id);
  if (!checkConvToken(id, req.query.token)) return res.status(403).end();
  const send = sse(res);
  const on = (ev) => send(ev);
  bus.on(`conv:${id}`, on);
  const hb = setInterval(() => res.write(': hb\n\n'), 25000);
  req.on('close', () => { clearInterval(hb); bus.off(`conv:${id}`, on); });
});

/** Demo helper: open the conversation of an existing seeded lead as a "returning customer". */
chatRouter.post('/demo/returning', (req, res) => {
  const office = getOffice(req.query.office);
  const row = getDb().prepare("SELECT c.id FROM conversations c JOIN leads l ON l.id=c.lead_id WHERE c.office_id=? AND l.name IS NOT NULL AND l.stage IN ('viewing','qualified') ORDER BY l.score DESC LIMIT 1").get(office.id);
  if (!row) return res.status(404).json({ error: 'no seeded lead' });
  res.json({ conversationId: row.id, token: convToken(row.id) });
});
export { j };
