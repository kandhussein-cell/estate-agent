import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client;
const getClient = () => (client ??= new Anthropic({ apiKey: config.llm.apiKey, timeout: config.llm.timeoutMs, maxRetries: config.llm.retries }));

/**
 * Anthropic provider with tool calling + streaming.
 * @returns {Promise<{content:any[], stop_reason:string}>}
 */
export async function complete({ system, messages, tools, onText }) {
  const stream = getClient().messages.stream({
    model: config.llm.model,
    max_tokens: 700,
    system,
    messages,
    ...(tools?.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })) } : {}),
  });
  if (onText) stream.on('text', onText);
  const msg = await stream.finalMessage();
  return { content: msg.content, stop_reason: msg.stop_reason };
}
