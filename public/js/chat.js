import { $, h, api, applyBrand, initTheme, toggleTheme, setLang, getLang, toast, icon, money, FEATURE_LABELS, featIcon, listingImg, esc } from './common.js';

initTheme();
const params = new URLSearchParams(location.search);

const UI = {
  en: { placeholder: 'Type a message…', online: 'AI assistant · online', typing: 'typing…', book: 'Book viewing', compare: 'Compare', compareN: (n) => `Compare ${n} listings`, clear: 'Clear', human: 'Human agent', humanOn: (n) => `${n} joined the chat`, humanNote: 'A human agent will contact you shortly.', today: 'Today', retry: 'Try again', neterr: "I couldn't reach the server. Please try again.", exact: 'Best match', closest: 'Closest option', hotDemand: (n) => `${n} viewing(s) booked`, voice: 'Voice notes are transcribed automatically on WhatsApp (demo UI).', slotsTitle: 'Pick a viewing time', slotsSub: 'Free times from the agent’s calendar', confirmed: 'Viewing confirmed', addCal: 'Add to calendar', call: 'Call agent', agent: 'Agent', when: 'When', where: 'Property', bookMsg: (t, id) => `I'd like to book a viewing — ${t} (#${id})`, cmpMsg: (ids) => `Compare ${ids.map((i) => '#' + i).join(' and ')}`, beds: 'Bedrooms', baths: 'Bathrooms', size: 'Size', price: 'Price', area: 'Area', furn: 'Furnished', yes: 'Yes', no: 'No', ppm: (n) => `$${n.toLocaleString('en-US')}/m²`, bedsShort: 'BR', sale: 'For sale', rent: 'For rent', ownerNote: 'Owner request registered', recording: 'Recording…', cancel: 'Cancel', demo: 'Live demo', headline: (n) => `Your office never <em>misses a lead</em>, even at 2 a.m.`, lead: 'An AI sales assistant that answers in Arabic, Arabizi, English and French, qualifies buyers and tenants, recommends real listings, and books viewings — 24/7.', pts: ['Replies in the customer’s own language and script', 'Only recommends listings that really exist', 'Books viewings into your agents’ calendars', 'Hands hot or angry customers to a human'], demoTitle: 'Demo controls', office: 'Office theme', language: 'Interface language', theme: 'Appearance', reset: 'Reset demo data', returning: 'Simulate returning customer', dashboard: 'Open owner dashboard', light: 'Light', dark: 'Dark', provider: (p) => (p === 'mock' ? 'Offline demo engine (no API key set)' : 'Live Claude model'), resetDone: 'Demo data reset', needLogin: 'Dashboard PIN required — default 1234' },
  ar: { placeholder: 'اكتب رسالة…', online: 'مساعد ذكي · متصل', typing: 'عم يكتب…', book: 'احجز زيارة', compare: 'قارن', compareN: (n) => `قارن ${n} عقارات`, clear: 'مسح', human: 'موظف', humanOn: (n) => `انضم ${n} للمحادثة`, humanNote: 'رح يتواصل معك حدا من فريقنا قريباً.', today: 'اليوم', retry: 'جرّب مرة تانية', neterr: 'ما قدرت وصل للخادم. جرّب مرة تانية.', exact: 'أفضل خيار', closest: 'الأقرب', hotDemand: (n) => `${n} زيارة محجوزة`, voice: 'الرسائل الصوتية بتتحوّل لنص تلقائياً على واتساب (واجهة تجريبية).', slotsTitle: 'اختار موعد الزيارة', slotsSub: 'مواعيد فاضية من جدول الموظف', confirmed: 'تأكدت الزيارة', addCal: 'أضف للتقويم', call: 'اتصل بالموظف', agent: 'الموظف', when: 'الموعد', where: 'العقار', bookMsg: (t, id) => `بدي احجز زيارة — ${t} (#${id})`, cmpMsg: (ids) => `قارن ${ids.map((i) => '#' + i).join(' و ')}`, beds: 'غرف النوم', baths: 'الحمامات', size: 'المساحة', price: 'السعر', area: 'المنطقة', furn: 'مفروش', yes: 'نعم', no: 'لا', ppm: (n) => `$${n.toLocaleString('en-US')}/م²`, bedsShort: 'غرف', sale: 'للبيع', rent: 'للإيجار', ownerNote: 'تم تسجيل طلب المالك', recording: 'عم يسجّل…', cancel: 'إلغاء', demo: 'عرض مباشر', headline: () => `مكتبك ما بيفوّت <em>أي عميل</em> حتى الساعة 2 الفجر.`, lead: 'مساعد مبيعات ذكي بيجاوب بالعربي، العربيزي، الإنجليزي والفرنسي، بيأهّل المشتريين والمستأجرين، بيقترح عقارات حقيقية وبيحجز الزيارات — 24/7.', pts: ['بيرد بلغة وخط العميل', 'بيقترح بس عقارات موجودة فعلاً', 'بيحجز الزيارات بجدول موظفينك', 'بيحوّل العميل الغاضب أو الجاهز للشراء لموظف'], demoTitle: 'أدوات العرض', office: 'ثيم المكتب', language: 'لغة الواجهة', theme: 'المظهر', reset: 'إعادة ضبط البيانات', returning: 'محاكاة عميل راجع', dashboard: 'افتح لوحة المالك', light: 'فاتح', dark: 'داكن', provider: (p) => (p === 'mock' ? 'محرك تجريبي (بدون مفتاح API)' : 'نموذج Claude الحقيقي'), resetDone: 'تمت إعادة الضبط', needLogin: 'الرمز السري للوحة — الافتراضي 1234' },
  fr: { placeholder: 'Écrivez un message…', online: 'Assistant IA · en ligne', typing: 'écrit…', book: 'Réserver', compare: 'Comparer', compareN: (n) => `Comparer ${n} biens`, clear: 'Effacer', human: 'Agent humain', humanOn: (n) => `${n} a rejoint la conversation`, humanNote: 'Un agent vous contactera rapidement.', today: "Aujourd'hui", retry: 'Réessayer', neterr: 'Impossible de joindre le serveur. Réessayez.', exact: 'Meilleur choix', closest: 'Option la plus proche', hotDemand: (n) => `${n} visite(s) réservée(s)`, voice: 'Les notes vocales sont transcrites automatiquement sur WhatsApp (démo).', slotsTitle: 'Choisissez un créneau', slotsSub: "Créneaux libres de l'agenda de l'agent", confirmed: 'Visite confirmée', addCal: 'Ajouter au calendrier', call: "Appeler l'agent", agent: 'Agent', when: 'Quand', where: 'Bien', bookMsg: (t, id) => `Je voudrais réserver une visite — ${t} (#${id})`, cmpMsg: (ids) => `Comparer ${ids.map((i) => '#' + i).join(' et ')}`, beds: 'Chambres', baths: 'Salles de bain', size: 'Surface', price: 'Prix', area: 'Quartier', furn: 'Meublé', yes: 'Oui', no: 'Non', ppm: (n) => `$${n.toLocaleString('en-US')}/m²`, bedsShort: 'ch.', sale: 'À vendre', rent: 'À louer', ownerNote: 'Demande propriétaire enregistrée', recording: 'Enregistrement…', cancel: 'Annuler', demo: 'Démo en direct', headline: () => `Votre agence ne <em>rate plus aucun client</em>, même à 2 h du matin.`, lead: "Un assistant commercial IA qui répond en arabe, arabizi, anglais et français, qualifie acheteurs et locataires, recommande de vrais biens et réserve les visites — 24/7.", pts: ['Répond dans la langue et l’écriture du client', 'Ne propose que des biens qui existent vraiment', 'Réserve dans l’agenda de vos agents', 'Passe la main à un humain si nécessaire'], demoTitle: 'Contrôles de démo', office: "Thème de l'agence", language: "Langue de l'interface", theme: 'Apparence', reset: 'Réinitialiser les données', returning: 'Simuler un client connu', dashboard: 'Ouvrir le tableau de bord', light: 'Clair', dark: 'Sombre', provider: (p) => (p === 'mock' ? 'Moteur de démo hors ligne (pas de clé API)' : 'Modèle Claude en direct'), resetDone: 'Données réinitialisées', needLogin: 'PIN du tableau de bord — par défaut 1234' },
};

