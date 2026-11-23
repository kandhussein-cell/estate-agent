import crypto from 'node:crypto';
import { Router } from 'express';
import { config } from '../core/config.js';
import { handleMessage } from '../core/agent.js';
import { getOffice } from '../core/offices.js';
import { log } from '../core/logger.js';

/** Render rich UI payloads (cards, slots…) as plain WhatsApp text. */
export function uiToText(ui = []) {
  const out = [];
  for (const u of ui) {
    if (u.type === 'listings' || u.type === 'compare') out.push(u.items.map((l) => `• ${l.title} (#${l.id}) — $${l.price.toLocaleString('en-US')}${l.type === 'rent' ? '/mo' : ''}${l.bedrooms ? ` · ${l.bedrooms} BR` : ''} · ${l.size_m2} m² · ${l.area}`).join('\n'));
    if (u.type === 'booking') out.push(`✅ ${u.title}\n📅 ${u.label}\n👤 ${u.agent} ${u.agent_phone}`);
  }
  return out.join('\n\n');
}

/**
 * Send a text (and up to 3 quick-reply buttons) through the WhatsApp Cloud API.
 * Without credentials this is a logged no-op, so the rest of the system works in demos.
 */
export async function sendText(to, body, chips = []) {
  const { accessToken, phoneNumberId } = config.whatsapp;
  if (!accessToken || !phoneNumberId) { log.info('whatsapp_send_stub', { to: String(to).slice(-4), len: body.length }); return { stubbed: true }; }
  const payload = chips.length
    ? { messaging_product: 'whatsapp', to, type: 'interactive', interactive: { type: 'button', body: { text: body.slice(0, 1024) }, action: { buttons: chips.slice(0, 3).map((c, i) => ({ type: 'reply', reply: { id: `chip_${i}`, title: c.slice(0, 20) } })) } } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: body.slice(0, 4000) } };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) log.error('whatsapp_send_failed', { status: res.status, body: (await res.text()).slice(0, 200) });
  return { ok: res.ok };
}

/** Validate X-Hub-Signature-256 when WHATSAPP_APP_SECRET is configured. */
export function validSignature(req) {
  if (!config.whatsapp.appSecret) return true;
  const sig = req.headers['x-hub-signature-256'] || '';
  const expected = `sha256=${crypto.createHmac('sha256', config.whatsapp.appSecret).update(req.rawBody || '').digest('hex')}`;
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** Extract {from, text, name} tuples from a Cloud API webhook payload. */
export function parseWebhook(body) {
  const out = [];
  for (const entry of body?.entry || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    for (const m of v.messages || []) {
      const text = m.type === 'text' ? m.text?.body : m.type === 'interactive' ? (m.interactive?.button_reply?.title || m.interactive?.list_reply?.title) : null;
      if (text) out.push({ from: m.from, text, name: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name });
    }
  }
  return out;
}

export const whatsappRouter = Router();

/** GET: Meta webhook verification handshake. */
whatsappRouter.get('/webhooks/whatsapp', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && config.whatsapp.verifyToken && token === config.whatsapp.verifyToken) return res.status(200).send(challenge);
  res.sendStatus(403);
});

/** POST: inbound messages. Always ack fast, process async. */
whatsappRouter.post('/webhooks/whatsapp', (req, res) => {
  if (!validSignature(req)) return res.sendStatus(401);
  res.sendStatus(200);
  const office = getOffice(req.query.office);
  (async () => {
    for (const m of parseWebhook(req.body)) {
      try {
        const r = await handleMessage({ officeId: office.id, channel: 'whatsapp', externalId: m.from, text: m.text });
        for (const rep of r.replies) {
          const extra = uiToText(rep.ui);
          await sendText(m.from, extra ? `${rep.content}\n\n${extra}` : rep.content, rep.chips);
        }
      } catch (e) { log.error('whatsapp_inbound_failed', { msg: e.message }); }
    }
  })();
});
