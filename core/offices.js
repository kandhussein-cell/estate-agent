import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';

const cache = new Map();

/** List office ids available in /offices. */
export function listOffices() {
  return fs.readdirSync(path.join(ROOT, 'offices')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
}

/**
 * Load an office config by id. Unknown ids fall back to the default office.
 * @param {string} [id]
 */
export function getOffice(id) {
  const key = listOffices().includes(id) ? id : config.defaultOffice;
  if (!cache.has(key)) {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'offices', `${key}.json`), 'utf8'));
    cfg.id = key;
    cache.set(key, cfg);
  }
  return cache.get(key);
}

/** Public (browser-safe) subset of office config. */
export function publicOffice(o) {
  return { id: o.id, name: o.name, tagline: o.tagline, brand: o.brand, languages: o.languages, currency: o.currency,
    agents: o.agents.map((a) => ({ id: a.id, name: a.name, title: a.title })), hours: o.hours, greeting: o.greeting,
    quickReplies: o.quickReplies, areas: o.areas };
}

export function agentById(office, id) { return office.agents.find((a) => a.id === id); }