const state = { office: null, offices: [], provider: 'mock', ui: params.get('lang') || getLang('en'), conv: null, busy: false, cmp: new Set(), es: null, lastChips: [] };
const officeId = () => params.get('office') || state.office?.id || '';
const t = () => UI[state.ui] || UI.en;
const storeKey = () => `conv:${officeId() || 'default'}`;
const saveConv = () => { try { state.conv ? sessionStorage.setItem(storeKey(), JSON.stringify(state.conv)) : sessionStorage.removeItem(storeKey()); } catch { /* ignore */ } };
const loadConv = () => { try { return JSON.parse(sessionStorage.getItem(storeKey()) || 'null'); } catch { return null; } };

const msgs = $('#msgs'); const input = $('#input'); const sendBtn = $('#sendBtn'); const chipsEl = $('#chips'); const composer = $('#composer');
$('#micBtn').innerHTML = icon('mic', 20); sendBtn.innerHTML = icon('send', 20);

/* ---------------- boot ---------------- */
async function boot(keepConv = false) {
  try {
    const o = await api(`/office${officeId() ? `?office=${officeId()}` : ''}`);
    state.office = o; state.offices = o.offices; state.provider = o.provider;
    if (!params.get('office')) params.set('office', o.id);
  } catch (e) { msgs.replaceChildren(h('div.state.error', {}, h('b', {}, 'Cannot reach the server'), h('button.btn.sm', { onclick: () => boot() }, 'Retry'))); return; }
  applyBrand(state.office.brand);
  document.title = `${state.office.name} — AI Property Assistant`;
  $('meta[name=theme-color]').content = state.office.brand.primary;
  setLang(state.ui);
  renderChrome();
  msgs.replaceChildren();
  closeEvents();
  if (!keepConv) state.conv = loadConv();
  addDay();
  showGreeting();
  if (state.conv) await restoreHistory();
  scrollEnd();
}

