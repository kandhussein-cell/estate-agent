import { fileURLToPath } from 'node:url';
import { getDb } from './db.js';
import { getOffice, listOffices } from './offices.js';
import { freeSlots } from './scheduling.js';
import { getListing, recomputeLead } from './store.js';
import { addMinutes, nowLocal } from './time.js';

const HUES = { Achrafieh: 18, Hamra: 340, Verdun: 205, Hadath: 150, Baabda: 120, Jounieh: 195, 'Jal el Dib': 220, Dbayeh: 235, Broummana: 100, Tripoli: 40, Batroun: 180 };

// [title, type, category, area, price, beds, baths, m2, furnished, features, description, agent]
const LISTINGS = [
  ['Renovated 3BR in the heart of Achrafieh', 'sale', 'apartment', 'Achrafieh', 385000, 3, 2, 190, 0, ['elevator', 'parking', 'generator', 'electricity_24_7', 'balcony'], 'Bright, fully renovated apartment on a high floor, steps from Sursock Museum. Two parking spots.', 'karim'],
  ['Luxury 4BR with sea view, Verdun', 'sale', 'apartment', 'Verdun', 890000, 4, 4, 320, 0, ['sea_view', 'elevator', 'parking', 'generator', 'electricity_24_7', 'security'], 'Premium full-floor apartment with panoramic sea view, 24/7 concierge and private parking.', 'karim'],
  ['Family 2BR in Hadath, ready to move in', 'sale', 'apartment', 'Hadath', 128000, 2, 2, 115, 0, ['generator', 'parking', 'elevator', 'water_well'], 'Quiet building, new kitchen, water well and generator included. Great price per m².', 'karim'],
  ['Garden duplex in Baabda', 'sale', 'duplex', 'Baabda', 340000, 4, 3, 260, 0, ['garden', 'parking', 'solar', 'water_well', 'generator'], 'Spacious duplex with private garden, solar panels and water well. Calm residential street.', 'karim'],
  ['Sea-view 2BR in Jounieh', 'sale', 'apartment', 'Jounieh', 195000, 2, 2, 130, 0, ['sea_view', 'elevator', 'generator', 'parking'], 'Open sea view from the living room and master bedroom. 5 minutes from the Jounieh seafront.', 'karim'],
  ['Modern 3BR in Jal el Dib', 'sale', 'apartment', 'Jal el Dib', 245000, 3, 2, 165, 0, ['parking', 'generator', 'elevator', 'balcony'], 'Modern finishes, large balcony, close to Zalka highway and ABC Dbayeh.', 'karim'],
  ['Sea-view duplex with solar, Dbayeh', 'sale', 'duplex', 'Dbayeh', 520000, 4, 3, 300, 0, ['sea_view', 'parking', 'solar', 'generator', 'electricity_24_7'], 'Two-level duplex with terrace, solar system and 24/7 electricity. Direct highway access.', 'karim'],
  ['Mountain villa with garden, Broummana', 'sale', 'villa', 'Broummana', 640000, 4, 4, 420, 0, ['garden', 'solar', 'water_well', 'parking', 'generator', 'security'], 'Stand-alone villa on 1,100 m² land, pine views, solar + water well. Perfect year-round home.', 'karim'],
  ['Seaside 1BR in Batroun', 'sale', 'apartment', 'Batroun', 118000, 1, 1, 78, 0, ['sea_view', 'balcony', 'generator'], 'Steps from the Batroun old souk and beach. Strong summer rental potential.', 'karim'],
  ['Spacious 3BR in Tripoli', 'sale', 'apartment', 'Tripoli', 72000, 3, 2, 160, 0, ['elevator', 'generator'], 'Large family apartment in a well-kept building, excellent value per m².', 'karim'],
  ['Office, 85 m² in Hamra', 'sale', 'office', 'Hamra', 160000, 0, 1, 85, 0, ['elevator', 'generator', 'electricity_24_7'], 'Ready-to-use office on Hamra Main Street, reception area and two private rooms.', 'elie'],
  ['1,200 m² land with sea view, Batroun', 'sale', 'land', 'Batroun', 285000, 0, 0, 1200, 0, ['sea_view'], 'Buildable plot with sea view and road access, clean title. Ideal for a villa or small project.', 'elie'],
  ['600 m² building plot in Tripoli', 'sale', 'land', 'Tripoli', 60000, 0, 0, 600, 0, [], 'Flat plot in a developing neighbourhood, close to main road.', 'elie'],
  ['Ground-floor shop in Jounieh', 'sale', 'shop', 'Jounieh', 210000, 0, 1, 45, 0, ['parking', 'generator'], 'High-footfall corner shop near Jounieh old souk, large glass frontage.', 'elie'],
  ['2BR family apartment, Hadath', 'rent', 'apartment', 'Hadath', 650, 2, 2, 110, 0, ['generator', 'parking', 'water_well'], 'Unfurnished, ready to move in. Water well and generator subscription included.', 'nadine'],
  ['Cozy furnished 1BR, Hadath', 'rent', 'apartment', 'Hadath', 450, 1, 1, 70, 1, ['generator', 'elevator'], 'Fully furnished, ideal for a single or a couple. Quiet street, close to supermarkets.', 'nadine'],
  ['Furnished studio in Hamra', 'rent', 'studio', 'Hamra', 500, 0, 1, 45, 1, ['generator', 'elevator', 'electricity_24_7'], 'Walking distance to AUB. 24/7 electricity, internet-ready.', 'nadine'],
  ['Furnished 2BR in Achrafieh', 'rent', 'apartment', 'Achrafieh', 1400, 2, 2, 120, 1, ['elevator', 'parking', 'generator', 'electricity_24_7', 'balcony'], 'Stylish and fully equipped, balcony overlooking Sursock. Parking included.', 'nadine'],
  ['Sea-view 3BR in Verdun', 'rent', 'apartment', 'Verdun', 2500, 3, 3, 200, 1, ['sea_view', 'elevator', 'parking', 'electricity_24_7', 'security'], 'Premium furnished apartment with sea view and 24/7 security.', 'nadine'],
  ['2BR with sea glimpse, Jounieh', 'rent', 'apartment', 'Jounieh', 800, 2, 2, 105, 0, ['sea_view', 'generator', 'parking'], 'Bright apartment, five minutes from the highway.', 'nadine'],
  ['2BR with solar in Jal el Dib', 'rent', 'apartment', 'Jal el Dib', 900, 2, 2, 115, 0, ['parking', 'elevator', 'generator', 'solar'], 'Solar-powered building with low energy bills. Close to schools.', 'nadine'],
  ['3BR with garden, Baabda', 'rent', 'apartment', 'Baabda', 1100, 3, 2, 170, 0, ['garden', 'parking', 'water_well'], 'Ground-floor apartment with a private garden. Family-friendly area.', 'nadine'],
  ['2BR budget-friendly, Tripoli', 'rent', 'apartment', 'Tripoli', 300, 2, 1, 100, 0, ['generator'], 'Simple and clean. Generator available. Close to public transport.', 'nadine'],
  ['Furnished seaside studio, Batroun', 'rent', 'studio', 'Batroun', 600, 0, 1, 50, 1, ['sea_view', 'balcony'], 'Beachfront studio with balcony. Available long-term.', 'nadine'],
];

