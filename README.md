# Estate Agent — white-label AI sales & booking agent for real estate offices

An AI agent that answers customers instantly (Lebanese Arabic, Arabizi, English, French), qualifies them,
recommends **real** listings (sale + rent), books viewings into agents' calendars, scores leads, hands off to a
human when needed and follows up. The office owner watches everything live in a dashboard.

* **Customer chat** — WhatsApp-style phone UI: `http://localhost:3270/`
* **Owner dashboard** — PIN login: `http://localhost:3270/dashboard` (demo PIN `1234`)
* Works **without an API key** (built-in offline demo engine) so you can demo anywhere; add `ANTHROPIC_API_KEY` for the real model.

```bash
npm install
npm start          # seeds demo data on first run, then serves on :3270
npm test           # 45 tests: tools, scoring, booking conflicts, API/security, follow-ups, 6 scenarios, fake-Anthropic integration
npm run simulate   # the 6 scripted scenarios, verbose with -v
```

## Architecture

```
                 ┌────────────────────┐        ┌──────────────────────────┐
 Browser (web) ──▶  routes/chat.js    │        │ WhatsApp Cloud API       │
  SSE stream      │  POST /api/chat/  │        │  (Meta webhook)          │
                 └─────────┬──────────┘        └───────────┬──────────────┘
                           │                               │
                           │            adapters/whatsapp.js (verify / receive / send)
                           ▼                               ▼
                 ┌───────────────────────────────────────────────────────┐
                 │ core/agent.js   handleMessage(office, conv, text, ch)  │  channel-agnostic
                 │  sanitize → rate-limit → detect language → store msg   │
                 │  build prompt (core/prompt.js: office + time + state)  │
                 │  loop: LLM ⇄ tools (max 5 rounds), stream text (SSE)   │
                 │  score lead → summary → persist → broadcast            │
                 └───────┬───────────────────────────────┬───────────────┘
                         │                               │
              core/llm/anthropic.js              core/tools.js (9 tools)
              core/llm/mock.js  (offline)         validate (core/validate.js) → handlers
                                                          │
                          ┌───────────────────────────────┼────────────────────────┐
                          ▼                               ▼                        ▼
                 core/scheduling.js              core/scoring.js           core/store.js
                 (slots, no double booking)      (0–100 → hot/warm/cold)   (leads, summary)
                          └───────────────────────────────┬────────────────────────┘
                                                          ▼
                                   SQLite (better-sqlite3)  — every table has office_id
                                                          ▲
 Owner dashboard ──▶ routes/dashboard.js (PIN cookie, REST + SSE live events via core/events.js)
 node-cron ───────▶ core/followups.js (24h/72h drafts, 24h/2h viewing reminders) ─▶ core/delivery.js ─▶ web SSE / WhatsApp
 offices/<id>.json ─▶ core/offices.js  (brand, agents, hours, languages, tone…)  — zero code changes per office
```

Key rules enforced in code (not just in the prompt):

| Rule | Where |
|---|---|
| The model can write to the DB **only** through the 9 tools, each validated against its JSON schema | `core/tools.js`, `core/validate.js` |
| No invented listings: recommendations come from `search_listings` results; unavailable ones never appear | `core/tools.js` |
| No double booking: availability check + atomic transaction + unique partial DB index | `core/scheduling.js`, `core/db.js` |
| Cancel/reschedule needs the booking phone; "wrong phone" and "unknown id" answer identically (no data leak) | `core/tools.js` |
| Lead score recomputed after every message and tool write | `core/store.js#recomputeLead` |
| Prompt-injection flagged and the model warned; prompt never sent to the browser | `core/guard.js`, `core/prompt.js` |
| Long chats are summarized automatically (>30 unsummarized messages) | `core/summarize.js` |
| LLM errors/timeouts: retry once, then a friendly localized fallback and a dashboard alert | `core/agent.js` |

## Add a new office in 5 minutes

1. Copy `offices/beirut-homes.json` → `offices/<new-id>.json`.
2. Edit: `name`, `tagline`, `brand.primary/accent/logoText` (or `brand.logo` = a URL/`/uploads/…`), `assistantName`,
   `greeting` (en/ar/fr), `phone`, `hours`, `areas`, `agents` (id, name, phone, weekly `schedule`), `tone`.
3. Start the server — an office with no listings is seeded automatically (`seedProfile`: `full` or `north`), **or**
   add real listings from *Dashboard → Listings → Add listing*.
4. Open `/?office=<new-id>` and `/dashboard?office=<new-id>`. Set `DEFAULT_OFFICE=<new-id>` in `.env` to make it the default.

Multi-office hosting: every table carries `office_id`; use one deployment per paying customer (simplest) or one
shared deployment with `?office=`. For production multi-tenant, give each office its own dashboard PIN (see "Hardening").

## Connect WhatsApp Cloud API