function renderChrome() {
  const o = state.office;
  const avatar = o.brand.logo ? h('img', { src: o.brand.logo, alt: '' }) : o.brand.logoText;
  $('#chatHead').replaceChildren(
    h('div.avatar', {}, avatar),
    h('div.who', {}, h('b', {}, o.name), h('small', {}, h('span', { id: 'status' }, `${o.assistantName || 'Assistant'} · ${t().online.split('·')[1]?.trim() || ''}`), h('span.lang', { id: 'langBadge', title: 'Detected language', hidden: true }))),
    h('button.hbtn.menu', { 'aria-label': 'Demo controls', onclick: openSheet, html: icon('menu', 22) }),
  );
  $('#status').textContent = `${t().online}`;
  input.placeholder = t().placeholder;
  sendBtn.disabled = !input.value.trim();
  renderHero($('#hero'), true);
  setChips(state.office.quickReplies[state.ui] || state.office.quickReplies.en);
}

function renderHero(root, full) {
  const o = state.office; const tt = t();
  const seg = (items, cur, fn, label) => h('div.seg', { role: 'group', 'aria-label': label }, items.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(cur === v), onclick: () => fn(v) }, l)));
  const theme = (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const controls = h('div.demo-card', {},
    h('h2', {}, tt.demoTitle),
    h('div', {}, h('div.provider', {}, tt.office), h('div.row', { style: { marginTop: '6px' } }, state.offices.map((of) => h('button.btn.sm', { class: of.id === o.id ? 'primary' : '', onclick: () => switchOffice(of.id) }, h('span.swatch', { style: { background: of.brand.primary } }), of.name)))),
    h('div.row', {}, seg([['en', 'EN'], ['ar', 'عربي'], ['fr', 'FR']], state.ui, switchLang, tt.language), seg([['light', tt.light], ['dark', tt.dark]], theme, (v) => { if (v !== theme) toggleTheme(); renderChrome(); }, tt.theme)),
    h('div.row', {}, h('button.btn.sm', { onclick: returningCustomer, html: `${icon('user', 15)} ${esc(tt.returning)}` }), h('button.btn.sm', { onclick: resetDemo, html: `${icon('refresh', 15)} ${esc(tt.reset)}` })),
    h('div.row', {}, h('a.btn.sm.primary', { href: `/dashboard?office=${o.id}`, target: '_blank', rel: 'noopener', html: `${icon('grid', 15)} ${esc(tt.dashboard)}` }), h('span.provider', {}, tt.needLogin)),
    h('div.provider', {}, '● ', h('b', {}, tt.provider(state.provider))),
  );
  if (!full) { root.replaceChildren(controls); return; }
  root.replaceChildren(
    h('div.logo', {}, h('div.mark', {}, o.brand.logo ? h('img', { src: o.brand.logo, alt: '', width: 28 }) : o.brand.logoText), o.name),
    h('h1', { html: tt.headline(o.name) }),
    h('p.lead', {}, tt.lead),
    h('ul.points', {}, tt.pts.map((p) => h('li', {}, p))),
    controls,
  );
}

