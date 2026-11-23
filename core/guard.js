import { getDb } from './db.js';

const MAX_LEN = 1500;
const INJECTION = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/i,
  /disregard (all |your |the )?(previous|prior|system|above)/i,
  /(reveal|show|print|repeat|tell me|display|leak).{0,30}(system prompt|your (instructions|prompt|rules)|hidden (prompt|instructions))/i,
  /you are now\b|act as (an? )?(dan|developer|admin|root|different)/i,
  /(developer|debug|admin|jailbreak) mode/i,
  /\bsystem\s*:\s|<\s*\/?system\s*>|\[\s*system\s*\]/i,
  /(drop|delete|truncate)\s+table|;\s*--|union\s+select/i,
  /(other|all) (customers?|clients?|leads?)('s)?.{0,25}(data|phone|numbers?|details|list|info)/i,
  /(انسى|تجاهل|تجاهلي).{0,20}(التعليمات|الأوامر|كل شي)|اعرض.{0,15}(التعليمات|البرومبت)/,
  /ignore.{0,15}(instructions|consignes)|oublie.{0,20}(instructions|consignes)|r[eé]v[eè]le.{0,20}(prompt|instructions)/i,
];

/** Strip control chars/markup, clamp length. Never trust inbound text. */
export function sanitizeInput(text) {
  return String(text ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F​-‏‪-‮]/g, '').replace(/<[^>]{0,200}>/g, (m) => m.replace(/[<>]/g, '')).replace(/\s+\n/g, '\n').trim().slice(0, MAX_LEN);
}

/** Heuristic prompt-injection detector; flagged messages are still answered, but the model is warned. */
export function looksLikeInjection(text) { return INJECTION.some((re) => re.test(text)); }

/** Per-conversation sliding-window limiter backed by SQLite (survives restarts, works multi-process). */
export function rateLimitConversation(key, { max = 20, windowMs = 60000 } = {}) {
  const db = getDb();
  const now = Date.now();
  db.prepare('DELETE FROM rate_hits WHERE ts<?').run(now - windowMs * 5);
  const n = db.prepare('SELECT COUNT(*) n FROM rate_hits WHERE key=? AND ts>?').get(key, now - windowMs).n;
  if (n >= max) return false;
  db.prepare('INSERT INTO rate_hits (key,ts) VALUES (?,?)').run(key, now);
  return true;
}
