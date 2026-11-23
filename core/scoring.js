/**
 * Server-side lead scoring (0–100). Deterministic and explainable.
 * Weights: budget 20, timeline 20, area 15, viewing 25, responsiveness 10, phone 10.
 */
const URGENT = /\b(asap|now|urgent|immediately|this (week|month)|next (week|month)|soon)\b|هلق|بأقرب|فورا|بسرعة|هالشهر|الشهر الجاي|ce mois|bient[oô]t|rapidement|cette semaine|8awre|bsor3a|3ajel|hal shahr/i;
const LATER = /\b(year|just looking|browsing|not sure|someday|later|no rush)\b|بعدني|مش مستعجل|plus tard|juste regarder/i;
const DURATION = /(\d+)\s*(day|week|month|jour|semaine|mois|يوم|اسبوع|أسبوع|شهر|أشهر|اشهر|ashhor|shahr)/i;

/** Classify a free-text timeline as 'urgent' (≤ ~2 months), 'mid' or 'later'. */
function urgency(t) {
  if (LATER.test(t)) return 'later';
  if (URGENT.test(t)) return 'urgent';
  const m = t.match(DURATION);
  if (m) {
    const unit = /day|jour|يوم/i.test(m[2]) ? 1 : /week|semaine|سبوع/i.test(m[2]) ? 7 : 30;
    return Number(m[1]) * unit <= 60 ? 'urgent' : 'mid';
  }
  return 'mid';
}

/**
 * @param {object} lead  lead-like object (budget, areas[], timeline, phone, viewing_requested, intent)
 * @param {{userMessages?:number, hasViewing?:boolean, areaMatches?:number, fastReplies?:boolean}} ctx
 * @returns {{score:number, temperature:'hot'|'warm'|'cold', breakdown:object}}
 */
export function scoreLead(lead, ctx = {}) {
  const b = { budget: 0, timeline: 0, area: 0, viewing: 0, responsiveness: 0, phone: 0 };
  if (lead.budget > 0) b.budget = lead.intent ? 20 : 14;
  if (lead.timeline) b.timeline = { urgent: 20, mid: 12, later: 4 }[urgency(lead.timeline)];
  const areas = Array.isArray(lead.areas) ? lead.areas : [];
  if (areas.length) b.area = ctx.areaMatches === 0 ? 6 : 15;
  if (ctx.hasViewing) b.viewing = 25; else if (lead.viewing_requested) b.viewing = 15;
  const n = ctx.userMessages || 0;
  b.responsiveness = (n >= 6 ? 8 : n >= 3 ? 5 : n >= 1 ? 2 : 0) + (ctx.fastReplies && n >= 3 ? 2 : 0);
  if (lead.phone) b.phone = 10;
  const score = Math.max(0, Math.min(100, Object.values(b).reduce((a, x) => a + x, 0)));
  const temperature = score >= 65 ? 'hot' : score >= 35 ? 'warm' : 'cold';
  return { score, temperature, breakdown: b };
}