function openSheet() { renderHero($('#sheet'), false); $('#sheet').classList.remove('hidden'); $('#sheetBackdrop').classList.remove('hidden'); }
function closeSheet() { $('#sheet').classList.add('hidden'); $('#sheetBackdrop').classList.add('hidden'); }
$('#sheetBackdrop').addEventListener('click', closeSheet);

async function switchOffice(id) { params.set('office', id); history.replaceState(null, '', `?${params}`); state.conv = null; closeSheet(); await boot(); }
async function switchLang(l) { state.ui = l; setLang(l); closeSheet(); renderChrome(); const hist = state.conv; if (!hist) { msgs.replaceChildren(); addDay(); showGreeting(); } }
async function resetDemo() {
  try { await api(`/dash/demo/reset?office=${officeId()}`, { method: 'POST' }); toast(t().resetDone); } catch (e) { if (e.status === 401) { try { await api('/dash/login', { method: 'POST', body: { pin: prompt('Dashboard PIN') || '' } }); await api(`/dash/demo/reset?office=${officeId()}`, { method: 'POST' }); toast(t().resetDone); } catch (err) { toast(err.message); } } else toast(e.message); }
  state.conv = null; saveConv(); closeSheet(); await boot();
}
async function returningCustomer() {
  try { const r = await api(`/demo/returning?office=${officeId()}`, { method: 'POST' }); state.conv = { id: r.conversationId, token: r.token }; saveConv(); closeSheet(); await boot(true); toast('Returning customer loaded'); } catch (e) { toast(e.message); }
}

/* ---------------- rendering ---------------- */
const nowT = (iso) => new Date(iso ? iso.replace(' ', 'T') + 'Z' : Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const scrollEnd = () => { msgs.scrollTop = msgs.scrollHeight; };
function addDay() { msgs.append(h('div.day', {}, t().today)); }
function showGreeting() { const g = state.office.greeting[state.ui] || state.office.greeting.en; msgs.append(bubble('in', g)); }

function bubble(dir, text, { at, sender, cls = '' } = {}) {
  const b = h('div.bubble', { dir: 'auto' }, text, h('span.t', {}, nowT(at)));
  return h('div.row-msg', { class: `${dir} ${cls}` }, sender ? h('div.sender', {}, sender) : null, b);
}
function typingEl() { return h('div.row-msg.in', { id: 'typing', 'aria-label': t().typing }, h('div.bubble', {}, h('span.typing', {}, h('i'), h('i'), h('i')))); }

function setChips(list) {
  state.lastChips = list;
  chipsEl.replaceChildren(...(list || []).map((c, i) => h('button.chip', { type: 'button', style: { animationDelay: `${i * 50}ms` }, onclick: () => send(c) }, c)));
}

function featBadges(l, n = 3) {
  const lab = FEATURE_LABELS[state.ui] || FEATURE_LABELS.en;
  return h('div.feats', {}, (l.features || []).slice(0, n).map((f) => h('span.feat', { html: `${featIcon(f)}${esc(lab[f] || f)}` })), (l.features || []).length > n ? h('span.feat', {}, `+${l.features.length - n}`) : null);
}
function card(l, i, exact) {
  const tt = t(); const sel = state.cmp.has(l.id);
  return h('article.card', { 'aria-label': l.title },
    h('div.img', { style: { backgroundImage: `url("${listingImg(l)}")` } },
      h('span.price', {}, money(l.price, l.type === 'rent')),
      h('span.tag', { class: l.type }, l.type === 'rent' ? tt.rent : tt.sale),
      l.demand > 0 ? h('span.hot', {}, `🔥 ${tt.hotDemand(l.demand)}`) : null),
    h('div.body', {},
      h('h3', { dir: 'auto' }, l.title),
      h('div.loc', { html: `${icon('pin', 13)}${esc(l.area)}${l.price_per_m2 ? ` · ${esc(tt.ppm(l.price_per_m2))}` : ''}` }),
      h('div.facts', {}, l.bedrooms ? h('span', { html: `${icon('bed', 14)}${l.bedrooms} ${esc(tt.bedsShort)}` }) : null, l.bathrooms ? h('span', { html: `${icon('bath', 14)}${l.bathrooms}` }) : null, l.size_m2 ? h('span', { html: `${icon('area', 14)}${l.size_m2} m²` }) : null),
      featBadges(l),
      i === 0 && exact ? h('div.why', { html: `${icon('check', 13)} ${esc(tt.exact)}` }) : (!exact && i === 0 ? h('div.why', { style: { color: 'var(--warn)' } }, tt.closest) : null)),
    h('div.acts', {}, h('button.btn.primary', { onclick: () => send(tt.bookMsg(l.title, l.id)) }, tt.book),
      h('button.btn', { class: sel ? 'on' : '', 'aria-pressed': String(sel), onclick: (e) => toggleCompare(l.id, e.currentTarget) }, tt.compare)));
}
function cardsRow(ui) {
  return h('div.row-msg.in.wide', {}, h('div.cards', { class: ui.items.length === 1 ? 'single' : '' }, ui.items.map((l, i) => card(l, i, ui.exact))));
}
function toggleCompare(id, btn) {
  if (state.cmp.has(id)) state.cmp.delete(id); else if (state.cmp.size < 3) state.cmp.add(id); else return toast('Max 3');
  btn.classList.toggle('on', state.cmp.has(id)); btn.setAttribute('aria-pressed', String(state.cmp.has(id)));
  renderCompareBar();
}
function renderCompareBar() {
  const bar = $('#compareBar'); const n = state.cmp.size;
  bar.classList.toggle('hidden', n < 2);
  if (n < 2) return;
  bar.replaceChildren(h('span', {}, t().compareN(n)), h('div.row', {}, h('button.btn.sm.ghost', { onclick: () => { state.cmp.clear(); renderCompareBar(); $$cards(); } }, t().clear), h('button.btn.sm.primary', { onclick: () => { const ids = [...state.cmp]; state.cmp.clear(); renderCompareBar(); $$cards(); send(t().cmpMsg(ids)); } }, t().compare)));
}
const $$cards = () => document.querySelectorAll('.card .acts .btn:not(.primary)').forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });

