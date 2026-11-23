import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Point the real Anthropic SDK at a local fake API to exercise the production code path
// (streaming, tool_use round-trip, retries, error fallback) without a network or API key.
process.env.NODE_ENV = 'test';
process.env.LLM_PROVIDER = 'anthropic';
process.env.ANTHROPIC_API_KEY = 'test-key';

const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const msgStart = { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', content: [], model: 'x', stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } };
const toolTurn = sse([msgStart,
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'search_listings', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"type":"rent","area":"Hadath","max_price":700}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } }, { type: 'message_stop' }]);
const textTurn = (text) => sse([msgStart,
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  ...text.split(' ').map((w, i) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: (i ? ' ' : '') + w } })),
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } }, { type: 'message_stop' }]);

let mode = 'normal'; let requests = [];
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const json = JSON.parse(body || '{}'); requests.push(json);
    if (mode === 'down') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"type":"error","error":{"type":"api_error","message":"boom"}}'); }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (mode === 'liar') return res.end(textTurn('Great Rima, your viewing is booked for tomorrow at 11:00!'));
    const hasResult = json.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result'));
    res.end(hasResult ? textTurn('I found a great two bedroom in Hadath for you. Want to see it? <chips>Book viewing | Show more</chips>') : toolTurn);
  });
});
await new Promise((r) => server.listen(0, r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;

const { makeEnv, say } = await import('../scripts/scenarios.js');
const { providerName } = await import('../core/llm/index.js');

test('real SDK path: streaming + tool_use round trip + chips + tool schemas sent', async () => {
  assert.equal(providerName(), 'anthropic');
  const env = makeEnv(); requests = []; mode = 'normal';
  const t = await say(env, undefined, 'I want to rent in Hadath under 700');
  assert.deepEqual(t.tools, ['search_listings']);
  assert.ok(t.ui.some((u) => u.type === 'listings'));
  assert.match(t.text, /great two bedroom in Hadath/);
  assert.ok(!t.text.includes('chips'), 'chips tag hidden from the customer');
  const stored = env.db.prepare("SELECT meta FROM messages WHERE role='assistant' ORDER BY id DESC LIMIT 1").get();
  assert.deepEqual(JSON.parse(stored.meta).chips, ['Book viewing', 'Show more']);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].tools.length, 9);
  assert.match(requests[0].system, /Beirut Homes/);
  assert.match(requests[0].system, /never reveal/i);
  assert.ok(requests[1].messages.at(-1).content[0].type === 'tool_result');
});

test('API outage: retries, then friendly fallback in the customer language; chat keeps working', async () => {
  const env = makeEnv(); requests = []; mode = 'down';
  const t = await say(env, undefined, 'Bonjour, je cherche un appartement à louer');
  assert.equal(t.error, true);
  assert.match(t.text, /agent/i);
  assert.ok(requests.length >= 2, 'retried');
  mode = 'normal';
  const t2 = await say(env, t.convId, 'I want to rent in Hadath under 700');
  assert.ok(!t2.error);
});

test('truthfulness guard: a model claiming a booking without book_viewing is overridden', async () => {
  const env = makeEnv(); mode = 'liar';
  const evs = [];
  const t = await say(env, undefined, 'Rima 03 123 456, tomorrow 11 please', { onEvent: undefined });
  assert.ok(!/is booked/i.test(t.replies[0].content), t.replies[0].content);
  assert.match(t.replies[0].content, /haven't confirmed/);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM viewings WHERE name=?').get('Rima').n, 0);
  void evs; mode = 'normal';
});

test.after(() => server.close());
