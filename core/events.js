import { EventEmitter } from 'node:events';
import { getDb } from './db.js';

/** In-process pub/sub used for dashboard SSE and chat live updates. */
export const bus = new EventEmitter();
bus.setMaxListeners(200);

/** Persist an event and broadcast it to dashboard subscribers. */
export function emitEvent(officeId, type, payload = {}) {
  try { getDb().prepare('INSERT INTO events (office_id,type,payload) VALUES (?,?,?)').run(officeId, type, JSON.stringify(payload)); } catch { /* non-fatal */ }
  bus.emit(`office:${officeId}`, { type, ...payload, at: Date.now() });
}
