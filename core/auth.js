import crypto from 'node:crypto';
import { config } from './config.js';

const sign = (data) => crypto.createHmac('sha256', config.sessionSecret).update(data).digest('base64url');
const safeEq = (a, b) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** Constant-time PIN check. */
export const checkPin = (pin) => safeEq(String(pin ?? ''), config.dashboardPin);

/** Dashboard session token: `<expiryMs>.<sig>` (8h). */
export function makeSession() { const exp = String(Date.now() + 8 * 3600e3); return `${exp}.${sign(`dash:${exp}`)}`; }
export function verifySession(tok) {
  if (!tok || !tok.includes('.')) return false;
  const [exp, sig] = tok.split('.');
  return Number(exp) > Date.now() && safeEq(sig, sign(`dash:${exp}`));
}

/** Unguessable per-conversation token so chat ids can't be enumerated by strangers. */
export const convToken = (id) => sign(`conv:${id}`).slice(0, 22);
export const checkConvToken = (id, tok) => !!tok && safeEq(String(tok), convToken(id));

export function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
export function requireAuth(req, res, next) {
  if (verifySession(parseCookies(req).dash)) return next();
  res.status(401).json({ error: 'unauthorized' });
}
