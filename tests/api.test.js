import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'mock';
process.env.ANTHROPIC_API_KEY = 'sk-ant-SECRET-SHOULD-NEVER-LEAK';
process.env.DASHBOARD_PIN = '4321';

const { makeEnv } = await import('../scripts/scenarios.js');
makeEnv();
const { createApp } = await import('../server.js');
const server = createApp().listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const readSse = async (res) => (await res.text()).split('\n\n').filter((c) => c.startsWith('data: ')).map((c) => JSON.parse(c.slice(6)));

test('security headers are set (helmet + CSP)', async () => {
  const r = await fetch(`${base}/healthz`);
  assert.ok(r.headers.get('content-security-policy')?.includes("default-src 'self'"));
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('dashboard API requires the PIN; wrong PIN rejected; right PIN works', async () => {
  assert.equal((await fetch(`${base}/api/dash/kpis`)).status, 401);
  assert.equal((await fetch(`${base}/api/dash/leads`)).status, 401);
  const bad = await fetch(`${base}/api/dash/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '0000' }) });
  assert.equal(bad.status, 401);
  const ok = await fetch(`${base}/api/dash/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: '4321' }) });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/i);
  const k = await (await fetch(`${base}/api/dash/kpis`, { headers: { cookie } })).json();
  assert.equal(k.total, 8);
  const forged = await fetch(`${base}/api/dash/kpis`, { headers: { cookie: 'dash=9999999999999.forged' } });
  assert.equal(forged.status, 401);
});

test('chat streams SSE, returns a conversation token, and tokens gate history', async () => {
  const res = await fetch(`${base}/api/chat/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'baddi esta2jer sha2a bi Hadath budget 600$' }) });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const evs = await readSse(res);
  const meta = evs.find((e) => e.type === 'meta');
  assert.ok(meta.token && meta.conversationId);
  assert.ok(evs.some((e) => e.type === 'delta') && evs.at(-1).type === 'done');
  assert.equal((await fetch(`${base}/api/chat/${meta.conversationId}/messages?token=nope`)).status, 403);
  const hist = await (await fetch(`${base}/api/chat/${meta.conversationId}/messages?token=${meta.token}`)).json();
  assert.equal(hist.messages[0].role, 'user');
  const hijack = await fetch(`${base}/api/chat/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'hi', conversationId: 1, token: 'bad' }) });
  assert.equal(hijack.status, 403);
});

test('API key and prompt never reach the browser', async () => {
  const office = JSON.stringify(await (await fetch(`${base}/api/office`)).json());
  assert.ok(!office.includes('SECRET') && !/system prompt|Truthfulness/i.test(office));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(path.resolve('public')).filter((f) => /\.(js|html|css)$/.test(f))) assert.ok(!/sk-ant|ANTHROPIC_API_KEY/.test(fs.readFileSync(f, 'utf8')), f);
});

test('oversized and malformed input is handled', async () => {
  const big = await fetch(`${base}/api/chat/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(200000) }) });
  assert.equal(big.status, 413);
  const empty = await fetch(`${base}/api/chat/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(empty.status, 400);
});

test('WhatsApp webhook: verify handshake + inbound message is parsed and answered', async () => {
  process.env.WHATSAPP_VERIFY_TOKEN = '';
  const { parseWebhook, uiToText } = await import('../adapters/whatsapp.js');
  const msgs = parseWebhook({ entry: [{ changes: [{ value: { contacts: [{ wa_id: '96170111222', profile: { name: 'Rima' } }], messages: [{ from: '96170111222', type: 'text', text: { body: 'hello' } }, { from: '96170111222', type: 'image' }] } }] }] });
  assert.deepEqual(msgs, [{ from: '96170111222', text: 'hello', name: 'Rima' }]);
  assert.equal((await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`)).status, 403);
  assert.match(uiToText([{ type: 'listings', items: [{ id: 3, title: 'T', price: 1000, type: 'rent', bedrooms: 2, size_m2: 90, area: 'Hamra' }] }]), /#3.*\$1,000\/mo/);
});