const NORTH_AREAS = new Set(['Jounieh', 'Jal el Dib', 'Dbayeh', 'Broummana', 'Batroun', 'Tripoli']);

/** Remove all rows of an office (demo reset). */
export function wipeOffice(db, officeId) {
  for (const t of ['events', 'followups', 'viewings', 'owner_leads', 'messages', 'conversations', 'leads', 'listings']) db.prepare(`DELETE FROM ${t} WHERE office_id=?`).run(officeId);
}

/** Seed listings only (no leads). */
export function seedListings(db, office) {
  const rows = LISTINGS.filter((l) => office.seedProfile !== 'north' || NORTH_AREAS.has(l[3]));
  const ins = db.prepare(`INSERT INTO listings (office_id,ref,title,type,category,area,price,bedrooms,bathrooms,size_m2,furnished,features,description,hue,agent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const prefix = office.brand.logoText;
  const agentIds = office.agents.map((a) => a.id);
  rows.forEach((l, i) => ins.run(office.id, `${prefix}-${String(i + 1).padStart(3, '0')}`, l[0], l[1], l[2], l[3], l[4], l[5], l[6], l[7], l[8], JSON.stringify(l[9]), l[10], HUES[l[3]] ?? 200,
    agentIds.includes(l[11]) ? l[11] : agentIds[i % agentIds.length]));
}

const LEADS = [
  { name: 'Rima Aoun', phone: '+96170123456', intent: 'rent', budget: 600, areas: ['Hadath'], bedrooms: 2, timeline: 'this month', financing: null, stage: 'viewing', source: 'whatsapp', language: 'arabizi', ago: 0.2, viewing: [15, 1],
    chat: [['user', 'baddi esta2jer sha2a bi Hadath, budget 600$'], ['assistant', 'Ahla Rima! Fi 3endna sha2a 2 ghoraf bi Hadath b 650$ bel shahr. Bte7eb tshoufa?'], ['user', 'eh yalla, ay yom?'], ['assistant', 'Tamem! A2rab mawa3id: Tue 10:00 · Wed 11:00. Ayya byenasebak?']] },
  { name: 'James Whitfield', phone: '+96176555123', intent: 'buy', budget: 400000, areas: ['Achrafieh'], bedrooms: 3, timeline: 'within 2 months', financing: 'cash', stage: 'negotiation', source: 'web', language: 'en', ago: 3, viewing: [1, 0],
    chat: [['user', "Hi, I'm looking to buy a 3 bedroom in Achrafieh, around 400k cash."], ['assistant', "Hi James! I have a renovated 3BR in Achrafieh at $385,000 — 190 m², elevator, generator, 2 parking spots. Want to see it?"], ['user', 'Yes. Is the price negotiable? I can close quickly.'], ['assistant', "Good question — I've asked one of our senior agents to discuss the price with you directly. They will contact you shortly."]] },
  { name: 'Camille Rizk', phone: '+96103987654', intent: 'buy', budget: 250000, areas: ['Jal el Dib'], bedrooms: 3, timeline: 'in 3 months', financing: 'loan', stage: 'qualified', source: 'web', language: 'fr', ago: 2, viewing: [6, 2],
    chat: [['user', "Bonjour, je cherche un appartement 3 chambres à Jal el Dib, budget 250 000 \$."], ['assistant', "Bonjour Camille ! Voici mon meilleur choix : Modern 3BR à Jal el Dib, 245 000 \$ — dans votre budget. Voulez-vous le visiter ?"]] },
  { name: 'Georges Khalil', phone: '+96171888999', intent: 'rent', budget: 1500, areas: ['Verdun', 'Achrafieh'], bedrooms: 2, timeline: 'asap', financing: null, stage: 'viewing', source: 'whatsapp', language: 'en', ago: 1, viewing: [18, 0],
    chat: [['user', 'Need a furnished 2BR in Achrafieh or Verdun ASAP, up to 1500'], ['assistant', 'Hi Georges! Furnished 2BR in Achrafieh, $1,400/month, with parking and 24/7 electricity. Shall I find you a viewing slot?'], ['user', 'Tomorrow if possible']] },
  { name: 'Hiba Nassar', phone: '+96178222333', intent: 'buy', budget: 130000, areas: ['Hadath'], bedrooms: 2, timeline: 'in 4 months', financing: 'payment_plan', stage: 'qualified', source: 'whatsapp', language: 'ar', ago: 4, hoursSilent: 80,
    chat: [['user', 'مرحبا، بدي اشتري شقة غرفتين بالحدث، ميزانيتي حدود 130 ألف دولار'], ['assistant', 'أهلاً هبة! عندي شقة 2 غرف بالحدث بـ$128,000، جاهزة للسكن. بتحبي تشوفيها؟']] },
  { name: 'Tarek Mansour', phone: null, intent: 'rent', budget: 450, areas: ['Hamra'], bedrooms: 1, timeline: null, financing: null, stage: 'new', source: 'web', language: 'en', ago: 0.5, hoursSilent: 30,
    chat: [['user', 'Hello, any 1 bedroom in Hamra around 450?'], ['assistant', "Hi! I don't have an exact 1BR in Hamra, but there's a furnished studio at $500/month with 24/7 electricity. Want details?"]] },
  { name: 'Dina Saade', phone: '+96170444555', intent: 'buy', budget: 650000, areas: ['Broummana'], bedrooms: 4, timeline: 'this month', financing: 'cash', stage: 'closed', source: 'web', language: 'en', ago: 12, done: true,
    chat: [['user', 'Looking for a villa in Broummana, cash buyer, ~650k.'], ['assistant', "Hi Dina! I have a stand-alone 4BR villa in Broummana at $640,000 — garden, solar, water well. Shall I book a viewing?"]] },
  { name: null, phone: null, intent: null, budget: null, areas: [], bedrooms: null, timeline: null, financing: null, stage: 'new', source: 'web', language: 'en', ago: 0.05, chat: [['user', 'Hi'], ['assistant', "Hi! I'm Layla — are you looking to buy, rent, or list a property?"]] },
];

/** Full demo dataset: listings + 8 leads (all stages) + 5 viewings + owner leads + a follow-up draft. */
export function seedDemo(db, office) {
  wipeOffice(db, office.id);
  seedListings(db, office);
  const now = nowLocal(office);
  const byIdx = (n) => db.prepare('SELECT id FROM listings WHERE office_id=? ORDER BY id LIMIT 1 OFFSET ?').get(office.id, n - 1)?.id;
  for (const L of LEADS) {
    const created = `datetime('now','-${Math.round(L.ago * 24 * 60)} minutes')`;
    const silent = L.hoursSilent ? `datetime('now','-${L.hoursSilent} hours')` : `datetime('now','-${Math.round(L.ago * 60)} minutes')`;
    const r = db.prepare(`INSERT INTO leads (office_id,name,phone,intent,budget,areas,bedrooms,timeline,financing,stage,source,language,last_customer_msg_at,last_reply_at,created_at,viewing_requested) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,${silent},${silent},${created},?)`)
      .run(office.id, L.name, L.phone, L.intent, L.budget, JSON.stringify(L.areas), L.bedrooms, L.timeline, L.financing, L.stage, L.source, L.language, L.viewing ? 1 : 0);
    const leadId = Number(r.lastInsertRowid);
    const c = db.prepare('INSERT INTO conversations (office_id,lead_id,channel,language,handoff_reason,handoff_urgency) VALUES (?,?,?,?,?,?)')
      .run(office.id, leadId, L.source, L.language, L.stage === 'negotiation' ? 'Customer wants to negotiate the price' : null, L.stage === 'negotiation' ? 'medium' : null);
    L.chat.forEach(([role, content], i) => db.prepare(`INSERT INTO messages (office_id,conversation_id,role,content,created_at) VALUES (?,?,?,?,datetime('now','-${Math.max(1, Math.round(L.ago * 1440) - i * 3)} minutes'))`).run(office.id, Number(c.lastInsertRowid), role, content));
    if (L.viewing) {
      const lid = byIdx(L.viewing[0]);
      const listing = lid ? getListing(db, office.id, lid) : null;
      const slot = listing ? freeSlots(db, office, listing, { limit: 6, now })[L.viewing[1]] : null;
      if (slot) db.prepare('INSERT INTO viewings (office_id,listing_id,lead_id,agent_id,start_at,end_at,name,phone) VALUES (?,?,?,?,?,?,?,?)').run(office.id, lid, leadId, slot.agent_id, slot.start, slot.end, L.name, L.phone);
    }
    if (L.done) {
      const lid = byIdx(8) || byIdx(1); const yesterday = addMinutes(`${now.slice(0, 10)}T11:00`, -1440);
      db.prepare("INSERT INTO viewings (office_id,listing_id,lead_id,agent_id,start_at,end_at,status,name,phone) VALUES (?,?,?,?,?,?,'done',?,?)").run(office.id, lid, leadId, 'karim', yesterday, addMinutes(yesterday, 45), L.name, L.phone);
    }
    recomputeLead(db, office, leadId);
  }
  db.prepare('INSERT INTO owner_leads (office_id,name,phone,property_type,area,asking_price,rent_or_sale,notes) VALUES (?,?,?,?,?,?,?,?)').run(office.id, 'Antoine Gebran', '+96103111222', 'apartment', 'Achrafieh', 420000, 'sale', '3BR, 180 m², needs valuation');
  db.prepare('INSERT INTO owner_leads (office_id,name,phone,property_type,area,asking_price,rent_or_sale,notes) VALUES (?,?,?,?,?,?,?,?)').run(office.id, 'Salma Fares', '+96171765432', 'shop', 'Hamra', 1800, 'rent', 'Ground floor, 40 m²');
  const t = db.prepare("SELECT id FROM leads WHERE office_id=? AND name='Tarek Mansour'").get(office.id);
  if (t) db.prepare('INSERT INTO followups (office_id,lead_id,kind,draft) VALUES (?,?,?,?)').run(office.id, t.id, '24h', "Hi Tarek, it's Layla from " + office.name + ". Still looking for a 1BR in Hamra? A furnished studio at $500/month with 24/7 electricity is available — want me to line up a quick viewing this week?");
}

/** Seed every office that has no listings yet (idempotent; used at server start). */
export function seedIfEmpty(db = getDb()) {
  for (const id of listOffices()) {
    const office = getOffice(id);
    if (!db.prepare('SELECT 1 FROM listings WHERE office_id=? LIMIT 1').get(id)) seedDemo(db, office);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = getDb();
  for (const id of listOffices()) seedDemo(db, getOffice(id));
  console.log('Seeded offices:', listOffices().join(', '));
}
