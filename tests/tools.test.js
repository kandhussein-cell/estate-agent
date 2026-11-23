import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, ctxFor } from './helpers.js';
import { runTool, normalizePhone, TOOL_DEFS } from '../core/tools.js';
import { getLead } from '../core/store.js';

test('all 9 tools have object schemas and handlers', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  assert.equal(TOOL_DEFS.length, 9);
  for (const t of TOOL_DEFS) {
    assert.equal(t.input_schema.type, 'object');
    assert.ok(runTool(ctx, t.name, {}).data, t.name);
  }
});

test('missing required / bad enum / wrong types are rejected without touching the DB', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  const before = env.db.prepare('SELECT COUNT(*) n FROM viewings').get().n;
  assert.equal(runTool(ctx, 'search_listings', {}).data.error, 'invalid_input');
  assert.equal(runTool(ctx, 'search_listings', { type: 'steal' }).data.error, 'invalid_input');
  assert.equal(runTool(ctx, 'search_listings', { type: 'rent', max_price: 'lots' }).data.error, 'invalid_input');
  assert.equal(runTool(ctx, 'search_listings', { type: 'rent', features: ['teleporter'] }).data.error, 'invalid_input');
  assert.equal(runTool(ctx, 'book_viewing', { listing_id: 1, name: 'A' }).data.error, 'invalid_input');
  assert.equal(runTool(ctx, 'drop_database', {}).error, 'unknown_tool');
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM viewings').get().n, before);
});

test('unknown properties are stripped; strings trimmed and control chars removed', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  const r = runTool(ctx, 'save_or_update_lead', { name: '  Sami\u0000  ', evil: 'x', intent: 'rent' });
  assert.equal(r.data.saved, true);
  const lead = getLead(env.db, env.office.id, ctx.leadId);
  assert.equal(lead.name, 'Sami');
  assert.equal(lead.intent, 'rent');
});

test('normalizePhone handles Lebanese formats', () => {
  assert.equal(normalizePhone('03 123 456'), '+9613123456');
  assert.equal(normalizePhone('70 123 456'), '+96170123456');
  assert.equal(normalizePhone('+961 71 888 999'), '+96171888999');
  assert.equal(normalizePhone('00961 3 123 456'), '+9613123456');
  assert.equal(normalizePhone('abc'), null);
  assert.equal(normalizePhone('12'), null);
});

test('search_listings: exact match, closest alternative, honest empty result', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  const exact = runTool(ctx, 'search_listings', { type: 'rent', area: 'hadath', max_price: 700, bedrooms: 2 });
  assert.equal(exact.data.exact_match, true);
  assert.ok(exact.data.results.every((r) => r.area === 'Hadath' && r.price <= 700));
  assert.ok(exact.ui.items.length > 0);
  const near = runTool(ctx, 'search_listings', { type: 'rent', area: 'Hadath', max_price: 400 });
  assert.equal(near.data.exact_match, false);
  assert.ok(near.data.results[0].mismatches.length > 0, 'mismatches are reported honestly');
  const none = runTool(ctx, 'search_listings', { type: 'sale', area: 'Tripoli', max_price: 10, category: 'villa' });
  assert.equal(none.data.count, 0);
});

test('search never returns unavailable listings; get_listing on unknown id fails cleanly', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  env.db.prepare("UPDATE listings SET available=0 WHERE area='Hadath' AND type='rent'").run();
  const r = runTool(ctx, 'search_listings', { type: 'rent', area: 'Hadath' });
  assert.ok(r.data.results.every((x) => x.area !== 'Hadath'));
  assert.equal(runTool(ctx, 'get_listing', { id: 99999 }).data.error, 'not_found_or_unavailable');
});

test('compare_listings needs two valid listings', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  assert.equal(runTool(ctx, 'compare_listings', { ids: [1, 2] }).ui.items.length, 2);
  assert.equal(runTool(ctx, 'compare_listings', { ids: [1, 9999] }).data.error, 'need_at_least_two_valid_listings');
});

test('owner lead is stored with canonical area; handoff flags the conversation', async () => {
  const env = makeEnv(); const ctx = await ctxFor(env);
  assert.equal(runTool(ctx, 'create_owner_lead', { name: 'Nour', phone: '03 999 888', rent_or_sale: 'rent', area: 'hamra', asking_price: 900 }).data.saved, true);
  assert.equal(env.db.prepare("SELECT area FROM owner_leads WHERE name='Nour'").get().area, 'Hamra');
  assert.equal(runTool(ctx, 'create_owner_lead', { name: 'X', phone: 'nope', rent_or_sale: 'sale' }).data.saved, false);
  runTool(ctx, 'request_human_handoff', { reason: 'wants discount', urgency: 'medium' });
  assert.equal(env.db.prepare('SELECT handoff_urgency u FROM conversations WHERE id=?').get(ctx.conversationId).u, 'medium');
});
