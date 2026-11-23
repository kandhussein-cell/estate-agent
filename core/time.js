/** Office-local "naive" time helpers. All viewing times are stored as 'YYYY-MM-DDTHH:mm' in office local time. */
const pad = (n) => String(n).padStart(2, '0');

export function nowLocal(office, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: office?.timezone || 'Asia/Beirut', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}
export const parseLocal = (s) => { const [d, t] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = (t || '00:00').split(':').map(Number); return new Date(Date.UTC(y, m - 1, dd, h, mi)); };
export const fmtLocal = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
export const addMinutes = (s, m) => fmtLocal(new Date(parseLocal(s).getTime() + m * 60000));
export const addDays = (s, n) => addMinutes(s, n * 1440);
export const dayOfWeek = (s) => parseLocal(s).getUTCDay(); // 0=Sun
export const dateOnly = (s) => s.slice(0, 10);
export const isValidLocal = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && !isNaN(parseLocal(s));
export function humanSlot(s, lang = 'en') {
  const d = parseLocal(s);
  const loc = lang === 'ar' ? 'ar-LB' : lang === 'fr' ? 'fr-FR' : 'en-GB';
  return new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(d);
}
export const hoursBetween = (a, b) => (parseLocal(b) - parseLocal(a)) / 3600000;
