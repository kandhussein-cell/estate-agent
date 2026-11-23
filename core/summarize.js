import { getMessages } from './store.js';
import { getProvider, providerName } from './llm/index.js';

const THRESHOLD = 30; // unsummarized messages before we compact
const KEEP = 12; // most recent messages always kept verbatim

/**
 * Compact long conversations: older messages are folded into conversations.summary so the prompt stays short.
 * Uses the LLM when available, otherwise a rule-based digest.
 */
export async function maybeSummarize(db, office, conv) {
  const rows = getMessages(db, conv.id, conv.summary_upto).filter((m) => m.role !== 'system');
  if (rows.length <= THRESHOLD) return false;
  const old = rows.slice(0, rows.length - KEEP);
  const transcript = old.map((m) => `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n');
  let summary;
  if (providerName() !== 'mock') {
    const res = await getProvider().complete({
      system: 'Summarize this real-estate chat in <=120 words: customer needs, budget, areas, objections, listings discussed (with ids), viewings, open questions. Plain text, no preamble.',
      messages: [{ role: 'user', content: `${conv.summary ? `Previous summary: ${conv.summary}\n\n` : ''}${transcript}` }], tools: [],
    });
    summary = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  } else {
    const users = old.filter((m) => m.role === 'user').map((m) => m.content.slice(0, 80));
    summary = `${conv.summary ? conv.summary + ' ' : ''}Customer said: ${users.slice(-8).join(' | ')}`.slice(0, 700);
  }
  db.prepare('UPDATE conversations SET summary=?, summary_upto=? WHERE id=?').run(summary, old[old.length - 1].id, conv.id);
  return true;
}
