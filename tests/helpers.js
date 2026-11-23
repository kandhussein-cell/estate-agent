process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'mock';
const { makeEnv } = await import('../scripts/scenarios.js');
const { getOrCreateConversation } = await import('../core/store.js');
export { makeEnv };

/** Fixed "now" = Monday 2026-11-23 08:00 Beirut. */
export const NOW = '2026-11-23T08:00';

/** Create a conversation with a lead stub and return a ctx usable with runTool. */
export async function ctxFor(env, language = 'en') {
  const conv = getOrCreateConversation(env.db, env.office.id, { channel: 'web', language });
  return { db: env.db, office: env.office, conversationId: conv.id, leadId: conv.lead_id, language, now: NOW };
}
