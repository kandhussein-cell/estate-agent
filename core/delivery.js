import { addMessage, getConversation } from './store.js';
import { bus, emitEvent } from './events.js';
import { sendText } from '../adapters/whatsapp.js';
import { log } from './logger.js';

/**
 * Push an outbound message (follow-up, reminder, human reply) into a conversation and out through its channel.
 * Web chats receive it live via the conversation SSE stream; WhatsApp chats via the Cloud API.
 */
export async function deliver(db, office, conversationId, text, { role = 'assistant', meta = {} } = {}) {
  const conv = getConversation(db, office.id, conversationId);
  if (!conv) return null;
  const id = addMessage(db, office.id, conversationId, role, text, meta);
  if (role !== 'user') db.prepare("UPDATE leads SET last_reply_at=datetime('now') WHERE id=?").run(conv.lead_id);
  bus.emit(`conv:${conversationId}`, { type: 'message', role, content: text, id, meta });
  emitEvent(office.id, 'message', { conversation_id: conversationId, lead_id: conv.lead_id, role });
  if (conv.channel === 'whatsapp' && conv.external_id) await sendText(conv.external_id, text).catch((e) => log.error('deliver_failed', { msg: e.message }));
  return id;
}
