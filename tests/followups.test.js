import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';
import { makeEnv } from './helpers.js';
import { runFollowups, sendFollowup } from '../core/followups.js';

test('follow-up engine drafts 24h / 72h messages in the lead language, once per stage', async () => {
  const env = makeEnv();
  env.db.prepare('DELETE FROM followups').run();
  const n = await runFollowups(env.db, env.office);
  assert.ok(n >= 2);
  const rows = env.db.prepare("SELECT f.*, l.name FROM followups f JOIN leads l ON l.id=f.lead_id WHERE f.kind IN ('24h','72h')").all();
  const tarek = rows.find((r) => r.name === 'Tarek Mansour');
  const hiba = rows.find((r) => r.name === 'Hiba Nassar');
  assert.equal(tarek.kind, '24h');
  assert.match(tarek.draft, /Hi Tarek/);
  assert.equal(hiba.kind, '72h');
  assert.match(hiba.draft, /[؀-ۿ]/);
  assert.equal(env.db.prepare("SELECT status FROM followups WHERE id=?").get(tarek.id).status, 'ready');
  assert.equal(await runFollowups(env.db, env.office), 0, 'idempotent');
  assert.equal(await sendFollowup(env.db, env.office, tarek.id), true);
  assert.equal(env.db.prepare('SELECT status FROM followups WHERE id=?').get(tarek.id).status, 'sent');
  const msg = env.db.prepare("SELECT content, meta FROM messages WHERE content LIKE 'Hi Tarek%'").get();
  assert.ok(msg && JSON.parse(msg.meta).followup === '24h');
});

test('closed leads and human-controlled chats are not nagged; viewing reminders fire once', async () => {
  const env = makeEnv();
  env.db.prepare('DELETE FROM followups').run();
  env.db.prepare("UPDATE conversations SET mode='human' WHERE lead_id=(SELECT id FROM leads WHERE name='Tarek Mansour')").run();
  await runFollowups(env.db, env.office);
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM followups f JOIN leads l ON l.id=f.lead_id WHERE l.name IN ('Tarek Mansour','Dina Saade') AND f.kind IN ('24h','72h')").get().n, 0);
  // pull Rima's viewing to 5h from now → 24h reminder; then 1h → 2h reminder
  const { addMinutes, nowLocal } = await import('../core/time.js');
  const v = env.db.prepare("SELECT v.id FROM viewings v JOIN leads l ON l.id=v.lead_id WHERE l.name='Rima Aoun'").get();
  env.db.prepare('DELETE FROM followups').run();
  env.db.prepare('UPDATE viewings SET start_at=?, remind24=0, remind2=0 WHERE id=?').run(addMinutes(nowLocal(env.office), 300), v.id);
  await runFollowups(env.db, env.office);
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM followups WHERE viewing_id=? AND kind='reminder24'").get(v.id).n, 1);
  await runFollowups(env.db, env.office);
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM followups WHERE viewing_id=? AND kind='reminder24'").get(v.id).n, 1, 'no duplicate');
  env.db.prepare('UPDATE viewings SET start_at=? WHERE id=?').run(addMinutes(nowLocal(env.office), 90), v.id);
  await runFollowups(env.db, env.office);
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM followups WHERE viewing_id=? AND kind='reminder2'").get(v.id).n, 1);
});