function slotsEl(ui) {
  const tt = t();
  const el = h('div.slots', {}, h('h4', { html: `${icon('cal', 15)} ${esc(tt.slotsTitle)}` }), h('small', {}, ui.title ? `${ui.title} — ${tt.slotsSub}` : tt.slotsSub),
    h('div.slot-grid', {}, ui.slots.slice(0, 6).map((s) => h('button.slot', { onclick: () => { el.classList.add('used'); send(s.label); } }, s.label))));
  return h('div.row-msg.in.wide', {}, el);
}
function bookingEl(b) {
  const tt = t();
  return h('div.row-msg.in', {}, h('div.ticket', { role: 'group', 'aria-label': tt.confirmed },
    h('div.top', {}, h('div.ok', { html: icon('check', 20) }), h('div', {}, h('b', {}, tt.confirmed), h('small', {}, `#${b.viewing_id}`))),
    h('div.mid', {},
      h('div.ln', { html: `${icon('home', 16)}<div><b>${esc(b.title)}</b><small>${esc(b.area)}</small></div>` }),
      h('div.ln', { html: `${icon('cal', 16)}<div><b>${esc(b.label)}</b><small>${esc(tt.when)}</small></div>` }),
      h('div.ln', { html: `${icon('user', 16)}<div><b>${esc(b.agent)}</b><small>${esc(b.agent_phone || '')}</small></div>` })),
    h('div.foot', {}, h('button.btn', { onclick: () => downloadIcs(b) }, tt.addCal), h('a.btn.primary', { href: `tel:${(b.agent_phone || '').replace(/\s/g, '')}` }, tt.call))));
}
function downloadIcs(b) {
  const f = (s) => s.replace(/[-:]/g, '') + '00';
  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Estate Agent//EN\r\nBEGIN:VEVENT\r\nUID:viewing-${b.viewing_id}@estate-agent\r\nDTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z\r\nDTSTART:${f(b.start)}\r\nDTEND:${f(b.end)}\r\nSUMMARY:Viewing — ${b.title}\r\nDESCRIPTION:With ${b.agent} ${b.agent_phone || ''}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const a = h('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: `viewing-${b.viewing_id}.ics` }); document.body.append(a); a.click(); a.remove();
}
function compareEl(ui) {
  const tt = t(); const rows = [[tt.price, (l) => money(l.price, l.type === 'rent')], [tt.area, (l) => l.area], [tt.beds, (l) => l.bedrooms || '—'], [tt.baths, (l) => l.bathrooms || '—'], [tt.size, (l) => `${l.size_m2} m²`], ['$/m²', (l) => (l.price_per_m2 ? `$${l.price_per_m2}` : '—')], [tt.furn, (l) => (l.furnished ? tt.yes : tt.no)]];
  const lab = FEATURE_LABELS[state.ui] || FEATURE_LABELS.en;
  rows.push(['✓', (l) => (l.features || []).map((f) => lab[f] || f).join(', ') || '—']);
  const minPrice = Math.min(...ui.items.map((l) => l.price));
  return h('div.row-msg.in.wide', {}, h('div.cmp', {}, h('table', {}, h('thead', {}, h('tr', {}, h('th'), ui.items.map((l) => h('th', { dir: 'auto' }, l.title.length > 24 ? `${l.title.slice(0, 23)}…` : l.title)))),
    h('tbody', {}, rows.map(([k, fn]) => h('tr', {}, h('td', {}, k), ui.items.map((l) => h('td', { class: k === tt.price && l.price === minPrice ? 'best' : '', dir: 'auto' }, String(fn(l))))))))));
}
function renderUi(ui) {
  if (ui.type === 'listings') return cardsRow(ui);
  if (ui.type === 'slots') return slotsEl(ui);
  if (ui.type === 'booking') return bookingEl(ui);
  if (ui.type === 'compare') return compareEl(ui);
  if (ui.type === 'handoff') return h('div.note.human', { html: `${icon('headset', 16)} ${esc(t().humanNote)}` });
  if (ui.type === 'note') return h('div.note', { html: `${icon('check', 16)} ${esc(t().ownerNote)}` });
  return null;
}

