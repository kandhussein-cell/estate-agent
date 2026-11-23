import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'mock';
process.env.DASHBOARD_PIN = '4321';

const { makeEnv } = await import('../scripts/scenarios.js');
const env = makeEnv();
const { createApp } = await import('../server.js');
const { parseCsv } = await import('../core/csv.js');
const { buildSystemPrompt } = await import('../core/prompt.js');
const { withSettings } = await import('../core/store.js');
const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const login = async () => (await fetch(`${base}/api/dash/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '4321' }) })).headers.get('set-cookie').split(';')[0];
const call = (cookie, path, method = 'GET', body) => fetch(`${base}/api/dash${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

test('CSV parser: quotes, commas in cells, semicolon delimiter, CRLF, BOM', () => {
  const rows = parseCsv('﻿title,price,description\r\n"Nice, bright flat",500,"say ""hi"""\r\nSecond,700,x\r\n');
  assert.deepEqual(rows, [{ title: 'Nice, bright flat', price: '500', description: 'say "hi"' }, { title: 'Second', price: '700', description: 'x' }]);
  assert.equal(parseCsv('a;b\n1;2')[0].b, '2');
  assert.deepEqual(parseCsv(''), []);
});

test('CSV import adds valid listings, reports bad rows, canonicalises area/features', async () => {
  const cookie = await login();
  const before = env.db.prepare("SELECT COUNT(*) n FROM listings WHERE office_id='beirut-homes'").get().n;
  const csv = 'title,type,category,area,price,bedrooms,bathrooms,size_m2,furnished,features,description,agent_id\n'
    + '"Imported flat",rent,apartment,hadath,420,1,1,60,yes,generator;sea view,Cosy,nadine\n'
    + 'Bad row,lease,apartment,Hamra,notanumber,1,1,60,no,,,\n';
  const r = await (await call(cookie, '/listings/import', 'POST', { csv })).json();
  assert.equal(r.imported, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.errors[0].row, 3);
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM listings WHERE office_id='beirut-homes'").get().n, before + 1);
  const l = env.db.prepare("SELECT * FROM listings WHERE title='Imported flat'").get();
  assert.equal(l.area, 'Hadath');
  assert.deepEqual(JSON.parse(l.features), ['generator', 'sea_view']);
  assert.equal(l.furnished, 1);
  assert.equal((await call(cookie, '/listings/import', 'POST', { csv: '' })).status, 400);
  assert.equal((await fetch(`${base}/api/dash/listings/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
});

test('company info saved from the dashboard reaches the AI prompt', async () => {
  const cookie = await login();
  const put = await (await call(cookie, '/company', 'PUT', { about: 'Family-run since 1998.', faq: [{ q: 'Commission?', a: '2% from the buyer.' }, { q: '', a: 'dropped' }] })).json();
  assert.equal(put.faq.length, 1);
  const got = await (await call(cookie, '/company')).json();
  assert.equal(got.about, 'Family-run since 1998.');
  const p = buildSystemPrompt(withSettings(env.db, env.office), {});
  assert.match(p, /Family-run since 1998/);
  assert.match(p, /Commission\?/);
  assert.equal((await fetch(`${base}/api/dash/company`)).status, 401);
});
