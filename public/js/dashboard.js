import { $, h, api, applyBrand, initTheme, toggleTheme, setLang, getLang, toast, icon, money, timeAgo, esc, listingImg, FEATURE_LABELS } from './common.js';

initTheme();
const params = new URLSearchParams(location.search);
const STAGES = ['new', 'qualified', 'viewing', 'negotiation', 'closed'];
const L = {
  en: { overview: 'Overview', pipeline: 'Pipeline', viewings: 'Viewings', listings: 'Listings', owners: 'Owners', analytics: 'Analytics', new: 'New', qualified: 'Qualified', viewing: 'Viewing booked', negotiation: 'Negotiation', closed: 'Closed',
    kNew: 'New leads today', kHot: 'Hot leads', kView: 'Viewings this week', kResp: 'AI response time', kHand: 'Needs a human', kConv: 'Conversion', live: 'Live', logout: 'Log out', theme: 'Theme', demo: 'Demo controls', lang: 'العربية' },
  ar: { overview: 'نظرة عامة', pipeline: 'مسار العملاء', viewings: 'الزيارات', listings: 'العقارات', owners: 'المالكون', analytics: 'التحليلات', new: 'جديد', qualified: 'مؤهَّل', viewing: 'زيارة محجوزة', negotiation: 'تفاوض', closed: 'مغلق',
    kNew: 'عملاء جدد اليوم', kHot: 'عملاء ساخنون', kView: 'زيارات هالأسبوع', kResp: 'سرعة رد الذكاء', kHand: 'بحاجة لموظف', kConv: 'نسبة الإغلاق', live: 'مباشر', logout: 'خروج', theme: 'المظهر', demo: 'أدوات العرض', lang: 'English' },
};
const S = { office: null, offices: [], view: 'overview', lang: getLang('en'), kpis: null, leads: [], viewings: [], listings: [], owners: [], analytics: null, followups: [], feed: [], drawer: null, agentFilter: 'all', weekOffset: 0, live: false, es: null, demoMode: true, listingFilter: 'all' };
const t = (k) => (L[S.lang] || L.en)[k] || L.en[k] || k;
const officeQ = () => `office=${params.get('office') || S.office?.id || ''}`;
const A = (p, o) => api(`/dash${p}${p.includes('?') ? '&' : '?'}${officeQ()}`, o);
const app = $('#app');
const AGENT_COLORS = ['#2f6fdd', '#c8553d', '#1a9a63', '#8a4fd6', '#d98b00'];
const agentColor = (id) => AGENT_COLORS[Math.max(0, (S.office?.agents || []).findIndex((a) => a.id === id)) % AGENT_COLORS.length];
const initials = (n) => (n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const featLabel = (k) => (FEATURE_LABELS.en[k] || k);

/* ---------------- boot & auth ---------------- */
async function boot() {
  setLang(S.lang);
  try { const o = await fetch(`/api/office?${officeQ()}`).then((r) => r.json()); S.office = o; S.offices = o.offices; params.set('office', o.id); applyBrand(o.brand); document.title = `${o.name} — Dashboard`; $('meta[name=theme-color]').content = o.brand.primary; } catch { return fatal('Cannot reach the server'); }
  try { const s = await A('/session'); S.demoMode = s.demoMode; start(); } catch (e) { e.status === 401 ? loginView() : fatal(e.message); }
}
const fatal = (m) => app.replaceChildren(h('div.login', {}, h('div.card-box.box.login-box', { style: { padding: '32px' } }, h('div.state.error', {}, h('b', {}, m), h('button.btn', { onclick: boot }, 'Retry')))));

function loginView(err) {
  const o = S.office; const pin = h('input.input.pin', { type: 'password', inputmode: 'numeric', autocomplete: 'current-password', maxlength: 12, 'aria-label': 'PIN', placeholder: '••••', autofocus: true });
  const msg = h('div.err', { role: 'alert' }, err || '');
  const form = h('form.card-box.box', { onsubmit: async (e) => { e.preventDefault(); msg.textContent = ''; try { await api('/dash/login', { method: 'POST', body: { pin: pin.value } }); boot(); } catch (er) { msg.textContent = er.message; pin.value = ''; pin.focus(); } } },
    h('div.mark', {}, o.brand.logoText), h('h1', {}, o.name), h('p', {}, 'Enter the office PIN to open the dashboard'), pin, msg, h('button.btn.primary', { type: 'submit', style: { height: '44px' } }, 'Open dashboard'), h('p', { style: { fontSize: '12px' } }, 'Demo PIN: 1234'));
  app.replaceChildren(h('div.login', {}, form)); pin.focus();
}

function start() {
  renderShell(); go(location.hash.slice(1) || 'overview');
  addEventListener('hashchange', () => go(location.hash.slice(1) || 'overview'));
  connectLive(); refreshBadges();
}

/* ---------------- shell ---------------- */
const NAV = [['overview', 'home'], ['pipeline', 'kanban'], ['viewings', 'cal'], ['listings', 'grid'], ['owners', 'key'], ['analytics', 'chart']];
function renderShell() {
  const o = S.office;
  const nav = h('nav.nav', { 'aria-label': 'Main' }, NAV.map(([k, ic]) => h('a', { href: `#${k}`, 'data-k': k, html: `${icon(ic, 18)}<span>${esc(t(k))}</span>${k === 'pipeline' ? '<span class="count hidden" id="hsCount"></span>' : ''}` })));
  const side = h('aside.side', {}, h('div.brand', {}, h('div.mark', {}, o.brand.logo ? h('img', { src: o.brand.logo, width: 24, alt: '' }) : o.brand.logoText), h('div', {}, o.name, h('small', {}, 'Owner dashboard'))), nav,
    h('div.foot', {}, h('span.live', { id: 'live', class: 'off' }, h('i'), h('span', {}, t('live'))), h('a.btn.sm', { href: `/?office=${o.id}`, target: '_blank', rel: 'noopener', html: `${icon('bot', 15)} Customer chat` }), h('button.btn.sm.ghost', { onclick: logout, html: `${icon('logout', 15)} ${esc(t('logout'))}` })));
  const top = h('header.top', {}, h('h1', { id: 'title' }), h('div.sp'),
    h('button.btn.sm', { onclick: openDemo, html: `${icon('spark', 15)} ${esc(t('demo'))}` }),
    h('button.btn.icon.sm.ghost', { 'aria-label': t('theme'), onclick: () => { toggleTheme(); }, html: `${icon('moon', 18)}` }),
    h('button.btn.sm.ghost', { onclick: () => { S.lang = S.lang === 'en' ? 'ar' : 'en'; setLang(S.lang); renderShell(); go(S.view); } }, t('lang')));
  const bn = h('nav.bottom-nav', {}, NAV.map(([k, ic]) => h('a', { href: `#${k}`, 'data-k': k, html: `${icon(ic, 20)}<span>${esc(t(k))}</span>` })));
  app.replaceChildren(h('div.shell', {}, side, h('main.main', {}, top, h('div.page', { id: 'page' }))), bn);
}
async function logout() { await api('/dash/logout', { method: 'POST' }); S.es?.close(); boot(); }

function go(view) {
  if (!NAV.some(([k]) => k === view)) view = 'overview';
  S.view = view; page()?.classList.remove("full");
  document.querySelectorAll('[data-k]').forEach((a) => (a.dataset.k === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  $('#title').textContent = t(view);
  ({ overview: vOverview, pipeline: vPipeline, viewings: vViewings, listings: vListings, owners: vOwners, analytics: vAnalytics })[view]();
}

/* ---------------- helpers: states ---------------- */
const skel = (n = 3, hgt = 90) => h('div', { style: { display: 'grid', gap: '12px' } }, Array.from({ length: n }, () => h('div.skeleton', { style: { height: `${hgt}px` } })));
const empty = (title, sub, ic = 'inbox') => h('div.state', {}, h('span', { html: icon(ic, 40) }), h('b', {}, title), h('span', {}, sub));
const errState = (e, retry) => h('div.state.error', {}, h('span', { html: icon('alert', 40) }), h('b', {}, 'Something went wrong'), h('span', {}, e.message), h('button.btn.sm', { onclick: retry }, 'Try again'));
const page = () => $('#page');
async function loadInto(el, fn, retry) { try { await fn(); } catch (e) { if (e.status === 401) return boot(); el.replaceChildren(errState(e, retry)); } }

const tempBadge = (l) => h('span.badge', { class: l.temperature }, `${{ hot: '🔥', warm: '☀️', cold: '❄️' }[l.temperature] || ''} ${l.temperature}`);
function scoreRing(l) {
  const c = { hot: 'var(--hot)', warm: 'var(--warm)', cold: 'var(--cold)' }[l.temperature]; const r = 14; const circ = 2 * Math.PI * r;
  return h('div.score', { title: `Score ${l.score}/100`, html: `<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="${r}" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="17" cy="17" r="${r}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(l.score / 100) * circ} ${circ}"/></svg><b>${l.score}</b>` });
}
const leadName = (l) => l.name || (l.phone ? l.phone : `Visitor #${l.id}`);

/* ---------------- overview ---------------- */
async function vOverview(silent) {
  const p = page(); if (!silent) p.replaceChildren(h("div.kpis", {}, Array.from({ length: 6 }, () => h("div.skeleton", { style: { height: "120px" } }))), skel(2, 220));
  await loadInto(p, async () => {
    const [k, leads, fu] = await Promise.all([A('/kpis'), A('/leads'), A('/followups')]);
    S.kpis = k; S.leads = leads; S.followups = fu;
    const kp = (cls, ic, v, l, s) => h('div.card-box.kpi', { class: cls }, h('div.ic', { html: icon(ic, 18) }), h('div.v', {}, v), h('div.l', {}, l), h('div.s', {}, s || ' '));
    const kpis = h('div.kpis', {},
      kp('', 'users', k.newToday, t('kNew'), `${k.total} total`), kp('hot', 'bolt', k.hot, t('kHot'), 'ready to talk'), kp('info', 'cal', k.viewingsWeek, t('kView'), 'across all agents'),
      kp('good', 'bot', k.avgResponseSec != null ? `${k.avgResponseSec}s` : '—', t('kResp'), 'AI, first reply'), kp('warn', 'headset', k.handoffs, t('kHand'), 'handoff requested'), kp('good', 'chart', `${k.conversion}%`, t('kConv'), 'lead → closed'));
    const max = Math.max(1, ...STAGES.map((s) => k.funnel[s]));
    const funnel = h('div.card-box', {}, h('header', {}, h('h2', {}, 'Conversion funnel')), h('div.pad.funnel', {}, STAGES.map((s) => h('div.f', {}, h('span', {}, t(s)), h('div.bar', {}, h('i', { style: { width: `${(k.funnel[s] / max) * 100}%` } })), h('b', {}, k.funnel[s])))));
    const attention = leads.filter((l) => l.handoff_reason && l.mode !== 'human' && l.stage !== 'closed').slice(0, 4);
    const att = h('div.card-box', {}, h('header', {}, h('h2', {}, 'Needs attention'), h('span.badge.hot', {}, attention.length + fu.filter((f) => f.status === 'ready').length)),
      h('div.list', { style: { marginTop: '8px' } },
        attention.map((l) => h('div.it', { onclick: () => openLead(l.id) }, h('div.av', { style: { background: 'var(--bad-soft)', color: 'var(--hot)' }, html: icon('headset', 16) }), h('div.grow', {}, h('b', {}, leadName(l)), h('small', {}, l.handoff_reason)), h('span.badge.hot', {}, l.handoff_urgency || 'handoff'))),
        fu.filter((f) => f.status === 'ready').slice(0, 3).map((f) => h('div.it', { onclick: () => openLead(f.lead_id) }, h('div.av', { style: { background: 'var(--warn-soft)', color: 'var(--warn)' }, html: icon('send', 16) }), h('div.grow', {}, h('b', {}, `Follow-up ready · ${f.lead_name || 'Lead'}`), h('small', {}, f.draft)), h('button.btn.sm', { onclick: async (e) => { e.stopPropagation(); await A(`/followups/${f.id}/send`, { method: 'POST' }); toast('Follow-up sent'); vOverview(); } }, 'Send'))),
        !attention.length && !fu.some((f) => f.status === 'ready') ? empty('All clear', 'No handoffs or follow-ups waiting.', 'check') : null));
    const recent = h('div.card-box', {}, h('header', {}, h('h2', {}, 'Latest leads'), h('a', { href: '#pipeline', style: { fontSize: '13px', fontWeight: 600 } }, 'Open pipeline →')),
      h('div.list', { style: { marginTop: '8px' } }, leads.slice(0, 6).map((l) => h('div.it', { onclick: () => openLead(l.id) }, h('div.av', {}, initials(l.name)), h('div.grow', {}, h('b', {}, leadName(l)), h('small', {}, l.last_message || l.summary?.split('\n')[0] || '—')), tempBadge(l), h('small', { style: { color: 'var(--text-3)', width: '56px', textAlign: 'end' } }, timeAgo(l.updated_at))))));
    const feed = h('div.card-box', {}, h('header', {}, h('h2', {}, 'Live activity'), h('span.live', {}, h('i'), 'real time')), h('div.list.feed', { id: 'feed', style: { marginTop: '8px' } }, S.feed.length ? S.feed.map(feedItem) : [empty('Waiting for activity', 'Chat with the assistant to see events appear here.', 'bolt')]));
    p.replaceChildren(kpis, h('div.grid2', {}, h('div', { style: { display: 'grid', gap: '16px' } }, funnel, recent), h('div', { style: { display: 'grid', gap: '16px', alignContent: 'start' } }, att, feed)));
    updateBadges(k);
  }, vOverview);
}
const EVENT_TEXT = { lead_created: ['New conversation started', 'users'], message: null, viewing_booked: ['Viewing booked', 'cal'], viewing_cancelled: ['Viewing cancelled', 'cal'], handoff: ['Human handoff requested', 'headset'], owner_lead: ['New owner lead', 'key'], followup_ready: ['Follow-up drafted', 'send'], followup_sent: ['Follow-up sent', 'send'], listing_changed: ['Listings updated', 'grid'], reset: ['Demo data reset', 'refresh'], agent_error: ['AI error — fallback sent', 'alert'] };
function feedItem(ev) { const m = EVENT_TEXT[ev.type] || [ev.role === 'user' ? 'Customer message' : ev.role === 'human' ? 'Agent replied' : 'AI replied', 'bot']; return h('div.it', { class: 'new' }, h('span.dot'), h('div.grow', {}, m[0] + (ev.reason ? ` — ${ev.reason}` : '')), h('small', {}, new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))); }
function updateBadges(k) { const c = $('#hsCount'); if (!c) return; c.textContent = k.handoffs; c.classList.toggle('hidden', !k.handoffs); }
async function refreshBadges() { try { updateBadges(await A('/kpis')); } catch { /* ignore */ } }

/* ---------------- pipeline ---------------- */
async function vPipeline() {
  const p = page(); p.classList.add('full'); p.replaceChildren(h('div.board', {}, STAGES.map(() => h('div.skeleton', { style: { height: '300px' } }))));
  await loadInto(p, async () => {
    S.leads = await A('/leads'); drawBoard();
  }, vPipeline);
}
function drawBoard() {
  if (S.view !== 'pipeline') return;
  const p = page();
  const lead = (l) => {
    const el = h('article.lead', { draggable: 'true', tabindex: 0, 'data-id': l.id, class: l.handoff_reason && l.mode !== 'human' && l.stage !== 'closed' ? 'flag' : '', 'aria-label': `${leadName(l)}, ${l.temperature} lead`,
      onclick: () => openLead(l.id), onkeydown: (e) => { if (e.key === 'Enter') openLead(l.id); },
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', String(l.id)); e.dataTransfer.effectAllowed = 'move'; setTimeout(() => el.classList.add('drag'), 0); }, ondragend: () => el.classList.remove('drag') },
      h('div.hd', {}, h('div.av', {}, initials(l.name)), h('b', {}, leadName(l)), scoreRing(l)),
      h('div.meta', {}, l.intent ? h('span.badge.brand', {}, l.intent === 'owner' ? 'owner' : l.intent) : null, l.areas.length ? h('span.badge', {}, l.areas.slice(0, 2).join(', ')) : null, l.budget ? h('span.badge', {}, money(l.budget, l.intent === 'rent')) : null, l.mode === 'human' ? h('span.badge.good', {}, '👤 human') : null, h('span.badge', {}, { web: '🌐', whatsapp: '💬' }[l.source] || '', ' ', l.language)),
      l.last_message ? h('div.snip', { dir: 'auto' }, l.last_message) : null,
      l.next_viewing ? h('div.vw', { html: `${icon('cal', 13)} ${esc(l.next_viewing.replace('T', ' '))}` }) : null);
    return el;
  };
  const cols = STAGES.map((s) => {
    const items = S.leads.filter((l) => l.stage === s).sort((a, b) => b.score - a.score);
    const col = h('section.col', { 'aria-label': t(s),
      ondragover: (e) => { e.preventDefault(); col.classList.add('over'); }, ondragleave: () => col.classList.remove('over'),
      ondrop: async (e) => { e.preventDefault(); col.classList.remove('over'); const id = Number(e.dataTransfer.getData('text/plain')); const l = S.leads.find((x) => x.id === id); if (!l || l.stage === s) return; const prev = l.stage; l.stage = s; drawBoard(); try { await A(`/leads/${id}`, { method: 'PATCH', body: { stage: s } }); toast(`${leadName(l)} → ${t(s)}`); } catch (er) { l.stage = prev; drawBoard(); toast(er.message); } } },
      h('h3', {}, t(s), h('span.n', {}, items.length)), h('div.cards', {}, items.length ? items.map(lead) : h('div', { style: { color: 'var(--text-3)', fontSize: '13px', textAlign: 'center', padding: '16px 4px' } }, 'Drop leads here')));
    return col;
  });
  p.replaceChildren(h('div.board', {}, cols));
}

/* ---------------- lead drawer ---------------- */
async function openLead(id) {
  S.drawer = id; document.querySelector('.scrim')?.remove(); document.querySelector('.drawer')?.remove();
  const scrim = h('div.scrim', { onclick: closeDrawer }); const dr = h('aside.drawer', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Lead details' }, h('div.scroll', {}, skel(4, 80)));
  document.body.append(scrim, dr);
  await fillDrawer(dr, id);
}
function closeDrawer() { S.drawer = null; document.querySelector('.scrim')?.remove(); document.querySelector('.drawer')?.remove(); }
async function fillDrawer(dr, id) {
  let d;
  try { d = await A(`/leads/${id}`); } catch (e) { dr.replaceChildren(h('div.scroll', {}, errState(e, () => fillDrawer(dr, id)))); return; }
  const { lead, conversation: c, messages, viewings, followups } = d; const human = c?.mode === 'human';
  const thread = h('div.thread', { id: 'thread', tabindex: 0, 'aria-label': 'Conversation' }, messages.length ? messages.map((m) => h('div.msg', { class: m.role }, m.role !== 'user' ? h('span.who', {}, m.role === 'human' ? `👤 ${m.agent || 'Agent'}` : m.followup ? '🤖 AI follow-up' : '🤖 AI') : null, h('span', { dir: 'auto' }, m.content), h('small', {}, timeAgo(m.at)))) : empty('No messages yet', 'The conversation will appear here.', 'inbox'));
  const reply = h('input.input', { placeholder: human ? 'Reply as human agent…' : 'Type to take over and reply…', 'aria-label': 'Reply', dir: 'auto' });
  const sendReply = async () => { const text = reply.value.trim(); if (!text) return; reply.value = ''; try { await A(`/leads/${id}/reply`, { method: 'POST', body: { text } }); await fillDrawer(dr, id); } catch (e) { toast(e.message); } };
  reply.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendReply(); });
  const notes = h('textarea.textarea', { 'aria-label': 'Notes', placeholder: 'Private notes for your team…', onblur: async (e) => { if (e.target.value !== (lead.notes || '')) { await A(`/leads/${id}`, { method: 'PATCH', body: { notes: e.target.value } }); toast('Notes saved'); } } }, lead.notes || '');
  const stage = h('select.select', { 'aria-label': 'Stage', style: { width: 'auto', height: '34px' }, onchange: async (e) => { await A(`/leads/${id}`, { method: 'PATCH', body: { stage: e.target.value } }); toast('Stage updated'); } }, STAGES.map((s) => h('option', { value: s, selected: s === lead.stage }, t(s))));
  const kv = (k, v) => h('div', {}, h('small', {}, k), h('b', {}, v || '—'));
  const draft = followups.find((f) => f.status === 'ready');
  dr.replaceChildren(
    h('header', {}, h('div.av', { style: { width: '44px', height: '44px' } }, initials(lead.name)), h('div.grow', {}, h('h2', {}, leadName(lead)), h('div', { style: { display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' } }, tempBadge(lead), h('span.badge', {}, `${{ web: '🌐 Web', whatsapp: '💬 WhatsApp' }[lead.source] || lead.source} · ${lead.language}`), lead.phone ? h('a.badge', { href: `tel:${lead.phone}` }, lead.phone) : null)), scoreRing(lead), h('button.btn.icon.sm.ghost', { 'aria-label': 'Close', onclick: closeDrawer, html: icon('close', 18) })),
    h('div.scroll', {},
      c?.handoff_reason ? h('div.banner', { html: `${icon('alert', 18)}<div>Handoff requested (${esc(c.handoff_urgency || '')})<br><span style="font-weight:500">${esc(c.handoff_reason)}</span></div>` }) : null,
      h('div.sec', {}, h('div.summary', {}, h('span.tag', { html: `${icon('spark', 13)} AI summary` }), lead.summary || 'No summary yet.')),
      h('div.sec', {}, h('h4', {}, 'Extracted preferences'), h('div.kv', {}, kv('Looking to', lead.intent), kv('Budget', lead.budget ? money(lead.budget, lead.intent === 'rent') : ''), kv('Areas', lead.areas.join(', ')), kv('Bedrooms', lead.bedrooms != null ? String(lead.bedrooms) : ''), kv('Timeline', lead.timeline), kv('Financing', lead.financing?.replace('_', ' ')))),
      h('div.sec', {}, h('h4', {}, 'Pipeline stage'), stage),
      viewings.length ? h('div.sec', {}, h('h4', {}, 'Viewings'), h('div', { style: { display: 'grid', gap: '8px' } }, viewings.map((v) => h('div.draft', { style: { background: 'var(--good-soft)' } }, h('b', {}, v.listing_title), h('span', {}, `${v.start_at.replace('T', ' ')} · ${S.office.agents.find((a) => a.id === v.agent_id)?.name || v.agent_id} · ${v.status}`))))) : null,
      draft ? h('div.sec', {}, h('h4', {}, 'Follow-up ready to send'), h('div.draft', {}, h('span', { dir: 'auto' }, draft.draft), h('div', { style: { display: 'flex', gap: '8px' } }, h('button.btn.sm.primary', { onclick: async () => { await A(`/followups/${draft.id}/send`, { method: 'POST' }); toast('Sent'); fillDrawer(dr, id); } }, 'Send now')))) : null,
      h('div.sec', {}, h('h4', {}, 'Conversation'), human ? h('div.banner.ok', { style: { marginBottom: '8px' }, html: `${icon('headset', 18)} You are in control — the AI is paused for this chat.` }) : null, thread,
        h('div.reply', { style: { marginTop: '10px' } }, reply, h('button.btn.primary.icon', { 'aria-label': 'Send reply', onclick: sendReply, html: icon('send', 18) })),
        h('div', { style: { marginTop: '8px', display: 'flex', gap: '8px' } }, h('button.btn.sm', { class: human ? '' : 'accent', onclick: async () => { await A(`/leads/${id}/takeover`, { method: 'POST', body: { on: !human } }); toast(human ? 'AI is back in charge' : 'You took over the chat'); fillDrawer(dr, id); }, html: human ? `${icon('bot', 15)} Hand back to AI` : `${icon('headset', 15)} Take over chat` }))),
      h('div.sec', {}, h('h4', {}, 'Notes'), notes)));
  const th = $('#thread'); if (th) th.scrollTop = th.scrollHeight;
}

/* ---------------- viewings calendar ---------------- */
const mondayOf = (off) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return d; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
async function vViewings() {
  const p = page(); p.replaceChildren(skel(1, 520));
  const mon = mondayOf(S.weekOffset); const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  await loadInto(p, async () => {
    S.viewings = await A(`/viewings?from=${iso(mon)}&to=${iso(sun)}`);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
    const today = iso(new Date()); const H0 = 8; const H1 = 19; const PX = 56;
    const vs = S.viewings.filter((v) => S.agentFilter === 'all' || v.agent_id === S.agentFilter);
    const legend = h('div.legend', {}, h('button', { 'aria-pressed': String(S.agentFilter === 'all'), onclick: () => { S.agentFilter = 'all'; vViewings(); } }, 'All agents'), S.office.agents.map((a) => h('button', { 'aria-pressed': String(S.agentFilter === a.id), onclick: () => { S.agentFilter = a.id; vViewings(); } }, h('i', { style: { background: agentColor(a.id) } }), a.name)));
    const grid = h('div.cal', {}, h('div.hd'), days.map((d) => h('div.hd', { class: iso(d) === today ? 'today' : '' }, d.toLocaleDateString([], { weekday: 'short' }), h('b', {}, d.getDate()))),
      h('div.hrs', {}, Array.from({ length: H1 - H0 }, (_, i) => h('span', {}, `${String(H0 + i).padStart(2, '0')}:00`))),
      days.map((d) => {
        const col = h('div.day', { class: iso(d) === today ? 'today' : '', style: { height: `${(H1 - H0) * PX}px` } });
        vs.filter((v) => v.start_at.startsWith(iso(d))).forEach((v) => {
          const [hh, mm] = v.start_at.slice(11).split(':').map(Number); const top = (hh - H0 + mm / 60) * PX; const hgt = Math.max(36, (S.office.viewingMinutes / 60) * PX - 2);
          col.append(h('button.ev', { class: v.status === 'done' ? 'done' : '', style: { top: `${top}px`, height: `${hgt}px`, background: agentColor(v.agent_id) }, onclick: () => viewingDialog(v), title: v.listing_title }, h('b', {}, `${v.start_at.slice(11)} ${v.name || ''}`), v.listing_title));
        });
        if (iso(d) === today) { const n = new Date(); const y = (n.getHours() - H0 + n.getMinutes() / 60) * PX; if (y > 0 && y < (H1 - H0) * PX) col.append(h('div.nowline', { style: { top: `${y}px` } })); }
        return col;
      }));
    p.replaceChildren(h('div.cal-head', {}, h('button.btn.icon.sm', { 'aria-label': 'Previous week', onclick: () => { S.weekOffset--; vViewings(); }, html: '‹' }), h('button.btn.sm', { onclick: () => { S.weekOffset = 0; vViewings(); } }, 'This week'), h('button.btn.icon.sm', { 'aria-label': 'Next week', onclick: () => { S.weekOffset++; vViewings(); }, html: '›' }),
      h('b', {}, `${mon.toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${sun.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`), h('div', { style: { flex: 1 } }), legend),
      h('div.card-box', { style: { overflow: 'hidden' } }, vs.length ? grid : h('div', {}, grid, empty('No viewings this week', 'Booked viewings appear here automatically.', 'cal'))));
  }, vViewings);
}
function viewingDialog(v) {
  const dlg = h('dialog', {}, h('div.body', { style: { padding: '24px' } }, h('h2', { style: { margin: 0 } }, v.listing_title), h('div', {}, `${v.start_at.replace('T', ' ')} – ${v.end_at.slice(11)}`), h('div', {}, `${v.name || '—'} · ${v.phone || ''}`), h('div', { style: { color: 'var(--text-3)' } }, `Agent: ${S.office.agents.find((a) => a.id === v.agent_id)?.name} · ${v.listing_area}`),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, v.lead_id ? h('button.btn.sm', { onclick: () => { dlg.close(); openLead(v.lead_id); } }, 'Open lead') : null, h('button.btn.sm', { onclick: async () => { await A(`/viewings/${v.id}`, { method: 'PATCH', body: { status: 'done' } }); dlg.close(); vViewings(); } }, 'Mark done'), h('button.btn.sm.danger', { onclick: async () => { if (confirm('Cancel this viewing?')) { await A(`/viewings/${v.id}`, { method: 'PATCH', body: { status: 'cancelled' } }); dlg.close(); vViewings(); } } }, 'Cancel viewing'), h('button.btn.sm.ghost', { onclick: () => dlg.close() }, 'Close'))));
  document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
}

/* ---------------- listings manager ---------------- */
async function vListings() {
  const p = page(); p.replaceChildren(skel(5, 56));
  await loadInto(p, async () => {
    S.listings = await A('/listings');
    const rows = S.listings.filter((l) => S.listingFilter === 'all' || l.type === S.listingFilter);
    const seg = h('div.tools', {}, ['all', 'sale', 'rent'].map((f) => h('button.btn.sm', { class: S.listingFilter === f ? 'primary' : '', onclick: () => { S.listingFilter = f; vListings(); } }, f === 'all' ? `All (${S.listings.length})` : f === 'sale' ? 'For sale' : 'For rent')), h('div', { style: { flex: 1 } }), h('button.btn.primary', { onclick: () => listingDialog(), html: `${icon('plus', 16)} Add listing` }));
    const table = h('table.tbl', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Property'), h('th', {}, 'Price'), h('th.hide-m', {}, 'Details'), h('th.hide-m', {}, 'Viewings'), h('th', {}, 'Available'), h('th'))),
      h('tbody', {}, rows.map((l) => h('tr', {}, h('td', {}, h('div.cellrow', {}, h('div.thumb', { style: { backgroundImage: `url("${listingImg(l)}")` } }), h('div', {}, h('b', {}, l.title), h('small', {}, `${l.ref} · ${l.area} · ${l.category}`)))),
        h('td', {}, h('b', {}, money(l.price, l.type === 'rent')), h('small', { style: { display: 'block', color: 'var(--text-3)' } }, l.type)),
        h('td.hide-m', {}, [l.bedrooms ? `${l.bedrooms} BR` : null, l.size_m2 ? `${l.size_m2} m²` : null, l.furnished ? 'furnished' : null].filter(Boolean).join(' · ') || '—'), h('td.hide-m', {}, l.viewings),
        h('td', {}, h('label.switch', {}, h('input', { type: 'checkbox', checked: l.available, 'aria-label': `Available: ${l.title}`, onchange: async (e) => { try { await A(`/listings/${l.id}`, { method: 'PUT', body: { available: e.target.checked } }); toast(e.target.checked ? 'Marked available' : 'Hidden from the assistant'); } catch (er) { toast(er.message); e.target.checked = !e.target.checked; } } }), h('span'))),
        h('td', { style: { whiteSpace: 'nowrap', textAlign: 'end' } }, h('button.btn.icon.sm.ghost', { 'aria-label': `Edit ${l.title}`, onclick: () => listingDialog(l), html: icon('edit', 16) }), h('button.btn.icon.sm.ghost.danger', { 'aria-label': `Delete ${l.title}`, onclick: async () => { if (confirm(`Delete "${l.title}"? Booked viewings will be cancelled.`)) { await A(`/listings/${l.id}`, { method: 'DELETE' }); toast('Deleted'); vListings(); } }, html: icon('trash', 16) }))))));
    p.replaceChildren(seg, h('div.card-box', { style: { overflow: 'auto' } }, rows.length ? table : empty('No listings', 'Add your first listing to let the assistant recommend it.', 'home')));
  }, vListings);
}
function listingDialog(l) {
  const edit = !!l; const v = l || { type: 'rent', category: 'apartment', features: [], available: true, agent_id: S.office.agents[0].id, area: S.office.areas[0] };
  const f = (name, label, attrs = {}) => h('label.field', {}, label, h('input.input', { name, value: v[name] ?? '', ...attrs }));
  const sel = (name, label, opts) => h('label.field', {}, label, h('select.select', { name }, opts.map(([val, lab]) => h('option', { value: val, selected: String(v[name]) === String(val) }, lab))));
  const photoIn = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', 'aria-label': 'Upload photo' });
  const errEl = h('div.err', { role: 'alert' });
  const form = h('form', { method: 'dialog', onsubmit: async (e) => {
    e.preventDefault(); const fd = new FormData(form); errEl.textContent = '';
    const body = { title: fd.get('title'), type: fd.get('type'), category: fd.get('category'), area: fd.get('area'), price: fd.get('price'), bedrooms: fd.get('bedrooms') || 0, bathrooms: fd.get('bathrooms') || 0, size_m2: fd.get('size_m2') || 0, furnished: fd.get('furnished') === 'on', description: fd.get('description'), agent_id: fd.get('agent_id'), available: fd.get('available') === 'on', features: fd.getAll('features') };
    try {
      const saved = edit ? await A(`/listings/${l.id}`, { method: 'PUT', body }) : await A('/listings', { method: 'POST', body });
      if (photoIn.files[0]) { const up = new FormData(); up.append('photo', photoIn.files[0]); await A(`/listings/${saved.id}/photo`, { method: 'POST', body: up }); }
      dlg.close(); toast(edit ? 'Listing updated' : 'Listing added'); vListings();
    } catch (er) { errEl.textContent = er.message; }
  } },
    h('header', {}, h('h2', {}, edit ? 'Edit listing' : 'Add listing'), h('button.btn.icon.sm.ghost', { type: 'button', 'aria-label': 'Close', onclick: () => dlg.close(), html: icon('close', 18) })),
    h('div.body', {}, f('title', 'Title', { required: true, maxlength: 120 }),
      h('div.f3', {}, sel('type', 'Type', [['rent', 'For rent'], ['sale', 'For sale']]), sel('category', 'Category', ['apartment', 'duplex', 'studio', 'villa', 'office', 'shop', 'land'].map((x) => [x, x])), f('area', 'Area', { required: true, list: 'areas' })),
      h('datalist', { id: 'areas' }, S.office.areas.map((a) => h('option', { value: a }))),
      h('div.f3', {}, f('price', 'Price (USD)', { type: 'number', required: true, min: 1 }), f('bedrooms', 'Bedrooms', { type: 'number', min: 0 }), f('size_m2', 'Size (m²)', { type: 'number', min: 0 })),
      h('div.f3', {}, f('bathrooms', 'Bathrooms', { type: 'number', min: 0 }), sel('agent_id', 'Agent', S.office.agents.map((a) => [a.id, a.name])), h('label.field', {}, 'Options', h('div.checks', { style: { paddingTop: '6px' } }, h('label', {}, h('input', { type: 'checkbox', name: 'furnished', checked: !!v.furnished }), 'Furnished'), h('label', {}, h('input', { type: 'checkbox', name: 'available', checked: v.available !== false }), 'Available')))),
      h('label.field', {}, 'Features', h('div.checks', {}, Object.keys(FEATURE_LABELS.en).map((k) => h('label', {}, h('input', { type: 'checkbox', name: 'features', value: k, checked: (v.features || []).includes(k) }), featLabel(k))))),
      h('label.field', {}, 'Description', h('textarea.textarea', { name: 'description', maxlength: 1000 }, v.description || '')),
      h('label.field', {}, 'Photo (JPG/PNG/WebP, max 4 MB)', photoIn), (v.photos || []).length ? h('div.photos', {}, v.photos.map((src) => h('img', { src, alt: '' }))) : null, errEl),
    h('footer', {}, h('button.btn', { type: 'button', onclick: () => dlg.close() }, 'Cancel'), h('button.btn.primary', { type: 'submit' }, edit ? 'Save changes' : 'Add listing')));
  const dlg = h('dialog', {}, form); document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
}

/* ---------------- owners ---------------- */
async function vOwners() {
  const p = page(); p.replaceChildren(skel(3, 60));
  await loadInto(p, async () => {
    S.owners = await A('/owner-leads');
    p.replaceChildren(h('div.card-box', { style: { overflow: 'auto' } }, S.owners.length ? h('table.tbl', {}, h('thead', {}, h('tr', {}, ['Owner', 'Property', 'Asking', 'Notes', 'Status', 'Created'].map((x) => h('th', {}, x)))),
      h('tbody', {}, S.owners.map((o) => h('tr', {}, h('td', {}, h('div.cellrow', {}, h('div.av', {}, initials(o.name)), h('div', {}, h('b', {}, o.name), h('a', { href: `tel:${o.phone}`, style: { fontSize: '13px' } }, o.phone)))), h('td', {}, `${o.property_type || '—'} · ${o.area || '—'}`), h('td', {}, o.asking_price ? `${money(o.asking_price, o.rent_or_sale === 'rent')} (${o.rent_or_sale})` : o.rent_or_sale),
        h('td', { style: { maxWidth: '240px' } }, o.notes || '—'),
        h('td', {}, h('select.select', { style: { height: '34px', width: '130px' }, 'aria-label': `Status for ${o.name}`, onchange: async (e) => { await A(`/owner-leads/${o.id}`, { method: 'PATCH', body: { status: e.target.value } }); toast('Status updated'); } }, ['new', 'contacted', 'valuation', 'signed', 'lost'].map((s) => h('option', { value: s, selected: s === o.status }, s)))), h('td', {}, timeAgo(o.created_at)))))) : empty('No owner leads yet', 'When a property owner asks to list with you, they show up here.', 'key')));
  }, vOwners);
}

/* ---------------- analytics ---------------- */
async function vAnalytics() {
  const p = page(); p.replaceChildren(h('div.charts', {}, Array.from({ length: 4 }, () => h('div.skeleton', { style: { height: '260px' } }))));
  await loadInto(p, async () => {
    const a = await A('/analytics'); S.analytics = a;
    const hbar = (rows) => { const m = Math.max(1, ...rows.map((r) => r.n)); return rows.length ? h('div.hbar', {}, rows.map((r) => h('div.r', {}, h('span', { title: r.k }, r.k || '—'), h('div.t', {}, h('i', { style: { width: `${(r.n / m) * 100}%` } })), h('b', {}, r.n)))) : empty('No data yet', 'Charts fill in as leads arrive.', 'chart'); };
    const box = (title, body, sub) => h('div.card-box', {}, h('header', {}, h('h2', {}, title), sub ? h('small', { style: { color: 'var(--text-3)' } }, sub) : null), h('div.pad', {}, body));
    const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(iso(d)); }
    const map = Object.fromEntries(a.byDay.map((r) => [r.d, r.n])); const mx = Math.max(1, ...days.map((d) => map[d] || 0));
    const vbars = h('div.vbars', {}, days.map((d) => h('div.c', { title: `${d}: ${map[d] || 0}` }, h('b', {}, map[d] || ''), h("i", { style: { height: `${Math.max(3, ((map[d] || 0) / mx) * 120)}px` } }), h('span', {}, d.slice(8)))));
    const temp = Object.fromEntries(a.temperature.map((r) => [r.k, r.n])); const tot = (temp.hot || 0) + (temp.warm || 0) + (temp.cold || 0);
    const C = [['hot', 'var(--hot)'], ['warm', 'var(--warm)'], ['cold', 'var(--cold)']]; let off = 0; const R = 52; const circ = 2 * Math.PI * R;
    const segs = C.map(([k, col]) => { const len = tot ? ((temp[k] || 0) / tot) * circ : 0; const s = `<circle cx="70" cy="70" r="${R}" fill="none" stroke="${col}" stroke-width="22" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return s; }).join('');
    const donut = h('div.donut', {}, h('span', { html: `<svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Hot, warm, cold split"><circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="22"/>${segs}<text x="70" y="68" text-anchor="middle" font-size="26" font-weight="700" fill="var(--text)">${tot ? Math.round(((temp.hot || 0) / tot) * 100) : 0}%</text><text x="70" y="88" text-anchor="middle" font-size="11" fill="var(--text-3)">hot</text></svg>` }), h('div.lg', {}, C.map(([k, col]) => h('span', {}, h('i', { style: { background: col } }), `${k} · ${temp[k] || 0}`))));
    const buy = a.budgets.filter((b) => b.intent === 'buy'); const rent = a.budgets.filter((b) => b.intent === 'rent');
    p.replaceChildren(h('div.charts', {}, box('New leads per day', vbars, 'last 14 days'), box('Hot vs warm vs cold', tot ? donut : empty('No leads', '')), box('Most requested areas', hbar(a.byArea)), box('Leads by source', hbar(a.bySource)), box('Rent budgets (per month)', hbar(rent.map((r) => ({ k: r.k, n: r.n })))), box('Purchase budgets', hbar(buy.map((r) => ({ k: r.k, n: r.n })))), box('Customer languages', hbar(a.languages))));
  }, vAnalytics);
}

/* ---------------- demo controls ---------------- */
function openDemo() {
  const dlg = h('dialog', {}, h('div.body', { style: { padding: '24px' } }, h('h2', { style: { margin: 0 } }, 'Demo controls'),
    h('div', {}, h('b', {}, 'Office theme'), h('div.tools', { style: { marginTop: '8px' } }, S.offices.map((o) => h('button.btn.sm', { class: o.id === S.office.id ? 'primary' : '', onclick: () => { params.set('office', o.id); location.search = `?${params}`; } }, h('span', { style: { width: '12px', height: '12px', borderRadius: '50%', background: o.brand.primary, display: 'inline-block' } }), o.name)))),
    h('div.tools', {}, h('button.btn.sm', { onclick: toggleTheme }, 'Light / dark'), h('button.btn.sm', { onclick: () => { S.lang = S.lang === 'en' ? 'ar' : 'en'; setLang(S.lang); dlg.close(); renderShell(); go(S.view); } }, 'English / العربية')),
    h('div.tools', {}, h('a.btn.sm.primary', { href: `/?office=${S.office.id}`, target: '_blank', rel: 'noopener' }, 'Open customer chat'), S.demoMode ? h('button.btn.sm.danger', { onclick: async () => { if (!confirm('Reset all demo data for this office?')) return; await A('/demo/reset', { method: 'POST' }); dlg.close(); toast('Demo data reset'); go(S.view); } }, 'Reset demo data') : null, h('button.btn.sm', { onclick: async () => { const r = await A('/followups/run', { method: 'POST' }); toast(`${r.created} follow-up(s) drafted`); dlg.close(); go(S.view); } }, 'Run follow-up engine now')),
    h('div', { style: { textAlign: 'end' } }, h('button.btn.sm.ghost', { onclick: () => dlg.close() }, 'Close'))));
  document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
}

/* ---------------- live updates (SSE) ---------------- */
let refreshT = null;
function connectLive() {
  S.es?.close();
  const es = new EventSource(`/api/dash/events?${officeQ()}`); S.es = es;
  const live = () => $('#live'); es.onopen = () => live()?.classList.remove('off'); es.onerror = () => live()?.classList.add('off');
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data); live()?.classList.remove('off');
    if (EVENT_TEXT[ev.type] !== null || ev.role) { S.feed.unshift(ev); S.feed = S.feed.slice(0, 12); const f = $('#feed'); if (f) { if (!f.querySelector('.it')?.classList.contains('new') && f.querySelector('.state')) f.replaceChildren(); f.prepend(feedItem(ev)); [...f.children].slice(12).forEach((c) => c.remove()); } }
    if (ev.type === 'handoff') toast('🔔 Handoff requested — a customer needs a human');
    if (ev.type === 'viewing_booked' && !ev.rescheduled) toast('📅 New viewing booked');
    if (ev.type === 'lead_created') toast('👋 New conversation started');
    clearTimeout(refreshT);
    refreshT = setTimeout(async () => {
      refreshBadges();
      if (S.view === 'pipeline') { try { S.leads = await A('/leads'); drawBoard(); } catch { /* ignore */ } }
      else if (S.view === "overview") vOverview(true); else if (S.view === 'viewings') vViewings(); else if (S.view === 'listings' && ev.type === 'listing_changed') vListings(); else if (S.view === 'owners' && ev.type === 'owner_lead') vOwners();
      if (S.drawer && (ev.lead_id === S.drawer || ev.type === 'reset')) { const dr = document.querySelector('.drawer'); if (dr && !dr.contains(document.activeElement)) fillDrawer(dr, S.drawer); }
    }, 350);
  };
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.drawer) closeDrawer(); });
addEventListener('popstate', () => {});
boot();
