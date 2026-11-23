import { config } from '../config.js';
import * as anthropic from './anthropic.js';
import * as gemini from './gemini.js';
import * as mock from './mock.js';

/** Which provider is active: real Anthropic when a key exists, otherwise the offline demo engine. */
export function providerName() {
  const p = config.llm.provider;
  if (p === 'mock') return 'mock';
  if (p === 'anthropic') return 'anthropic';
  if (p === 'gemini') return 'gemini';
  if (config.gemini.apiKey) return 'gemini';
  return config.llm.apiKey ? 'anthropic' : 'mock';
}
export const getProvider = () => ({ anthropic, gemini, mock })[providerName()];
