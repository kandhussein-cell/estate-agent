import { config } from '../config.js';
import { log } from '../logger.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Gemini accepts an OpenAPI subset: drop keywords it rejects, keep types/enums/ranges. */
function cleanSchema(s) {
  if (Array.isArray(s)) return s.map(cleanSchema);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (['maxLength', 'pattern', 'additionalProperties', 'minItems'].includes(k)) continue;
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v).map(([p, sub]) => [p, cleanSchema(sub)])) : cleanSchema(v);
  }
  return out;
}

/** Anthropic-style messages → Gemini contents. Thought signatures on tool calls are preserved verbatim. */
export function toGeminiContents(messages) {
  const names = {};
  const contents = [];
  for (const m of messages) {
    if (typeof m.content === 'string') { contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }); continue; }
    if (m.role === 'assistant') {
      const parts = [];
      for (const b of m.content) {
        if (b.type === 'text' && b.text) parts.push({ text: b.text });
        if (b.type === 'tool_use') { names[b.id] = b.name; parts.push({ ...(b._part || {}), functionCall: { name: b.name, args: b.input || {} } }); }
      }
      if (parts.length) contents.push({ role: 'model', parts });
    } else {
      const parts = m.content.filter((b) => b.type === 'tool_result').map((b) => {
        let result; try { result = JSON.parse(b.content); } catch { result = { text: String(b.content) }; }
        return { functionResponse: { name: names[b.tool_use_id] || 'tool', response: { result } } };
      });
      if (parts.length) contents.push({ role: 'user', parts });
    }
  }
  return contents;
}

async function openStream(body) {
  const models = config.gemini.models;
  let last;
  for (let attempt = 0; attempt < models.length + 1; attempt++) {
    const model = models[attempt % models.length];
    try {
      const res = await fetch(`${BASE}/${model}:streamGenerateContent?alt=sse`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.gemini.apiKey }, body, signal: AbortSignal.timeout(config.llm.timeoutMs) });
      if (res.ok) return res;
      const txt = (await res.text()).slice(0, 300);
      last = Object.assign(new Error(`Gemini ${res.status}: ${txt}`), { status: res.status });
      log.warn('gemini_http', { model, status: res.status });
      if (![429, 500, 503].includes(res.status)) throw last;
    } catch (e) { last = e; if (e.status && ![429, 500, 503].includes(e.status)) throw e; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw last;
}

/**
 * Gemini provider (same contract as the Anthropic one): streams text, returns Anthropic-style content blocks.
 * @returns {Promise<{content:any[], stop_reason:string}>}
 */
export async function complete({ system, messages, tools, onText }) {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: toGeminiContents(messages),
    ...(tools?.length ? { tools: [{ functionDeclarations: tools.map((t) => (Object.keys(t.input_schema.properties || {}).length ? { name: t.name, description: t.description, parameters: cleanSchema(t.input_schema) } : { name: t.name, description: t.description })) }] } : {}),
    generationConfig: { maxOutputTokens: 1024, temperature: 0.6 },
  });
  const res = await openStream(body);
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = ''; let text = ''; const calls = []; let finish = '';
  const handle = (chunk) => {
    const cand = chunk.candidates?.[0];
    finish = cand?.finishReason || finish;
    for (const p of cand?.content?.parts || []) {
      if (p.functionCall) calls.push(p);
      else if (p.text && !p.thought) { text += p.text; onText?.(p.text); }
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, '');
      const line = raw.split(/\r?\n/).find((l) => l.startsWith('data:'));
      if (line) { try { handle(JSON.parse(line.slice(5))); } catch { /* partial */ } }
    }
  }
  if (!text && !calls.length) throw new Error(`Gemini returned no content (${finish || 'unknown'})`);
  const content = [];
  if (text) content.push({ type: 'text', text });
  calls.forEach((p, i) => {
    const { functionCall, ...rest } = p;
    content.push({ type: 'tool_use', id: `gem_${Date.now()}_${i}`, name: functionCall.name, input: functionCall.args || {}, _part: rest });
  });
  return { content, stop_reason: calls.length ? 'tool_use' : 'end_turn' };
}