/* ---------------- history & live channel ---------------- */
async function restoreHistory() {
  try {
    const r = await api(`/chat/${state.conv.id}/messages?office=${officeId()}&token=${state.conv.token}`);
    for (const m of r.messages) appendStored(m);
    const last = r.messages[r.messages.length - 1];
    setChips(last?.role === 'assistant' ? last.chips : []);
    if (r.mode === 'human') humanBanner();
    openEvents();
  } catch { state.conv = null; saveConv(); }
}
function appendStored(m) {
  if (m.role === 'user') msgs.append(bubble('out', m.content, { at: m.at }));
  else if (m.role === 'human') msgs.append(bubble('in', m.content, { at: m.at, sender: h('span', {}, `👤 ${m.agent || ''} · ${t().human}`), cls: 'human' }));
  else { msgs.append(bubble('in', m.content, { at: m.at })); for (const u of m.ui || []) { const e = renderUi(u); if (e) msgs.append(e); } }
}
function humanBanner() { if (!$('.note.human[data-mode]')) msgs.append(h('div.note.human', { 'data-mode': '1', html: `${icon('headset', 16)} ${esc(t().humanNote)}` })); }
function closeEvents() { state.es?.close(); state.es = null; }
function openEvents() {
  closeEvents();
  if (!state.conv) return;
  const es = new EventSource(`/api/chat/${state.conv.id}/events?token=${state.conv.token}`);
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'message' && (ev.role === 'human' || (ev.role === 'assistant' && ev.meta?.followup))) {
      const typ = $('#typing'); typ?.remove();
      msgs.append(ev.role === 'human' ? bubble('in', ev.content, { sender: h('span', {}, `👤 ${ev.meta?.agent || ''} · ${t().human}`), cls: 'human' }) : bubble('in', ev.content));
      scrollEnd();
    }
    if (ev.type === 'mode') { if (ev.mode === 'human') humanBanner(); }
  };
  state.es = es;
}

