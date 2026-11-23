import { agentById } from './offices.js';
import { addDays, addMinutes, dateOnly, dayOfWeek, isValidLocal, nowLocal } from './time.js';

const STEP = 60; // minutes between slot starts
const LEAD_TIME_H = 3; // earliest bookable = now + 3h

/** Slot starts for one agent on one date, ignoring bookings. */
function dayGrid(agent, date, viewMin) {
  if (!agent.schedule.days.includes(dayOfWeek(`${date}T00:00`))) return [];
  const end = `${date}T${agent.schedule.end}`;
  const out = [];
  let t = `${date}T${agent.schedule.start}`;
  while (addMinutes(t, viewMin) <= end) { out.push(t); t = addMinutes(t, STEP); }
  return out;
}

const overlaps = (aS, aE, bS, bE) => aS < bE && bS < aE;

/** True if the agent has a booked viewing overlapping [start,end). */
export function agentBusy(db, officeId, agentId, start, end, ignoreId = 0) {
  const rows = db.prepare(`SELECT start_at,end_at FROM viewings WHERE office_id=? AND agent_id=? AND status='booked' AND id<>? AND substr(start_at,1,10)=?`).all(officeId, agentId, ignoreId, start.slice(0, 10));
  return rows.some((r) => overlaps(start, end, r.start_at, r.end_at));
}

/**
 * Next free viewing slots for a listing (its agent's calendar), spread across days (max 2/day).
 * @returns {{start:string,end:string,agent_id:string}[]}
 */
export function freeSlots(db, office, listing, { from, to, limit = 6, now = nowLocal(office) } = {}) {
  const agent = agentById(office, listing.agent_id) || office.agents[0];
  const min = addMinutes(now, LEAD_TIME_H * 60);
  const startDate = dateOnly(from && from > min ? from : min);
  const endDate = to ? dateOnly(to) : dateOnly(addDays(`${startDate}T00:00`, 10));
  const view = office.viewingMinutes || 45;
  const perDay = {};
  const out = [];
  for (let d = startDate; d <= endDate && out.length < limit; d = dateOnly(addDays(`${d}T00:00`, 1))) {
    for (const s of dayGrid(agent, d, view)) {
      if (s < min || (from && s < from)) continue;
      const e = addMinutes(s, view);
      if (agentBusy(db, office.id, agent.id, s, e)) continue;
      perDay[d] = (perDay[d] || 0) + 1;
      if (perDay[d] > 2) continue;
      out.push({ start: s, end: e, agent_id: agent.id });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Validate that `start` is a real, free, schedule-aligned slot. */
export function checkSlot(db, office, listing, start, { ignoreViewingId = 0, now = nowLocal(office) } = {}) {
  if (!isValidLocal(start)) return { ok: false, reason: 'invalid_datetime' };
  const agent = agentById(office, listing.agent_id) || office.agents[0];
  const view = office.viewingMinutes || 45;
  if (start < addMinutes(now, 60)) return { ok: false, reason: 'in_the_past_or_too_soon' };
  if (!dayGrid(agent, dateOnly(start), view).includes(start)) return { ok: false, reason: 'outside_agent_hours' };
  const end = addMinutes(start, view);
  if (agentBusy(db, office.id, agent.id, start, end, ignoreViewingId)) return { ok: false, reason: 'slot_taken' };
  return { ok: true, end, agent };
}

/** Atomically book a slot. A UNIQUE partial index backs this up against races. */
export function bookSlot(db, office, listing, { name, phone, start, leadId = null, now }) {
  return db.transaction(() => {
    const c = checkSlot(db, office, listing, start, { now });
    if (!c.ok) return c;
    try {
      const r = db.prepare(`INSERT INTO viewings (office_id,listing_id,lead_id,agent_id,start_at,end_at,name,phone) VALUES (?,?,?,?,?,?,?,?)`)
        .run(office.id, listing.id, leadId, c.agent.id, start, c.end, name, phone);
      return { ok: true, id: Number(r.lastInsertRowid), end: c.end, agent: c.agent };
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return { ok: false, reason: 'slot_taken' };
      throw e;
    }
  })();
}
