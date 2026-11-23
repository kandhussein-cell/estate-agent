import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctxFor, NOW } from './helpers.js';
import { runTool } from '../core/tools.js';
import { freeSlots, bookSlot } from '../core/scheduling.js';
import { getListing } from '../core/store.js';

test('slots are in the future, inside agent hours, max 2 per day, no weekends for karim', () => {
  const env = makeEnv(); const l = getListing(env.db, env.office.id, 1);
  const s = freeSlots(env.db, env.office, l, { now: NOW, limit: 6 });
  assert.ok(s.length >= 4);
  const perDay = {};
  for (const x of s) {
    assert.ok(x.start > NOW);
    const h = Number(x.start.slice(11, 13));
    assert.ok(h >= 9 && h < 17, x.start);
    perDay[x.start.slice(0, 10)] = (perDay[x.start.slice(0, 10)] || 0) + 1;
    const dow = new Date(`${x.start.slice(0, 10)}T00:00:00Z`).getUTCDay();
    assert.ok(dow >= 1 && dow <= 5);
  }
  assert.ok(Object.values(perDay).every((n) => n <= 2));
});

test('no double booking: same agent + same time is refused, even for another listing', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  const slot = runTool(ctx, 'check_viewing_slots', { listing_id: 1 }).data.slots[0].datetime;
  assert.equal(runTool(ctx, 'book_viewing', { listing_id: 1, name: 'Ali', phone: '03 111 222', datetime: slot }).data.booked, true);
  const b = runTool(ctx, 'book_viewing', { listing_id: 1, name: 'Bob', phone: '03 333 444', datetime: slot });
  assert.equal(b.data.booked, false);
  assert.equal(b.data.reason, 'slot_taken');
  assert.ok(b.data.alternatives.length > 0 && b.data.alternatives.every((x) => x.datetime !== slot));
  assert.equal(runTool(ctx, 'book_viewing', { listing_id: 2, name: 'Cy', phone: '03 555 666', datetime: slot }).data.booked, false);
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM viewings WHERE start_at=? AND agent_id='karim' AND status='booked'").get(slot).n, 1);
});

test('DB unique index blocks a race even if the app-level check were bypassed', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  const slot = runTool(ctx, 'check_viewing_slots', { listing_id: 1 }).data.slots[1].datetime;
  const ins = () => env.db.prepare("INSERT INTO viewings (office_id,listing_id,agent_id,start_at,end_at,name,phone) VALUES ('beirut-homes',1,'karim',?,?,'x','+9613')").run(slot, slot);
  ins();
  assert.throws(ins, /UNIQUE/);
});

test('invalid times are rejected: past, too soon, off-hours, weekend, unaligned, garbage', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  const book = (dt) => runTool(ctx, 'book_viewing', { listing_id: 1, name: 'Zed', phone: '03 123 123', datetime: dt }).data;
  assert.equal(book('2026-11-22T10:00').reason, 'in_the_past_or_too_soon');
  assert.equal(book('2026-11-23T08:30').reason, 'in_the_past_or_too_soon');
  assert.equal(book('2026-11-24T20:00').reason, 'outside_agent_hours');
  assert.equal(book('2026-11-28T10:00').reason, 'outside_agent_hours');
  assert.equal(book('2026-11-24T10:20').reason, 'outside_agent_hours');
  assert.equal(book('tomorrow at 10').reason, 'invalid_datetime');
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM viewings WHERE name='Zed'").get().n, 0);
});

test('booking updates the lead: phone, stage viewing, hot score', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  runTool(ctx, 'save_or_update_lead', { intent: 'rent', budget: 600, areas: ['Hadath'], timeline: 'this month' });
  const slot = runTool(ctx, 'check_viewing_slots', { listing_id: 15 }).data.slots[0].datetime;
  assert.equal(runTool(ctx, 'book_viewing', { listing_id: 15, name: 'Rima', phone: '70 123 456', datetime: slot }).data.booked, true);
  const lead = env.db.prepare('SELECT * FROM leads WHERE id=?').get(ctx.leadId);
  assert.equal(lead.stage, 'viewing');
  assert.equal(lead.phone, '+96170123456');
  assert.ok(lead.score >= 65, `score ${lead.score}`);
});

test('cancel/reschedule require the booking phone and never leak other customers', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  const slots = runTool(ctx, 'check_viewing_slots', { listing_id: 1 }).data.slots;
  const v = runTool(ctx, 'book_viewing', { listing_id: 1, name: 'Ali', phone: '03 111 222', datetime: slots[0].datetime }).data;
  const wrong = runTool(ctx, 'cancel_or_reschedule_viewing', { phone: '03 999 999', viewing_id: v.viewing_id }).data;
  const missing = runTool(ctx, 'cancel_or_reschedule_viewing', { phone: '03 999 999', viewing_id: 99999 }).data;
  assert.deepEqual(wrong, missing);
  assert.equal(runTool(ctx, 'cancel_or_reschedule_viewing', { phone: '03111222', viewing_id: v.viewing_id, new_datetime: slots[2].datetime }).data.action, 'rescheduled');
  assert.equal(env.db.prepare('SELECT start_at FROM viewings WHERE id=?').get(v.viewing_id).start_at, slots[2].datetime);
  assert.equal(runTool(ctx, 'cancel_or_reschedule_viewing', { phone: '03 111 222', viewing_id: v.viewing_id }).data.action, 'cancelled');
  assert.equal(runTool(ctx, 'book_viewing', { listing_id: 1, name: 'Bob', phone: '03 333 444', datetime: slots[2].datetime }).data.booked, true);
});

test('bookSlot: only one of many identical attempts succeeds', () => {
  const env = makeEnv(); const l = getListing(env.db, env.office.id, 1);
  const slot = freeSlots(env.db, env.office, l, { now: NOW })[0].start;
  const results = Array.from({ length: 5 }, (_, i) => bookSlot(env.db, env.office, l, { name: `n${i}`, phone: '+9613123456', start: slot, now: NOW }));
  assert.equal(results.filter((r) => r.ok).length, 1);
});