/* ---------------- sending ---------------- */
async function send(text) {
  text = (text ?? input.value).trim();
  if (!text || state.busy) return;
  state.busy = true; input.value = ''; sendBtn.disabled = true; setChips([]);
  msgs.append(bubble('out', text)); const typ = typingEl(); msgs.append(typ); scrollEnd();
  let cur = null; let curText = null; let gotChips = []; const pendingUi = [];
  const start = performance.now();
  try {
    const res = await fetch(`/api/chat/message?office=${officeId()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, conversationId: state.conv?.id, token: state.conv?.token }) });
    if (res.status === 403) { state.conv = null; saveConv(); throw new Error('session'); }
    if (!res.ok || !res.body) throw new Error('http');
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    const handle = (ev) => {
      if (ev.type === 'meta') { state.conv = { id: ev.conversationId, token: ev.token }; saveConv(); if (!state.es) openEvents(); }
      else if (ev.type === 'lang') { const b = $('#langBadge'); b.hidden = false; b.textContent = { ar: 'AR', arabizi: 'ARZ', fr: 'FR', en: 'EN' }[ev.language] || ev.language.toUpperCase(); }
      else if (ev.type === 'delta') {
        if (!cur) { typ.remove(); cur = bubble('in', ''); curText = cur.querySelector('.bubble'); curText.insertBefore(document.createTextNode(''), curText.firstChild); msgs.append(cur); }
        curText.firstChild.nodeValue += ev.text; scrollEnd();
      } else if (ev.type === 'tool') { /* keep typing indicator */ }
      else if (ev.type === 'ui') pendingUi.push(ev.ui);
      else if (ev.type === 'replace') { if (cur) curText.firstChild.nodeValue = ev.text; else { typ.remove(); cur = bubble('in', ''); curText = cur.querySelector('.bubble'); curText.insertBefore(document.createTextNode(ev.text), curText.firstChild); msgs.append(cur); } }
      else if (ev.type === 'chips') gotChips = ev.chips;
      else if (ev.type === 'human_mode') { typ.remove(); humanBanner(); }
    };
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); if (chunk.startsWith('data: ')) { try { handle(JSON.parse(chunk.slice(6))); } catch { /* partial */ } } }
    }
    typ.remove();
    for (const u of pendingUi) { const e = renderUi(u); if (e) msgs.append(e); }
    if (cur) { const tm = curText.querySelector('.t'); tm?.remove(); curText.append(h('span.t', {}, nowT())); }
    if (cur && curText.firstChild.nodeValue.trim() === '') cur.remove();
    window.__lastLatency = Math.round(performance.now() - start);
    // keep cards after text order: move any ui nodes already placed (they arrive after delta from the server loop)
  } catch (e) {
    typ.remove();
    const err = bubble('in', e.message === 'session' ? t().neterr : t().neterr, { cls: 'err' });
    err.append(h('button.btn.sm', { style: { marginTop: '6px' }, onclick: () => { err.remove(); send(text); } }, t().retry));
    msgs.append(err);
  } finally {
    typ.remove(); state.busy = false; sendBtn.disabled = !input.value.trim();
    setChips(gotChips.length ? gotChips : []); scrollEnd(); input.focus({ preventScroll: true });
  }
}

composer.addEventListener('submit', (e) => { e.preventDefault(); send(); });
input.addEventListener('input', () => { sendBtn.disabled = !input.value.trim() || state.busy; });

/* ---------------- voice (UI only) ---------------- */
let recTimer = null;
$('#micBtn').addEventListener('click', () => {
  const rec = $('#rec'); const on = rec.classList.contains('hidden');
  if (!on) { stopRec(true); return; }
  composer.classList.add('hidden'); chipsEl.classList.add('hidden'); rec.classList.remove('hidden');
  let s = 0;
  rec.replaceChildren(h('button.round.ghost', { 'aria-label': t().cancel, onclick: () => stopRec(false), html: icon('trash', 18) }), h('span.dot'), h('b', { id: 'recT' }, '0:00'), h('div.wave', {}, Array.from({ length: 28 }, (_, i) => h('i', { style: { animationDelay: `${(i % 9) * 90}ms` } }))), h('button.round.send', { 'aria-label': t().send || 'Send', onclick: () => stopRec(true), html: icon('send', 20) }));
  recTimer = setInterval(() => { s++; const el = $('#recT'); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 1000);
});
function stopRec(sent) { clearInterval(recTimer); $('#rec').classList.add('hidden'); composer.classList.remove('hidden'); chipsEl.classList.remove('hidden'); if (sent) toast(t().voice); }

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
boot();
