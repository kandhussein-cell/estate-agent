import { providerName } from '../core/llm/index.js';
import { SCENARIOS, runScenario } from './scenarios.js';

/** Runs the 6 scripted scenarios end to end. Uses the live model when ANTHROPIC_API_KEY is set (LLM_PROVIDER=anthropic). */
const verbose = process.argv.includes('-v') || process.argv.includes('--verbose');
console.log(`Provider: ${providerName()}\n`);
let failed = 0;
for (const sc of SCENARIOS) {
  const r = await runScenario(sc);
  console.log(`${r.ok ? '✔' : '✘'} ${r.name}`);
  if (verbose || !r.ok) for (const s of r.transcript) console.log(`    👤 ${s.customer}\n    🤖 ${s.agent.replace(/\n/g, ' ')}  [tools: ${s.tools.join(', ') || '—'}${s.ui.length ? ` | ui: ${s.ui.join(', ')}` : ''}]`);
  for (const f of r.failures) console.log(`    ✘ ${f}`);
  if (!r.ok) failed++;
}
console.log(`\n${SCENARIOS.length - failed}/${SCENARIOS.length} scenarios passed`);
process.exit(failed ? 1 : 0);
