# Per-office checklist (what to change for each new customer)

**Identity**
- [ ] `offices/<id>.json`: `name`, `tagline`, `assistantName`, `phone`
- [ ] `brand.primary` / `brand.accent` (contrast: primary must work with white text), `brand.logoText` or `brand.logo`
- [ ] `greeting.en/ar/fr` and `quickReplies` wording in the office's voice; `tone`

**Operations**
- [ ] `agents[]`: real names, phones, `schedule.days` (0=Sun … 6=Sat) and `start`/`end`
- [ ] `hours` label, `viewingMinutes`, `timezone`
- [ ] `areas[]` the office actually covers (also add aliases in `core/areas.js` for new areas)

**Inventory**
- [ ] Replace seed listings via *Dashboard → Listings* (or import with a one-off script into `listings`)
- [ ] Assign each listing the right `agent_id`; upload real photos (placeholder art is shown until then)
- [ ] Verify prices are USD; rent is **per month**

**Security & config (.env / Render)**
- [ ] `DASHBOARD_PIN`, `SESSION_SECRET` changed; `DEMO_MODE=false`; `NODE_ENV=production`
- [ ] `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL`; run `LLM_PROVIDER=anthropic npm run simulate`
- [ ] `DB_PATH` on a persistent disk; backups enabled
- [ ] `DEFAULT_OFFICE=<id>`

**WhatsApp**
- [ ] Meta Business verified, number registered, token + phone-number ID + app secret set
- [ ] Webhook `https://<domain>/webhooks/whatsapp?office=<id>` verified, *messages* subscribed
- [ ] Message templates approved for follow-ups outside the 24h window

**Content review with the owner**
- [ ] Read `core/prompt.js` rules together (handoff triggers, price negotiation policy, disclaimers)
- [ ] Decide who receives handoffs and how fast they must respond
- [ ] Test the 6 scenarios on their real number: Arabizi rent, English buy, French, owner listing, angry customer, off-topic

**Office knowledge (so the AI answers questions about *your* office)**
- [ ] Add `"faq": [{ "q": "What is your commission?", "a": "..." }, ...]` to `offices/<id>.json` (fees, documents needed, viewing process, payment plans, opening hours, parking, languages spoken).
- [ ] The AI answers office questions ONLY from this list; anything missing is handed to a human agent. Never put guesses in it.
- [ ] Inventory is entered in *Dashboard -> Listings* (title, price, area, size, features, photos); the AI never invents beyond it.
