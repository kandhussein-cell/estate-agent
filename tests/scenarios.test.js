import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';
import { SCENARIOS, runScenario } from '../scripts/scenarios.js';

for (const sc of SCENARIOS) {
  test(`scenario ${sc.name}`, async () => {
    const r = await runScenario(sc);
    assert.deepEqual(r.failures, []);
  });
}

test('bonus: Arabic-script buy inquiry gets Arabic cards + Arabic reply', async () => {
  const { makeEnv, say } = await import('../scripts/scenarios.js');
  const env = makeEnv();
  const t = await say(env, undefined, 'بدي إشتري شقة بالأشرفية ميزانيتي 400 ألف دولار');
  assert.ok(t.tools.includes('search_listings'), `tools: ${t.tools}`);
  assert.match(t.text, /[؀-ۿ]/);
  assert.ok(t.ui.some((u) => u.type === 'listings' && u.items.every((i) => i.type === 'sale')));
});

test('a second office works with zero code changes', async () => {
  const r = await runScenario(SCENARIOS[1], 'cedar-properties');
  assert.ok(r.transcript[0].tools.includes('search_listings'));
});