1. Create a Meta app → add **WhatsApp** → get a **Phone number ID** and a (permanent) **access token** (System User).
2. Set in `.env` (or Render env): `WHATSAPP_VERIFY_TOKEN` (any random string you choose), `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` (enables `X-Hub-Signature-256` checking).
3. In the Meta dashboard → WhatsApp → Configuration → Webhook:
   callback URL `https://<your-domain>/webhooks/whatsapp?office=<office-id>`, verify token = your `WHATSAPP_VERIFY_TOKEN`,
   subscribe to **messages**.
4. Message the number. Inbound text → `handleMessage(channel='whatsapp', externalId=<customer number>)`; replies, listing
   summaries and quick-reply buttons go back through `adapters/whatsapp.js#sendText`. The same conversation appears in the
   dashboard; **Take over chat** replies from the dashboard are sent to the customer's WhatsApp too.
5. Outside the 24-hour customer-service window WhatsApp requires approved **template messages**; follow-ups/reminders sent
   later than 24h after the customer's last message must be sent as templates (extend `sendText` with a template call).

Without credentials `sendText` is a logged no-op, so nothing breaks in demos.

## Deploy on Render

1. Push this folder to a GitHub repo.
2. Render → **New → Blueprint** → pick the repo (it reads `render.yaml`), or create a **Web Service** manually:
   build `npm install`, start `npm start`, health check `/healthz`.
3. **Add a persistent disk** (SQLite lives on it): mount path `/var/data`, 1 GB, and set `DB_PATH=/var/data/app.db`.
   (Disks require a paid instance; on the free plan data resets on every deploy — fine for a throwaway demo.)
4. Environment: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DASHBOARD_PIN` (change it!), `SESSION_SECRET` (long random),
   `DEFAULT_OFFICE`, `DEMO_MODE` (`true` for sales demos, **`false` in production**), `NODE_ENV=production`, WhatsApp vars.
5. Deploy, open `https://<service>.onrender.com/` and `/dashboard`. Keep one instance (SQLite + in-process scheduler).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | – | Enables Gemini (wins over Anthropic when both set). Server-side only. |
| `ANTHROPIC_API_KEY` | – | Enables the real model. Server-side only; never sent to the browser. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model name. |
| `LLM_PROVIDER` | `auto` | `auto` (key → anthropic, else mock), `anthropic`, `mock`. |
| `PORT` | `3270` | HTTP port (Render sets it). |
| `DEFAULT_OFFICE` | `beirut-homes` | Office used when `?office=` is missing/unknown. |
| `DASHBOARD_PIN` | `1234` | Dashboard login PIN. **Change in production.** |
| `SESSION_SECRET` | dev value | Signs dashboard sessions and chat conversation tokens. |
| `CORS_ORIGINS` | empty | Comma-separated origins allowed for cross-origin API use / iframe embedding. |
| `DEMO_MODE` | `true` | Enables demo reset + auto-sending follow-ups. Set `false` in production. |
| `DB_PATH` | `./data/app.db` | SQLite file. |
| `WHATSAPP_VERIFY_TOKEN` / `_ACCESS_TOKEN` / `_PHONE_NUMBER_ID` / `_APP_SECRET` | – | WhatsApp Cloud API. |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error`. |

## Project layout

```
server.js                 Express app (helmet, CSP, rate limits, CORS, error handler)
core/                     agent, prompt, tools, validate, scheduling, scoring, store, guard, lang, areas, followups, summarize, seed, db…
core/llm/                 anthropic.js (streaming + tools), mock.js (offline engine), i18n.js (mock replies)
adapters/whatsapp.js      webhook verify/receive/send + WhatsApp text rendering of cards
routes/                   chat.js (public) · dashboard.js (PIN-protected)
offices/*.json            one file per office (brand, agents, hours, languages, tone)
public/                   chat (index.html) + dashboard — vanilla JS/CSS, no build step
scripts/                  scenarios.js + simulate.js
tests/                    node:test suites
```

## Hardening before real customers

* Change `DASHBOARD_PIN` and `SESSION_SECRET`; serve over HTTPS (cookie is `Secure` when `NODE_ENV=production`).
* Per-office PINs/accounts and per-office WhatsApp numbers if you host several offices in one deployment.
* Add WhatsApp template messages for follow-ups outside the 24h window.
* Back up the SQLite disk (Render disk snapshots) or move to Postgres if you outgrow one instance.
* Have the office review the system prompt wording (`core/prompt.js`) and their legal disclaimer.

## Demo-mode engine vs the real model

With no API key the app uses `core/llm/mock.js`: a deterministic rule-based policy speaking the exact same tool protocol.
It is good enough for a convincing sales demo and for deterministic tests, but it is not the product: the real model
handles open conversation, objections, mixed languages and edge cases far better. Always run
`LLM_PROVIDER=anthropic npm run simulate` (with a key) before showing a customer the "live AI" version.
