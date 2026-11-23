import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, office_id TEXT NOT NULL, ref TEXT, title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('sale','rent')), category TEXT NOT NULL, area TEXT NOT NULL,
  price REAL NOT NULL, bedrooms INTEGER DEFAULT 0, bathrooms INTEGER DEFAULT 1, size_m2 INTEGER DEFAULT 0,
  furnished INTEGER DEFAULT 0, features TEXT DEFAULT '[]', description TEXT DEFAULT '',
  photos TEXT DEFAULT '[]', available INTEGER DEFAULT 1, agent_id TEXT, hue INTEGER DEFAULT 200,
  created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_listings_office ON listings(office_id, type, available);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, office_id TEXT NOT NULL, name TEXT, phone TEXT,
  intent TEXT, budget REAL, areas TEXT DEFAULT '[]', bedrooms INTEGER, furnished INTEGER,
  timeline TEXT, financing TEXT, decision_maker TEXT, notes TEXT DEFAULT '',
  score INTEGER DEFAULT 0, temperature TEXT DEFAULT 'cold', stage TEXT DEFAULT 'new',
  summary TEXT DEFAULT '', source TEXT DEFAULT 'web', language TEXT DEFAULT 'en',
  viewing_requested INTEGER DEFAULT 0, followup_stage INTEGER DEFAULT 0,
  last_customer_msg_at TEXT, last_reply_at TEXT, created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_leads_office ON leads(office_id, stage);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, office_id TEXT NOT NULL, lead_id INTEGER, channel TEXT DEFAULT 'web',
  external_id TEXT, language TEXT DEFAULT 'en', mode TEXT DEFAULT 'ai' CHECK(mode IN ('ai','human','closed')),
  handoff_reason TEXT, handoff_urgency TEXT, summary TEXT DEFAULT '', summary_upto INTEGER DEFAULT 0,
  state TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_conv_ext ON conversations(office_id, channel, external_id);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, office_id TEXT NOT NULL, conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','human','system')), content TEXT NOT NULL,
  meta TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS viewings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, office_id TEXT NOT NULL, listing_id INTEGER NOT NULL, lead_id INTEGER,
  agent_id TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  status TEXT DEFAULT 'booked' CHECK(status IN ('booked','cancelled','done')), name TEXT, phone TEXT,
  remind24 INTEGER DEFAULT 0, remind2 INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_viewing_slot ON viewings(office_id, agent_id, start_at) WHERE status='booked';
CREATE TABLE IF NOT EXISTS owner_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT, office_id TEXT NOT NULL, name TEXT, phone TEXT, property_type TEXT,
  area TEXT, asking_price REAL, rent_or_sale TEXT, notes TEXT DEFAULT '', status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT, office_id TEXT NOT NULL, lead_id INTEGER, viewing_id INTEGER,
  kind TEXT NOT NULL, draft TEXT NOT NULL, status TEXT DEFAULT 'ready', created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, office_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS rate_hits (key TEXT, ts INTEGER);
`;

let db;
/** Open (and lazily migrate) the SQLite database. Pass ':memory:' in tests. */
export function openDb(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const d = new Database(file);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');
  d.exec(SCHEMA);
  return d;
}
export function getDb() { return (db ??= openDb()); }
/** Replace the shared handle (tests). */
export function setDb(d) { db = d; }

export const j = (v, d = null) => { try { return v == null ? d : JSON.parse(v); } catch { return d; } };
