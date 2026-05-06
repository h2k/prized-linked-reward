/**
 * Gamification Admin Platform – Frontend Application
 * Connects to the Express backend REST API.
 */
'use strict';

// ── Auth guard ────────────────────────────────────────────────────────────────
const token = localStorage.getItem('gaq_token');
if (!token) { window.location.replace('/login.html'); }

const storedUser = JSON.parse(localStorage.getItem('gaq_user') || '{}');
const userNameEl = document.getElementById('userNameLabel');
if (userNameEl) userNameEl.textContent = storedUser.fullName || storedUser.username || 'User';

// ── Constants ─────────────────────────────────────────────────────────────────
const API = window.location.origin;

const categories = {
  casa:                { label: 'Improve CASA',                     short: 'CASA',   icon: 'fa-piggy-bank',           color: '#2563eb', bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-100'   },
  engagement:          { label: 'Increase Engagement',              short: 'ENGAGE', icon: 'fa-mobile-screen-button', color: '#7c3aed', bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-100' },
  spending:            { label: 'Encourage Spending',               short: 'SPEND',  icon: 'fa-credit-card',          color: '#f97316', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-100' },
  risk:                { label: 'Risk Reduction and Good Behavior',  short: 'RISK',   icon: 'fa-shield',               color: '#dc2626', bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-100'    },
  socialresponsibility:{ label: 'Social Responsibility',            short: 'SOCIAL', icon: 'fa-hand-holding-heart',   color: '#16a34a', bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-100'  }
};

// ── State ─────────────────────────────────────────────────────────────────────
let allQuests      = [];
let allCustomers   = [];
let kpiData        = {};
let chartData      = {};
let txData         = {};  // transaction quest success data
let calendarDate   = new Date();
let calendarView   = 'month';
let yearSubView    = 'grid';
let yearGroupBy    = 'none';
const charts       = {};
let allRewards     = [];
let allBadges      = [];
let loyaltySummary = {};

const tableState = {
  quests:    { page: 1, pageSize: 5, sortKey: 'start', sortDirection: 'asc' },
  customers: { page: 1, pageSize: 5, sortKey: 'rank',  sortDirection: 'asc' }
};

// ── Formatters ────────────────────────────────────────────────────────────────
const money   = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0);
const compact = v => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v || 0);
const percent = v => `${Math.round(v || 0)}%`;
const byId    = id => document.getElementById(id);

function formatDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    localStorage.removeItem('gaq_token');
    localStorage.removeItem('gaq_user');
    window.location.replace('/login.html');
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error((data.errors || [data.error]).flat().join(' '));
  return data;
}

// ── Load all data from API ────────────────────────────────────────────────────
async function loadAll() {
  try {
    const [questsRes, customersRes, kpis, charts_, loyaltySum, rewardsRes, badgesRes, txRes] = await Promise.all([
      apiFetch('/api/quests?limit=200'),
      apiFetch('/api/customers'),
      apiFetch('/api/analytics/kpis'),
      apiFetch('/api/analytics/charts'),
      apiFetch('/api/loyalty/summary'),
      apiFetch('/api/loyalty/rewards'),
      apiFetch('/api/loyalty/badges'),
      apiFetch('/api/analytics/transaction-success')
    ]);
    allQuests      = questsRes.data  || [];
    allCustomers   = customersRes.data || [];
    kpiData        = kpis     || {};
    chartData      = charts_  || {};
    txData         = txRes    || {};
    loyaltySummary = loyaltySum || {};
    allRewards     = rewardsRes.data || [];
    allBadges      = badgesRes.data  || [];
    renderAll();
  } catch (err) {
    showToast(err.message || 'Failed to load data.', 'error');
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg, type = 'success') {
  const el   = byId('toast');
  const icon = byId('toastIcon');
  byId('toastMsg').textContent = msg;
  icon.className = type === 'error'
    ? 'fas fa-circle-xmark text-red-400'
    : type === 'info'
    ? 'fas fa-circle-info text-blue-400'
    : 'fas fa-check-circle text-emerald-400';
  el.classList.remove('hide');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.add('hide'), 3200);
}

// ── Render all ────────────────────────────────────────────────────────────────
function renderAll() {
  renderKpis();
  renderCategoryCards();
  renderCalendar();
  renderTable();
  renderCustomerRanking();
  renderLoyaltySection();
  renderCharts();
  renderTransactionSuccess();
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKpis() {
  const d = kpiData;
  const kpis = [
    { label: 'Active / Scheduled Quests', value: d.active ?? 0, sub: `${d.total ?? 0} total programs`,                  icon: 'fa-flag-checkered', color: 'blue'   },
    { label: 'Customers Doing Quests',    value: compact(d.completed ?? 0), sub: `${percent(d.completion ?? 0)} forecast completion`, icon: 'fa-users',         color: 'emerald'},
    { label: 'Forecast Revenue',          value: money(d.revenue ?? 0),     sub: `${money(d.budget ?? 0)} prize budget`, icon: 'fa-dollar-sign',    color: 'amber'  },
    { label: 'Forecast ROI',              value: percent(d.roi ?? 0),        sub: 'after prize budget',                   icon: 'fa-arrow-trend-up', color: 'violet' }
  ];
  byId('kpiGrid').innerHTML = kpis.map(k => `
    <div class="glass-card kpi-card border border-white/10 rounded-3xl p-5">
      <div class="flex items-start justify-between mb-5">
        <div class="w-12 h-12 rounded-2xl bg-${k.color}-400/15 text-${k.color}-200 flex items-center justify-center"><i class="fas ${k.icon}"></i></div>
        <span class="text-[10px] uppercase tracking-widest text-slate-300 font-bold">Live</span>
      </div>
      <div class="text-sm text-slate-300">${k.label}</div>
      <div class="text-3xl font-extrabold mt-1">${k.value}</div>
      <div class="text-xs text-slate-400 mt-2">${k.sub}</div>
    </div>`).join('');
}

// ── Category cards ────────────────────────────────────────────────────────────
function renderCategoryCards() {
  const stats = (kpiData.categoryStats || []);
  byId('categoryCards').innerHTML = stats.map(s => {
    const cat = categories[s.key];
    if (!cat) return '';
    return `
      <div class="bg-white border ${cat.border} rounded-3xl p-5 shadow-sm">
        <div class="flex justify-between items-start">
          <div class="w-11 h-11 rounded-2xl ${cat.bg} ${cat.text} flex items-center justify-center"><i class="fas ${cat.icon}"></i></div>
          <span class="text-xs font-extrabold ${cat.text}">${s.count} quests</span>
        </div>
        <h3 class="mt-4 font-extrabold text-slate-900">${cat.label}</h3>
        <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><div class="text-slate-400 text-xs">Customers</div><div class="font-bold">${compact(s.completed)}</div></div>
          <div><div class="text-slate-400 text-xs">ROI</div><div class="font-bold">${percent(s.roi)}</div></div>
        </div>
      </div>`;
  }).join('');
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function calendarFilteredQuests() {
  const category = byId('calendarCategoryFilter')?.value || 'all';
  const status   = byId('calendarStatusFilter')?.value   || 'all';
  return allQuests.filter(q =>
    (category === 'all' || q.category === category) &&
    (status   === 'all' || q.status   === status)
  );
}

function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function startOfWeek(date)   { const d = new Date(date); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d; }

function renderCalendar() {
  document.querySelectorAll('.calendar-view-btn').forEach(btn => {
    const active = btn.dataset.view === calendarView;
    btn.classList.toggle('bg-white',    active);
    btn.classList.toggle('text-blue-700', active);
    btn.classList.toggle('shadow-sm',   active);
    btn.classList.toggle('text-slate-500', !active);
  });

  const year   = calendarDate.getFullYear();
  const month  = calendarDate.getMonth();
  const visible = calendarFilteredQuests();
  const todayKey = toDateKey(new Date());
  let dates = [], periodStart, periodEnd;

  if (calendarView === 'year') {
    byId('calendarDayHeaders').style.display = 'none';
    byId('yearSubToolbar').classList.remove('hidden');
    byId('calendarGrid').className = '';
    byId('monthLabel').textContent = String(year);
    periodStart = new Date(year, 0, 1);
    periodEnd   = new Date(year, 11, 31);
    // Sync sub-view button states
    document.querySelectorAll('.year-sub-btn').forEach(btn => {
      const a = btn.dataset.sub === yearSubView;
      btn.classList.toggle('bg-white',       a);
      btn.classList.toggle('text-blue-700',  a);
      btn.classList.toggle('shadow-sm',      a);
      btn.classList.toggle('text-slate-500', !a);
    });
    // Group-by only relevant for timeline
    const gbWrap = byId('yearGroupByWrap');
    if (gbWrap) { yearSubView === 'timeline' ? gbWrap.classList.remove('hidden') : gbWrap.classList.add('hidden'); }
    // Year-specific show filter
    const yShow  = byId('yearShowFilter')?.value || 'all';
    const yStart = `${year}-01-01`, yEnd = `${year}-12-31`;
    let yearVisible = visible;
    if (yShow === 'active') yearVisible = visible.filter(q => q.start_date <= todayKey && q.end_date >= todayKey);
    if (yShow === 'starts') yearVisible = visible.filter(q => q.start_date >= yStart && q.start_date <= yEnd);
    if (yShow === 'ends')   yearVisible = visible.filter(q => q.end_date   >= yStart && q.end_date   <= yEnd);
    byId('calendarGrid').innerHTML = renderYearViewHTML(year, yearVisible, todayKey);
    renderCalendarSummary(yearVisible, periodStart, periodEnd);
    byId('calendarPeriodLabel').textContent = `Full Year ${year}`;
    renderCalendarLegend();
    renderCalendarAgenda(yearVisible, periodStart, periodEnd);
    return;
  }

  byId('yearSubToolbar').classList.add('hidden');
  byId('calendarDayHeaders').style.display = '';
  byId('calendarGrid').className = 'grid grid-cols-7';

  if (calendarView === 'week') {
    periodStart = startOfWeek(calendarDate);
    periodEnd   = addDays(periodStart, 6);
    dates = Array.from({ length: 7 }, (_, i) => addDays(periodStart, i));
    byId('monthLabel').textContent = `${formatDate(toDateKey(periodStart))} – ${formatDate(toDateKey(periodEnd))}, ${periodEnd.getFullYear()}`;
  } else {
    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells  = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    periodStart = new Date(year, month, 1);
    periodEnd   = new Date(year, month, daysInMonth);
    dates = Array.from({ length: totalCells }, (_, i) => {
      const day = i - firstDay + 1;
      return (day < 1 || day > daysInMonth) ? null : new Date(year, month, day);
    });
    byId('monthLabel').textContent = calendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  byId('calendarGrid').innerHTML = dates.map(date => {
    if (!date) return '<div class="calendar-cell border-r border-b border-slate-100 bg-slate-50/60"></div>';
    const dateKey   = toDateKey(date);
    const dayQuests = visible.filter(q => dateKey >= q.start_date && dateKey <= q.end_date);
    const launches  = dayQuests.filter(q => q.start_date === dateKey).length;
    const endings   = dayQuests.filter(q => q.end_date   === dateKey).length;
    const loadLevel = dayQuests.length >= 4 ? 'High load' : dayQuests.length >= 2 ? 'Balanced' : 'Open slot';
    const loadClass = dayQuests.length >= 4 ? 'text-red-600 bg-red-50' : dayQuests.length >= 2 ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50';
    const maxShow   = calendarView === 'week' ? 8 : 4;
    return `
      <div class="calendar-cell border-r border-b border-slate-100 p-2 sm:p-3 hover:bg-blue-50/40 transition group ${dateKey === todayKey ? 'ring-2 ring-blue-400 ring-inset' : ''}">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <div class="text-xs font-extrabold ${dateKey === todayKey ? 'bg-blue-600 text-white w-7 h-7 flex items-center justify-center rounded-full' : 'text-slate-500'}">${date.getDate()}</div>
            <div class="mt-1 text-[10px] font-bold rounded-full px-2 py-0.5 inline-block ${loadClass}">${loadLevel}</div>
          </div>
          <button onclick="scheduleOnDate('${dateKey}')" class="w-7 h-7 rounded-lg bg-white border border-slate-200 text-blue-700 hover:bg-blue-50 shadow-sm text-xs" title="Create quest on this day">+</button>
        </div>
        <div class="flex gap-1 mb-2 text-[10px] text-slate-400 font-bold">
          ${launches ? `<span class="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">${launches} start</span>` : ''}
          ${endings  ? `<span class="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">${endings} end</span>` : ''}
        </div>
        <div class="space-y-1">
          ${dayQuests.slice(0, maxShow).map(q => calendarQuestButton(q, dateKey)).join('')}
          ${dayQuests.length > maxShow ? `<button onclick="openDayAgenda('${dateKey}')" class="text-[10px] font-bold text-slate-500 hover:text-blue-700">+${dayQuests.length - maxShow} more</button>` : ''}
        </div>
      </div>`;
  }).join('');

  renderCalendarSummary(visible, periodStart, periodEnd);
  renderCalendarLegend();
  renderCalendarAgenda(visible, periodStart, periodEnd);
}

function calendarQuestButton(quest, dateKey) {
  const cat    = categories[quest.category];
  const marker = quest.start_date === dateKey ? '▶' : quest.end_date === dateKey ? '■' : '•';
  return `<button onclick="openQuestDetails('${quest.id}')" class="quest-pill w-full text-left text-[10px] font-bold rounded-lg px-2 py-1 ${cat.bg} ${cat.text} border ${cat.border}"><span class="mr-1">${marker}</span>${quest.title}</button>`;
}

function renderCalendarSummary(visible, periodStart, periodEnd) {
  const startKey = toDateKey(periodStart);
  const endKey   = toDateKey(periodEnd);
  const inPeriod = visible.filter(q => q.end_date >= startKey && q.start_date <= endKey);
  const launches  = inPeriod.filter(q => q.start_date >= startKey && q.start_date <= endKey).length;
  const customers = inPeriod.reduce((s, q) => s + q.target * q.completion / 100, 0);
  const revenue   = inPeriod.reduce((s, q) => s + q.revenue, 0);
  const avgComp   = inPeriod.length ? inPeriod.reduce((s, q) => s + q.completion, 0) / inPeriod.length : 0;

  byId('calendarSummary').innerHTML = [
    { label: 'Quests in period',  value: inPeriod.length,     icon: 'fa-calendar-check', color: 'blue',   sub: null },
    { label: 'New launches',      value: launches,            icon: 'fa-rocket',          color: 'violet', sub: null },
    { label: 'Customers doing',   value: compact(customers),  icon: 'fa-users',           color: 'emerald',sub: null },
    { label: 'Forecast revenue',  value: money(revenue),      icon: 'fa-sack-dollar',     color: 'amber',  sub: `${percent(avgComp)} avg completion` }
  ].map(item => `
    <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase tracking-widest font-bold text-slate-400">${item.label}</span>
        <i class="fas ${item.icon} text-${item.color}-600"></i>
      </div>
      <div class="text-xl font-extrabold text-slate-900 mt-2">${item.value}</div>
      ${item.sub ? `<div class="text-xs text-slate-500 mt-1">${item.sub}</div>` : ''}
    </div>`).join('');

  byId('calendarPeriodLabel').textContent = `${formatDate(toDateKey(periodStart))} – ${formatDate(toDateKey(periodEnd))}`;
}

function renderCalendarLegend() {
  byId('calendarLegend').innerHTML =
    Object.entries(categories).map(([, cat]) =>
      `<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full ${cat.bg} ${cat.text}"><i class="fas fa-circle text-[8px]"></i>${cat.label}</span>`
    ).join('') +
    '<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600">▶ starts</span>' +
    '<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600">■ ends</span>';
}

function renderCalendarAgenda(visible, periodStart, periodEnd) {
  const startKey = toDateKey(periodStart);
  const endKey   = toDateKey(periodEnd);

  if (calendarView === 'year') {
    const year = periodStart.getFullYear();
    byId('calendarAgendaTitle').textContent = `Annual Quest Roster — ${year}`;
    byId('calendarAgendaSub').textContent   = 'All quests organised by quarter. Click any quest to view details.';
    const quarters = [
      { label: 'Q1 — Jan – Mar', badge: 'text-violet-700 bg-violet-50', dot: 'bg-violet-400', start: `${year}-01-01`, end: `${year}-03-31`, jumpM: 0 },
      { label: 'Q2 — Apr – Jun', badge: 'text-blue-700 bg-blue-50',     dot: 'bg-blue-400',   start: `${year}-04-01`, end: `${year}-06-30`, jumpM: 3 },
      { label: 'Q3 — Jul – Sep', badge: 'text-emerald-700 bg-emerald-50',dot:'bg-emerald-400', start: `${year}-07-01`, end: `${year}-09-30`, jumpM: 6 },
      { label: 'Q4 — Oct – Dec', badge: 'text-orange-700 bg-orange-50', dot: 'bg-orange-400',  start: `${year}-10-01`, end: `${year}-12-31`, jumpM: 9 },
    ];
    byId('calendarAgenda').innerHTML = quarters.map((qt, qi) => {
      const qQuests = visible
        .filter(q => q.end_date >= qt.start && q.start_date <= qt.end)
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      const qRev  = qQuests.reduce((s, q) => s + (q.revenue || 0), 0);
      const qComp = qQuests.length ? Math.round(qQuests.reduce((s, q) => s + (q.completion || 0), 0) / qQuests.length) : 0;
      return `
        <div class="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-2">
              <div class="w-2.5 h-2.5 rounded-full flex-shrink-0 ${qt.dot}"></div>
              <span class="font-extrabold text-slate-900">${qt.label}</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-bold ${qt.badge} px-2 py-0.5 rounded-full">${qQuests.length} quest${qQuests.length !== 1 ? 's' : ''}</span>
              <span class="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">${money(qRev)}</span>
              ${qQuests.length ? `<span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">${qComp}% avg</span>` : ''}
            </div>
          </div>
          ${qQuests.length ? `
          <div class="divide-y divide-slate-50">
            ${qQuests.slice(0, 5).map(q => {
              const cat = categories[q.category];
              return `<button onclick="openQuestDetails('${q.id}')" class="w-full text-left flex items-center gap-2 py-1.5 px-1 rounded-lg hover:bg-slate-50 transition">
                <span class="w-2 h-2 rounded-full flex-shrink-0 ${cat.bg} border ${cat.border}"></span>
                <span class="text-xs font-bold text-slate-800 truncate flex-1">${q.title}</span>
                <span class="text-[10px] text-slate-400 flex-shrink-0 hidden sm:block">${formatDate(q.start_date)}</span>
                <span class="text-[9px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded ${cat.bg} ${cat.text}">${cat.short}</span>
              </button>`;
            }).join('')}
            ${qQuests.length > 5 ? `<button onclick="jumpToMonth(${year}, ${qt.jumpM})" class="w-full text-left text-[10px] font-bold text-blue-600 hover:text-blue-800 pt-2 pl-1">+${qQuests.length - 5} more — open Q${qi + 1} →</button>` : ''}
          </div>` : '<div class="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-xl">No quests this quarter</div>'}
        </div>`;
    }).join('');
    return;
  }

  byId('calendarAgendaTitle').textContent = 'Upcoming Launch Agenda';
  byId('calendarAgendaSub').textContent   = 'Next scheduled starts in the selected period.';
  const launches = visible.filter(q => q.start_date >= startKey && q.start_date <= endKey)
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  byId('calendarAgenda').innerHTML = launches.length
    ? launches.slice(0, 6).map(q => {
        const cat = categories[q.category];
        return `<button onclick="openQuestDetails('${q.id}')" class="text-left rounded-2xl bg-white border border-slate-200 p-4 hover:border-blue-200 hover:shadow-sm transition">
          <div class="flex items-center justify-between gap-3">
            <span class="font-extrabold text-slate-900">${q.title}</span>
            <span class="text-xs font-bold ${cat.text} ${cat.bg} px-2 py-1 rounded-full">${cat.short}</span>
          </div>
          <div class="text-xs text-slate-500 mt-2">Starts ${formatDate(q.start_date)} • ${q.segment} • ${compact(q.target)} targeted</div>
        </button>`;
      }).join('')
    : '<div class="lg:col-span-2 rounded-2xl bg-white border border-dashed border-slate-200 p-6 text-center text-slate-500">No launches match the current calendar filters.</div>';
}

function renderYearViewHTML(year, visible, todayKey) {
  if (yearSubView === 'timeline') return renderYearTimelineHTML(year, visible, todayKey);
  if (yearSubView === 'stats')    return renderYearStatsHTML(year, visible);
  return renderYearMonthsHTML(year, visible, todayKey);
}

function renderYearHeatmap(year, visible, todayKey) {
  const pad = n => String(n).padStart(2, '0');
  // Build day → count map for the whole year
  const dayMap = {};
  let cur = new Date(year, 0, 1);
  while (cur.getFullYear() === year) {
    const key = toDateKey(cur);
    dayMap[key] = visible.filter(q => key >= q.start_date && key <= q.end_date).length;
    cur.setDate(cur.getDate() + 1);
  }
  // Build week columns starting from Sunday on/before Jan 1
  const jan1 = new Date(year, 0, 1);
  const gridStart = startOfWeek(jan1);
  const weeks = [];
  cur = new Date(gridStart);
  while (true) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const key    = toDateKey(cur);
      const inYear = cur.getFullYear() === year;
      week.push({ key, inYear, count: inYear ? (dayMap[key] || 0) : -1, month: cur.getMonth(), day: cur.getDate() });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    if (cur > new Date(year, 11, 31)) break;
  }
  // Month labels positioned at first-of-month week columns
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabelAt = {};
  weeks.forEach((week, wi) => {
    week.forEach(cell => { if (cell.inYear && cell.day === 1) monthLabelAt[wi] = MONTH_ABBR[cell.month]; });
  });
  const heatColor = c => c < 0 ? 'bg-transparent' : c === 0 ? 'bg-slate-100' : c === 1 ? 'bg-blue-200' : c <= 3 ? 'bg-blue-400' : c <= 5 ? 'bg-violet-500' : 'bg-red-500';
  const DOW_LABELS = ['','M','','W','','F',''];
  return `
    <div class="p-4 sm:p-6 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div class="flex items-center gap-2 mb-0.5">
            <i class="fas fa-fire-flame-curved text-orange-500"></i>
            <span class="text-xs font-extrabold uppercase tracking-widest text-slate-700">Quest Activity Heatmap — ${year}</span>
          </div>
          <div class="text-[11px] text-slate-400 pl-5">Each cell = one day · color intensity = concurrent active quests</div>
        </div>
        <div class="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold">
          <span>Less</span>
          <div class="w-3 h-3 rounded-sm bg-slate-100 border border-slate-200"></div>
          <div class="w-3 h-3 rounded-sm bg-blue-200"></div>
          <div class="w-3 h-3 rounded-sm bg-blue-400"></div>
          <div class="w-3 h-3 rounded-sm bg-violet-500"></div>
          <div class="w-3 h-3 rounded-sm bg-red-500"></div>
          <span>More</span>
        </div>
      </div>
      <div class="flex gap-0.5 overflow-x-auto pb-1 select-none">
        <div class="flex flex-col gap-0.5 mr-1 flex-shrink-0">
          <div class="h-4"></div>
          ${DOW_LABELS.map(l => `<div class="w-4 h-[11px] text-[8px] text-slate-400 font-bold flex items-center justify-end pr-0.5">${l}</div>`).join('')}
        </div>
        ${weeks.map((week, wi) => `
          <div class="flex flex-col gap-0.5 flex-shrink-0">
            <div class="h-4 text-[8px] text-slate-500 font-bold flex items-end pb-0.5 whitespace-nowrap">${monthLabelAt[wi] || ''}</div>
            ${week.map(cell => {
              const isToday = cell.key === todayKey;
              return `<div class="w-[11px] h-[11px] rounded-sm ${heatColor(cell.count)}${isToday ? ' ring-2 ring-offset-0 ring-blue-500' : ''}" title="${cell.key}${cell.count > 0 ? ': ' + cell.count + ' quest' + (cell.count !== 1 ? 's' : '') : ': no quests'}"></div>`;
            }).join('')}
          </div>`).join('')}
      </div>
    </div>`;
}

function renderYearTimelineHTML(year, visible, todayKey) {
  const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const isLeap  = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const totalDays = isLeap ? 366 : 365;
  const yStart  = `${year}-01-01`, yEnd = `${year}-12-31`;
  const MONTH_DAYS = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Month header positions
  let cumDays = 0;
  const monthHeaders = MONTHS_ABBR.map((name, i) => {
    const left  = (cumDays / totalDays * 100).toFixed(2);
    const width = (MONTH_DAYS[i] / totalDays * 100).toFixed(2);
    cumDays += MONTH_DAYS[i];
    return { name, left, width };
  });

  // Today line
  const todayInYear  = todayKey >= yStart && todayKey <= yEnd;
  const todayDayNum  = todayInYear ? Math.floor((new Date(todayKey + 'T00:00:00') - new Date(yStart + 'T00:00:00')) / 86400000) : -1;
  const todayLeftPct = todayDayNum >= 0 ? (todayDayNum / totalDays * 100).toFixed(2) : null;

  // Quests overlapping the year
  const yearQuests = visible
    .filter(q => q.end_date >= yStart && q.start_date <= yEnd)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  // Grouping
  const gBy = yearGroupBy;
  let groups;
  if (gBy === 'category') {
    const map = {};
    yearQuests.forEach(q => { (map[q.category] = map[q.category] || []).push(q); });
    groups = Object.keys(categories).filter(k => map[k]).map(k => ({
      label: categories[k].label, quests: map[k],
      accentBg: categories[k].bg, accentText: categories[k].text,
    }));
  } else if (gBy === 'status') {
    const order  = ['Live','Scheduled','Draft','Paused','Completed'];
    const styles = { Live:'text-green-700', Scheduled:'text-blue-700', Draft:'text-slate-600', Paused:'text-amber-700', Completed:'text-violet-700' };
    const map    = {};
    yearQuests.forEach(q => { (map[q.status] = map[q.status] || []).push(q); });
    groups = order.filter(s => map[s]).map(s => ({ label: s, quests: map[s], accentText: styles[s] }));
  } else if (gBy === 'segment') {
    const map = {};
    yearQuests.forEach(q => { (map[q.segment] = map[q.segment] || []).push(q); });
    groups = Object.keys(map).sort().map(k => ({ label: k, quests: map[k], accentText: 'text-slate-600' }));
  } else {
    groups = [{ label: null, quests: yearQuests }];
  }

  function questBarHTML(q) {
    const cat   = categories[q.category];
    const qs    = q.start_date < yStart ? yStart : q.start_date;
    const qe    = q.end_date   > yEnd   ? yEnd   : q.end_date;
    const sd    = Math.floor((new Date(qs + 'T00:00:00') - new Date(yStart + 'T00:00:00')) / 86400000);
    const ed    = Math.floor((new Date(qe + 'T00:00:00') - new Date(yStart + 'T00:00:00')) / 86400000);
    const left  = (sd / totalDays * 100).toFixed(2);
    const width = Math.max(0.4, ((ed - sd + 1) / totalDays * 100)).toFixed(2);
    const live  = q.status === 'Live';
    return `<div class="absolute inset-y-1.5 rounded-md flex items-center px-2 overflow-hidden cursor-pointer
                        ${cat.bg} border ${cat.border}${live ? ' ring-1 ring-green-400' : ''} hover:brightness-95 transition"
                 style="left:${left}%;width:${width}%"
                 onclick="openQuestDetails('${q.id}')"
                 title="${q.title} | ${q.start_date} → ${q.end_date} | ${q.status}">
              <span class="text-[9px] font-bold ${cat.text} truncate whitespace-nowrap">${q.title}</span>
            </div>`;
  }

  const todayLineHTML = todayLeftPct !== null
    ? `<div class="absolute top-0 bottom-0 w-px bg-blue-500/50 pointer-events-none z-10" style="left:${todayLeftPct}%"></div>`
    : '';

  const headerRowHTML = `
    <div class="flex border-b-2 border-slate-200 bg-slate-50 sticky top-0 z-20">
      <div class="w-44 flex-shrink-0 px-3 py-2 text-[9px] font-extrabold uppercase tracking-widest text-slate-400 border-r border-slate-200 sticky left-0 bg-slate-50 z-30">Quest</div>
      <div class="relative flex-1 h-8 overflow-hidden">
        ${monthHeaders.map(mh => `
          <div class="absolute top-0 bottom-0 flex items-center px-1 border-l border-slate-200"
               style="left:${mh.left}%;width:${mh.width}%">
            <span class="text-[9px] font-extrabold uppercase tracking-widest text-slate-500 truncate">${mh.name}</span>
          </div>`).join('')}
        ${todayLeftPct !== null ? `
        <div class="absolute top-0 bottom-[-9999px] w-px bg-blue-500/60 z-10 pointer-events-none" style="left:${todayLeftPct}%">
          <span class="absolute top-0.5 left-1 text-[8px] font-extrabold text-blue-600 bg-blue-50 px-1 rounded whitespace-nowrap">Today</span>
        </div>` : ''}
      </div>
    </div>`;

  const rowsHTML = groups.map(g => {
    const gHeader = g.label ? `
      <div class="flex border-b border-slate-100 bg-slate-50/90">
        <div class="w-44 flex-shrink-0 px-3 py-1.5 border-r border-slate-100 sticky left-0 bg-slate-50/90 z-10">
          <span class="text-[9px] font-extrabold uppercase tracking-widest ${g.accentText || 'text-slate-500'}">${g.label}</span>
          <span class="text-[9px] text-slate-400 ml-1">${g.quests.length}</span>
        </div>
        <div class="relative flex-1 ${g.accentBg || ''}"></div>
      </div>` : '';
    const questRows = g.quests.map(q => `
      <div class="flex items-stretch min-h-[40px] border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
        <div class="w-44 flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-r border-slate-100 bg-white sticky left-0 z-10">
          <span class="w-2 h-2 rounded-full flex-shrink-0 ${categories[q.category]?.bg} border ${categories[q.category]?.border}"></span>
          <span class="text-[10px] font-bold text-slate-700 truncate" title="${q.title}">${q.title}</span>
        </div>
        <div class="relative flex-1">
          ${questBarHTML(q)}
          ${todayLineHTML}
        </div>
      </div>`).join('');
    return gHeader + questRows;
  }).join('');

  return `
    <div class="p-4 sm:p-6 bg-white border-b border-slate-100">
      <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div class="flex items-center gap-2">
          <i class="fas fa-bars-staggered text-violet-600"></i>
          <span class="text-xs font-extrabold uppercase tracking-widest text-slate-700">Campaign Timeline — ${year}</span>
        </div>
        <span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">${yearQuests.length} quest${yearQuests.length !== 1 ? 's' : ''} overlapping this year</span>
      </div>
      <div class="rounded-2xl border border-slate-200 overflow-hidden overflow-x-auto">
        ${headerRowHTML}
        <div>${yearQuests.length ? rowsHTML : '<div class="py-14 text-center text-slate-400 text-sm">No quests match the current filters for this year.</div>'}</div>
      </div>
    </div>`;
}

function renderYearStatsHTML(year, visible) {
  const MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const pad = n => String(n).padStart(2, '0');

  const monthly = MONTHS_ABBR.map((name, m) => {
    const dIM = new Date(year, m + 1, 0).getDate();
    const ms  = `${year}-${pad(m + 1)}-01`;
    const me  = `${year}-${pad(m + 1)}-${pad(dIM)}`;
    const mq  = visible.filter(q => q.end_date >= ms && q.start_date <= me);
    return {
      name,
      count:     mq.length,
      launches:  mq.filter(q => q.start_date >= ms && q.start_date <= me).length,
      revenue:   mq.reduce((s, q) => s + (q.revenue  || 0), 0),
      customers: mq.reduce((s, q) => s + Math.round(q.target * (q.completion || 0) / 100), 0),
    };
  });

  const maxCount  = Math.max(...monthly.map(d => d.count), 1);
  const maxRev    = Math.max(...monthly.map(d => d.revenue), 1);
  const maxLaunch = Math.max(...monthly.map(d => d.launches), 1);
  const maxCust   = Math.max(...monthly.map(d => d.customers), 1);

  // Breakdowns
  const catMap  = {}, statMap  = {}, segMap  = {};
  visible.forEach(q => {
    catMap[q.category] = (catMap[q.category]   || 0) + 1;
    statMap[q.status]  = (statMap[q.status]     || 0) + 1;
    segMap[q.segment]  = (segMap[q.segment]     || 0) + 1;
  });
  const total = visible.length || 1;
  const catBarColor = { casa:'bg-blue-500', engagement:'bg-violet-500', spending:'bg-orange-500', risk:'bg-red-500', socialresponsibility:'bg-green-500' };
  const statBarColor = { Live:'bg-green-500', Scheduled:'bg-blue-500', Draft:'bg-slate-400', Paused:'bg-amber-500', Completed:'bg-violet-500' };

  // Quarterly totals
  const qDefs = [
    { q:'Q1', months:[0,1,2], badge:'text-violet-700 bg-violet-50', border:'border-t-2 border-violet-200' },
    { q:'Q2', months:[3,4,5], badge:'text-blue-700 bg-blue-50',     border:'border-t-2 border-blue-200' },
    { q:'Q3', months:[6,7,8], badge:'text-emerald-700 bg-emerald-50', border:'border-t-2 border-emerald-200' },
    { q:'Q4', months:[9,10,11], badge:'text-orange-700 bg-orange-50', border:'border-t-2 border-orange-200' },
  ];
  const qStats = qDefs.map(qt => {
    const qm = qt.months.map(i => monthly[i]);
    return { ...qt,
      count:    Math.max(...qm.map(d => d.count), 0),
      launches: qm.reduce((s, d) => s + d.launches, 0),
      revenue:  qm.reduce((s, d) => s + d.revenue, 0),
    };
  });

  function barChartHTML(data, key, colorCls, maxVal, fmt) {
    return '<div class="flex items-end gap-[3px] h-24 pt-2">' +
      data.map(d => {
        const v = d[key];
        const h = maxVal > 0 ? Math.max(2, Math.round((v / maxVal) * 80)) : 2;
        return `<div class="flex flex-col items-center flex-1 gap-0.5">
          <div class="text-[7px] text-slate-400 font-bold leading-none">${v && fmt ? fmt(v) : (v || '')}</div>
          <div class="${colorCls} rounded-t w-full transition-all" style="height:${h}px"></div>
          <div class="text-[7px] text-slate-400 font-bold mt-0.5">${d.name}</div>
        </div>`;
      }).join('') + '</div>';
  }

  function hBarHTML(label, count, total, colorCls) {
    const pct = Math.max(2, Math.round(count / total * 100));
    return `<div class="flex items-center gap-2">
      <div class="w-24 text-[10px] font-bold text-slate-600 truncate" title="${label}">${label}</div>
      <div class="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div class="${colorCls} h-full rounded-full" style="width:${pct}%"></div>
      </div>
      <div class="text-[10px] font-extrabold text-slate-700 w-6 text-right">${count}</div>
    </div>`;
  }

  return `
    <div class="p-4 sm:p-6 bg-white border-b border-slate-100 space-y-6">
      <div class="flex items-center gap-2">
        <i class="fas fa-chart-column text-blue-600 text-sm"></i>
        <span class="text-xs font-extrabold uppercase tracking-widest text-slate-700">Year Statistics — ${year}</span>
        <span class="text-[10px] text-slate-400 ml-1">${visible.length} quest${visible.length !== 1 ? 's' : ''}</span>
      </div>

      <!-- Quarterly summary cards -->
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3">
        ${qStats.map(q => `
          <div class="rounded-2xl bg-slate-50 border border-slate-100 p-4 ${q.border}">
            <div class="flex items-center justify-between mb-3">
              <span class="text-[10px] font-extrabold ${q.badge} px-2 py-0.5 rounded-full">${q.q}</span>
              <span class="text-2xl font-extrabold text-slate-900">${q.count}</span>
            </div>
            <div class="grid grid-cols-2 gap-1 text-center">
              <div class="rounded-xl bg-white p-1.5 border border-slate-100">
                <div class="text-[10px] font-extrabold text-violet-700">${q.launches}</div>
                <div class="text-[8px] text-slate-400 font-bold">starts</div>
              </div>
              <div class="rounded-xl bg-white p-1.5 border border-slate-100">
                <div class="text-[10px] font-extrabold text-emerald-700">${money(q.revenue)}</div>
                <div class="text-[8px] text-slate-400 font-bold">revenue</div>
              </div>
            </div>
          </div>`).join('')}
      </div>

      <!-- 4 bar charts -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-extrabold text-slate-700">Active Quests / Month</span>
            <i class="fas fa-calendar-check text-blue-500 text-xs"></i>
          </div>
          <div class="text-[10px] text-slate-400 mb-2">Concurrent quests per month</div>
          ${barChartHTML(monthly, 'count', 'bg-blue-400', maxCount, null)}
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-extrabold text-slate-700">New Launches / Month</span>
            <i class="fas fa-rocket text-violet-500 text-xs"></i>
          </div>
          <div class="text-[10px] text-slate-400 mb-2">Quests starting each month</div>
          ${barChartHTML(monthly, 'launches', 'bg-violet-400', maxLaunch, null)}
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-extrabold text-slate-700">Revenue Forecast / Month</span>
            <i class="fas fa-sack-dollar text-emerald-500 text-xs"></i>
          </div>
          <div class="text-[10px] text-slate-400 mb-2">Forecast revenue from active quests</div>
          ${barChartHTML(monthly, 'revenue', 'bg-emerald-400', maxRev, v => '$' + compact(v))}
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-extrabold text-slate-700">Customers Engaged / Month</span>
            <i class="fas fa-users text-orange-500 text-xs"></i>
          </div>
          <div class="text-[10px] text-slate-400 mb-2">Estimated participants per month</div>
          ${barChartHTML(monthly, 'customers', 'bg-orange-400', maxCust, v => compact(v))}
        </div>
      </div>

      <!-- Breakdown bars -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div class="flex items-center gap-2 mb-3">
            <i class="fas fa-layer-group text-xs text-slate-500"></i>
            <span class="text-xs font-extrabold text-slate-700">By Category</span>
          </div>
          <div class="space-y-2">
            ${Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([k,cnt]) =>
              hBarHTML(categories[k]?.label || k, cnt, total, catBarColor[k] || 'bg-slate-400')
            ).join('') || '<div class="text-xs text-slate-400 text-center py-3">No data</div>'}
          </div>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div class="flex items-center gap-2 mb-3">
            <i class="fas fa-circle-half-stroke text-xs text-slate-500"></i>
            <span class="text-xs font-extrabold text-slate-700">By Status</span>
          </div>
          <div class="space-y-2">
            ${Object.entries(statMap).sort((a,b)=>b[1]-a[1]).map(([s,cnt]) =>
              hBarHTML(s, cnt, total, statBarColor[s] || 'bg-slate-400')
            ).join('') || '<div class="text-xs text-slate-400 text-center py-3">No data</div>'}
          </div>
        </div>
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div class="flex items-center gap-2 mb-3">
            <i class="fas fa-users-between-lines text-xs text-slate-500"></i>
            <span class="text-xs font-extrabold text-slate-700">By Segment</span>
          </div>
          <div class="space-y-2">
            ${Object.entries(segMap).sort((a,b)=>b[1]-a[1]).map(([seg,cnt]) =>
              hBarHTML(seg, cnt, total, 'bg-sky-400')
            ).join('') || '<div class="text-xs text-slate-400 text-center py-3">No data</div>'}
          </div>
        </div>
      </div>
    </div>`;
}

function renderYearMonthsHTML(year, visible, todayKey) {
  const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const Q_LABEL = ['Q1','Q2','Q3','Q4'];
  const Q_COLOR = ['#7c3aed','#2563eb','#059669','#ea580c'];
  const STATUS_C = { Live:'#22c55e', Scheduled:'#3b82f6', Draft:'#94a3b8', Paused:'#f59e0b', Completed:'#8b5cf6' };
  const pad = n => String(n).padStart(2, '0');

  // ── Year-level KPI banner ────────────────────────────────────────────────
  const yStart = `${year}-01-01`, yEnd = `${year}-12-31`;
  const yQ       = visible.filter(q => q.end_date >= yStart && q.start_date <= yEnd);
  const yRev     = yQ.reduce((s, q) => s + (q.revenue || 0), 0);
  const yLive    = yQ.filter(q => q.status === 'Live').length;
  const yComp    = yQ.length ? Math.round(yQ.reduce((s, q) => s + (q.completion || 0), 0) / yQ.length) : 0;
  const yLaunch  = yQ.filter(q => q.start_date >= yStart && q.start_date <= yEnd).length;
  const yComplet = yQ.filter(q => q.status === 'Completed').length;

  const kpis = [
    { icon:'fa-layer-group',    label:'Campaigns',  val: yQ.length,          color:'#334155' },
    { icon:'fa-rocket',         label:'Launched',   val: yLaunch,            color:'#7c3aed' },
    { icon:'fa-circle-dot',     label:'Live Now',   val: yLive,              color:'#16a34a' },
    { icon:'fa-flag-checkered', label:'Completed',  val: yComplet,           color:'#8b5cf6' },
    { icon:'fa-sack-dollar',    label:'Revenue',    val: money(yRev),        color:'#059669' },
    { icon:'fa-chart-pie',      label:'Avg Done',   val: yComp + '%',        color:'#2563eb' },
  ];

  const summaryBar = `
    <div class="flex flex-wrap items-center gap-6 px-6 py-4 bg-white border-b border-slate-200">
      <div class="flex items-baseline gap-2 mr-2">
        <span class="text-3xl font-black text-slate-900">${year}</span>
        <span class="text-xs font-bold text-slate-400 uppercase tracking-wide">Grid View</span>
      </div>
      <div class="flex flex-wrap gap-5 ml-auto">
        ${kpis.map(k => `
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center" style="background:${k.color}18">
              <i class="fas ${k.icon} text-[11px]" style="color:${k.color}"></i>
            </div>
            <div>
              <div class="text-[9px] font-bold text-slate-400 leading-none uppercase tracking-wide">${k.label}</div>
              <div class="text-sm font-extrabold leading-snug" style="color:${k.color}">${k.val}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  // ── Month cards ──────────────────────────────────────────────────────────
  const cards = MONTHS.map((monthName, m) => {
    const firstDow   = new Date(year, m, 1).getDay();
    const dIM        = new Date(year, m + 1, 0).getDate();
    const monthStart = `${year}-${pad(m + 1)}-01`;
    const monthEnd   = `${year}-${pad(m + 1)}-${pad(dIM)}`;
    const mQuests    = visible.filter(q => q.end_date >= monthStart && q.start_date <= monthEnd);
    const isCurrent  = todayKey.startsWith(`${year}-${pad(m + 1)}`);
    const isPast     = !isCurrent && monthEnd < todayKey;
    const revenue    = mQuests.reduce((s, q) => s + (q.revenue || 0), 0);
    const liveCount  = mQuests.filter(q => q.status === 'Live').length;
    const launches   = mQuests.filter(q => q.start_date >= monthStart && q.start_date <= monthEnd).length;
    const avgComp    = mQuests.length ? Math.round(mQuests.reduce((s, q) => s + (q.completion || 0), 0) / mQuests.length) : 0;
    const qi         = Math.floor(m / 3);
    const qColor     = isCurrent ? '#2563eb' : Q_COLOR[qi];

    // Day-density heatmap strip
    const dayCells = Array.from({ length: dIM }, (_, i) => {
      const day = i + 1;
      const dk  = `${year}-${pad(m + 1)}-${pad(day)}`;
      const cnt = visible.filter(q => dk >= q.start_date && dk <= q.end_date).length;
      const isToday = dk === todayKey;
      const bg = isToday ? qColor : qColor;
      const op = isToday ? 1 : cnt === 0 ? 0.07 : cnt === 1 ? 0.28 : cnt === 2 ? 0.52 : cnt <= 4 ? 0.72 : 0.95;
      const outline = isToday ? `outline:2px solid ${qColor};outline-offset:-1px;border-radius:2px;` : '';
      return `<div class="h-full flex-shrink-0" style="background:${bg};opacity:${op};${outline}" title="${dk}: ${cnt} quest${cnt !== 1 ? 's' : ''}"></div>`;
    }).join('');

    // Week activity bars (up to 6 weeks)
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      let wMax = 0, hasDay = false;
      for (let d = 0; d < 7; d++) {
        const day = w * 7 + d - firstDow + 1;
        if (day >= 1 && day <= dIM) {
          hasDay = true;
          const dk = `${year}-${pad(m + 1)}-${pad(day)}`;
          const cnt = visible.filter(q => dk >= q.start_date && dk <= q.end_date).length;
          wMax = Math.max(wMax, cnt);
        }
      }
      if (hasDay) weeks.push(wMax);
    }
    const maxW = Math.max(...weeks, 1);

    // Top quests (prioritise Live → Scheduled, up to 3)
    const topQ = [...mQuests]
      .sort((a, b) => {
        const order = { Live:0, Scheduled:1, Paused:2, Completed:3, Draft:4 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      })
      .slice(0, 3);

    // Status breakdown chips
    const statusChips = ['Live','Scheduled','Completed','Paused','Draft']
      .map(s => ({ s, cnt: mQuests.filter(q => q.status === s).length }))
      .filter(x => x.cnt > 0)
      .map(x => `<span class="flex items-center gap-1 text-[9px] font-bold rounded-full px-1.5 py-0.5"
                       style="background:${STATUS_C[x.s]}18;color:${STATUS_C[x.s]}">
          <span class="w-1 h-1 rounded-full flex-shrink-0" style="background:${STATUS_C[x.s]}"></span>${x.cnt} ${x.s}
        </span>`).join('');

    const borderClass = isCurrent
      ? 'border-2 border-blue-400 shadow-xl shadow-blue-100/60'
      : 'border border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/60';

    return `
      <div class="bg-white rounded-2xl ${borderClass} transition-all duration-200 cursor-pointer group overflow-hidden flex flex-col"
           onclick="jumpToMonth(${year}, ${m})">

        <!-- Quarter color accent bar -->
        <div class="h-1.5 w-full" style="background:${qColor}"></div>

        <!-- Header: month + count -->
        <div class="flex items-start justify-between px-4 pt-3 pb-1.5">
          <div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-black text-slate-900 text-base leading-none">${monthName}</span>
              ${isCurrent ? `<span class="text-[9px] font-black text-white px-1.5 py-0.5 rounded-full leading-none" style="background:${qColor}">NOW</span>` : ''}
            </div>
            <div class="text-[9px] font-semibold text-slate-400 mt-0.5">${Q_LABEL[qi]} · ${isPast ? 'Past' : isCurrent ? 'Current' : 'Upcoming'}</div>
          </div>
          <div class="text-right flex-shrink-0 ml-2">
            <div class="text-2xl font-black leading-none ${mQuests.length ? 'text-slate-900' : 'text-slate-200'}">${mQuests.length}</div>
            <div class="text-[8px] font-bold text-slate-400 leading-none">quests</div>
          </div>
        </div>

        <!-- Day heatmap strip -->
        <div class="px-3 pb-1.5">
          <div class="text-[8px] font-bold text-slate-300 mb-0.5 uppercase tracking-wide">Daily activity</div>
          <div class="flex gap-px rounded overflow-hidden" style="height:10px">${dayCells}</div>
        </div>

        <!-- Week activity bars -->
        <div class="px-3 pb-2">
          <div class="text-[8px] font-bold text-slate-300 mb-1 uppercase tracking-wide">Weekly load</div>
          <div class="flex items-end gap-0.5" style="height:36px">
            ${weeks.map((h, wi) => {
              const pct = Math.max(6, Math.round((h / maxW) * 100));
              const op  = h === 0 ? 0.1 : 0.65;
              return `<div class="flex-1 rounded-t-sm transition-all" style="height:${pct}%;background:${qColor};opacity:${op}" title="Wk ${wi + 1}: ${h} active quests"></div>`;
            }).join('')}
          </div>
          <div class="flex mt-0.5">
            ${weeks.map((_, wi) => `<div class="flex-1 text-center text-[7px] text-slate-300 font-semibold">W${wi + 1}</div>`).join('')}
          </div>
        </div>

        <!-- Campaign list -->
        <div class="px-3 space-y-1 pb-2 flex-1" style="min-height:3.5rem">
          ${topQ.length
            ? topQ.map(q => {
                const cat = categories[q.category] || { bg:'bg-slate-100', text:'text-slate-600', icon:'fa-circle' };
                const sc  = STATUS_C[q.status] || '#94a3b8';
                return `<div class="flex items-center gap-1.5 text-[9px] font-bold rounded-lg px-2 py-1 ${cat.bg} ${cat.text} overflow-hidden">
                  <i class="fas ${cat.icon} text-[8px] flex-shrink-0"></i>
                  <span class="truncate flex-1">${q.title}</span>
                  <span class="flex-shrink-0 w-1.5 h-1.5 rounded-full" style="background:${sc}" title="${q.status}"></span>
                </div>`;
              }).join('')
            : `<div class="text-[9px] italic text-slate-200 px-1">No campaigns this month</div>`}
        </div>

        <!-- Completion progress bar -->
        ${mQuests.length ? `
        <div class="px-3 pb-2">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[8px] font-bold text-slate-400 uppercase tracking-wide">Avg completion</span>
            <span class="text-[9px] font-extrabold" style="color:${qColor}">${avgComp}%</span>
          </div>
          <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full" style="width:${avgComp}%;background:${qColor}"></div>
          </div>
        </div>` : ''}

        <!-- Status chips -->
        ${mQuests.length ? `
        <div class="px-3 pb-2 flex flex-wrap gap-1">${statusChips}</div>` : ''}

        <!-- Footer: launches · live · revenue -->
        <div class="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
          <div class="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[9px] font-bold">
            ${launches ? `<span class="text-violet-600"><i class="fas fa-rocket mr-0.5"></i>${launches} launch${launches > 1 ? 'es' : ''}</span>` : ''}
            ${liveCount ? `<span class="text-green-600"><i class="fas fa-circle-dot mr-0.5"></i>${liveCount} live</span>` : ''}
            ${!launches && !liveCount ? `<span class="text-slate-300">—</span>` : ''}
          </div>
          <span class="text-[9px] font-extrabold flex-shrink-0 ${mQuests.length ? 'text-emerald-700' : 'text-slate-300'}">${mQuests.length ? money(revenue) : ''}</span>
        </div>

        <!-- Hover CTA -->
        <div class="h-0 group-hover:h-7 overflow-hidden flex items-center justify-center gap-1.5 text-[9px] font-extrabold text-white transition-all duration-150" style="background:${qColor}">
          <i class="fas fa-calendar-days text-[8px]"></i> Open ${monthName}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">
      ${summaryBar}
      <div class="p-5 sm:p-6 bg-slate-50/50">
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">${cards}</div>
      </div>
    </div>`;
}

function jumpToMonth(year, m) {
  calendarDate = new Date(year, m, 1);
  calendarView = 'month';
  renderCalendar();
}

// ── Quest table ───────────────────────────────────────────────────────────────
function filteredQuests() {
  const term     = byId('searchInput').value.trim().toLowerCase();
  const category = byId('categoryFilter').value;
  const status   = byId('questStatusFilter').value;
  return allQuests.filter(q =>
    (!term || `${q.title} ${q.action} ${q.segment} ${q.status}`.toLowerCase().includes(term)) &&
    (category === 'all' || q.category === category) &&
    (status   === 'all' || q.status   === status)
  );
}

function questSortValue(q, key) {
  const completed = q.target * q.completion / 100;
  const roi       = q.budget ? ((q.revenue - q.budget) / q.budget) * 100 : 0;
  return { title: q.title, category: categories[q.category]?.label || '', start: new Date(q.start_date).getTime(), completed, revenue: q.revenue, roi, status: q.status }[key] ?? q.title;
}

function renderTable() {
  const sorted   = sortRows(filteredQuests(), tableState.quests, questSortValue);
  const pageData = pageRows(sorted, tableState.quests);

  byId('questRows').innerHTML = pageData.rows.length ? pageData.rows.map(q => {
    const cat       = categories[q.category];
    const completed = q.target * q.completion / 100;
    const roi       = q.budget ? ((q.revenue - q.budget) / q.budget) * 100 : 0;
    return `<tr class="hover:bg-slate-50/80 transition">
      <td class="p-5"><div class="font-extrabold text-slate-900">${q.title}</div><div class="text-xs text-slate-500 mt-1 max-w-xs truncate">${q.action}</div></td>
      <td class="p-5"><span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold ${cat.bg} ${cat.text}"><i class="fas ${cat.icon}"></i>${cat.short}</span></td>
      <td class="p-5"><div class="font-bold">${formatDate(q.start_date)}</div><div class="text-xs text-slate-400">to ${formatDate(q.end_date)}</div></td>
      <td class="p-5"><div class="font-bold">${compact(completed)} doing</div><div class="text-xs text-slate-400">${compact(q.target)} targeted • ${q.completion}%</div></td>
      <td class="p-5"><div class="font-bold text-emerald-700">${money(q.revenue)}</div><div class="text-xs text-slate-400">budget ${money(q.budget)}</div></td>
      <td class="p-5"><div class="font-extrabold ${roi >= 0 ? 'text-blue-700' : 'text-red-700'}">${percent(roi)}</div></td>
      <td class="p-5">${statusBadge(q.status)}</td>
      <td class="p-5 text-right">
        <button onclick="openQuestDetails('${q.id}')" class="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"><i class="fas fa-eye"></i></button>
        <button onclick="editQuest('${q.id}')"        class="w-9 h-9 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700"><i class="fas fa-pen"></i></button>
        <button onclick="deleteQuest('${q.id}')"      class="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-700"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="p-10 text-center text-slate-500">No quests match the current filters.</td></tr>';

  renderPagination('questPagination', 'questTableInfo', 'quests', sorted.length, pageData, renderTable);
}

// ── Customer ranking ──────────────────────────────────────────────────────────
function filteredCustomers() {
  const term    = byId('customerSearchInput').value.trim().toLowerCase();
  const segment = byId('customerSegmentFilter').value;
  const tier    = byId('customerTierFilter').value;
  return allCustomers.filter(c =>
    (!term || `${c.name} ${c.segment} ${c.tier}`.toLowerCase().includes(term)) &&
    (segment === 'all' || c.segment === segment) &&
    (tier    === 'all' || c.tier    === tier)
  );
}

function customerSortValue(c, key) {
  return { rank: c.rank, name: c.name, segment: c.segment, quests: c.quests_done, xp: c.xp, completion: c.completion, impact: c.impact, tier: c.tier }[key] ?? c.rank;
}

function renderCustomerRanking() {
  const sorted   = sortRows(filteredCustomers(), tableState.customers, customerSortValue);
  const pageData = pageRows(sorted, tableState.customers);

  byId('customerRankingRows').innerHTML = pageData.rows.length ? pageData.rows.map(c => {
    const rank      = c.rank;
    const rankClass = rank === 1 ? 'bg-amber-100 text-amber-700' : rank === 2 ? 'bg-slate-200 text-slate-700' : rank === 3 ? 'bg-orange-100 text-orange-700' : 'bg-blue-50 text-blue-700';
    const tierClass = c.tier === 'Diamond' ? 'bg-cyan-50 text-cyan-700' : c.tier === 'Platinum' ? 'bg-violet-50 text-violet-700' : c.tier === 'Gold' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700';
    const initials  = c.name.split(' ').map(p => p[0]).slice(0, 2).join('');
    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-5"><span class="inline-flex items-center justify-center w-9 h-9 rounded-xl font-extrabold ${rankClass}">${rank}</span></td>
        <td class="p-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-extrabold">${initials}</div>
            <div>
              <div class="font-extrabold text-slate-900">${c.name}</div>
              <div class="text-xs text-slate-400">Customer ID ${String(730000 + rank * 137).padStart(6, '0')}</div>
            </div>
          </div>
        </td>
        <td class="p-5"><span class="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">${c.segment}</span></td>
        <td class="p-5"><div class="font-extrabold text-slate-900">${c.quests_done}</div><div class="text-xs text-slate-400">completed quests</div></td>
        <td class="p-5"><div class="font-extrabold text-blue-700">${new Intl.NumberFormat('en-US').format(c.xp)}</div><div class="text-xs text-slate-400">reward points</div></td>
        <td class="p-5">
          <div class="flex items-center gap-3">
            <div class="w-28 bg-slate-100 h-2 rounded-full overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width:${c.completion}%"></div></div>
            <span class="font-bold text-slate-700">${c.completion}%</span>
          </div>
        </td>
        <td class="p-5"><div class="font-extrabold text-emerald-700">${money(c.impact)}</div><div class="text-xs text-slate-400">estimated uplift</div></td>
        <td class="p-5"><span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold ${tierClass}"><i class="fas fa-trophy"></i>${c.tier}</span></td>
      </tr>`;
  }).join('') : '<tr><td colspan="8" class="p-10 text-center text-slate-500">No customers match the current filters.</td></tr>';

  renderPagination('customerPagination', 'customerTableInfo', 'customers', sorted.length, pageData, renderCustomerRanking);
}

// ── Charts ────────────────────────────────────────────────────────────────────
const CATEGORY_COLORS = Object.values(categories).map(c => c.color);

function renderCharts() {
  if (!chartData.forecast) return;

  const { forecast, mix, funnel, scorecard } = chartData;

  upsertChart('forecastChart', {
    type: 'line',
    data: {
      labels: forecast.labels,
      datasets: [
        { label: 'Forecast Revenue',         data: forecast.revenue,    borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.12)',  fill: true, tension: .4, yAxisID: 'y'  },
        { label: 'Customers Doing Quests',   data: forecast.engagement, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.12)',  fill: true, tension: .4, yAxisID: 'y1' }
      ]
    },
    options: chartOptions({ dualAxis: true })
  });

  upsertChart('categoryMixChart', {
    type: 'doughnut',
    data: { labels: mix.labels, datasets: [{ data: mix.counts, backgroundColor: CATEGORY_COLORS, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } }, cutout: '64%' }
  });

  upsertChart('funnelChart', {
    type: 'bar',
    data: {
      labels: ['Targeted', 'Participating', 'Completed'],
      datasets: [{ label: 'Customers', data: [funnel.targeted, funnel.participating, funnel.completed], backgroundColor: ['#93c5fd', '#60a5fa', '#2563eb'], borderRadius: 14 }]
    },
    options: chartOptions({ horizontal: true })
  });

  upsertChart('scorecardChart', {
    type: 'radar',
    data: {
      labels: scorecard.labels,
      datasets: [{ label: 'KPI Score', data: scorecard.data, backgroundColor: 'rgba(37,99,235,.14)', borderColor: '#2563eb', pointBackgroundColor: '#2563eb' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: '#e2e8f0' }, pointLabels: { color: '#475569', font: { weight: '700' } } } } }
  });
}

function upsertChart(id, config) { if (charts[id]) charts[id].destroy(); charts[id] = new Chart(byId(id), config); }

// ── Transaction Quest Success Rates ───────────────────────────────────────────
function renderTransactionSuccess() {
  const d = txData;
  if (!d || !d.summary) return;

  const { summary, byQuest = [], bySegment = [], topCustomers = [] } = d;

  // Summary KPI chips
  const successColor = summary.avgSuccessRate >= 70 ? 'emerald' : summary.avgSuccessRate >= 50 ? 'amber' : 'red';
  byId('txSummaryKpis').innerHTML = [
    { label: 'Tx Quests',       value: summary.totalTransactionQuests,    color: 'blue'         },
    { label: 'Avg Success Rate', value: `${summary.avgSuccessRate}%`,      color: successColor   },
    { label: 'Participants',     value: compact(summary.totalParticipants), color: 'violet'       },
    { label: 'Target Pool',      value: compact(summary.totalTarget),       color: 'slate'        }
  ].map(k => `
    <div class="bg-${k.color}-50 border border-${k.color}-100 rounded-2xl px-4 py-2 text-center">
      <div class="text-lg font-extrabold text-${k.color}-700">${k.value}</div>
      <div class="text-[10px] font-bold text-${k.color}-500 uppercase tracking-wider">${k.label}</div>
    </div>`).join('');

  // Per-quest horizontal bar chart
  const BAR_COLORS = byQuest.map(q =>
    q.category === 'spending' ? 'rgba(245,158,11,0.75)' : 'rgba(99,102,241,0.75)'
  );
  upsertChart('txQuestChart', {
    type: 'bar',
    data: {
      labels: byQuest.map(q => q.title.length > 28 ? q.title.slice(0, 26) + '…' : q.title),
      datasets: [{
        label: 'Completion %',
        data:  byQuest.map(q => q.completion),
        backgroundColor: BAR_COLORS,
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const q = byQuest[ctx.dataIndex];
              return [
                ` Completion: ${q.completion}%`,
                ` Participants: ${compact(q.participants)}`,
                ` Segment: ${q.segment}`,
                ` Status: ${q.status}`
              ];
            }
          }
        }
      },
      scales: {
        x: { min: 0, max: 100, grid: { color: '#f1f5f9' }, ticks: { callback: v => `${v}%` } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });

  // Per-segment table
  const segRows = bySegment.map((s, i) => {
    const pct = s.questAvgCompletion;
    const bar = `<div class="w-full bg-slate-100 rounded-full h-2 mt-1"><div class="h-2 rounded-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}" style="width:${pct}%"></div></div>`;
    const custBadge = s.customerCount
      ? `<span class="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">${s.customerCount} customers</span>`
      : '';
    return `
      <div class="bg-slate-50 rounded-xl p-3">
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="text-xs font-bold text-slate-800 truncate">${s.segment}</span>
          <span class="text-sm font-extrabold ${pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600'}">${pct}%</span>
        </div>
        ${bar}
        <div class="flex items-center justify-between mt-2 gap-2">
          <span class="text-[10px] text-slate-500">${s.questCount} quest${s.questCount !== 1 ? 's' : ''} · ${compact(s.totalParticipants)} participants</span>
          ${custBadge}
        </div>
      </div>`;
  }).join('');
  byId('txSegmentTable').innerHTML = segRows || '<p class="text-sm text-slate-400">No segment data.</p>';

  // Top customers table
  const TIER_COLORS = { Diamond: 'text-blue-600 bg-blue-50', Platinum: 'text-purple-600 bg-purple-50', Gold: 'text-amber-600 bg-amber-50', Silver: 'text-slate-600 bg-slate-100' };
  byId('txTopCustomers').innerHTML = topCustomers.map((c, i) => {
    const tierStyle = TIER_COLORS[c.tier] || 'text-slate-600 bg-slate-100';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
    return `<tr class="hover:bg-slate-50 transition">
      <td class="p-3 font-extrabold text-slate-500">${medal}</td>
      <td class="p-3 font-bold text-slate-900">${c.name}</td>
      <td class="p-3 text-slate-500 text-xs">${c.segment}</td>
      <td class="p-3"><span class="px-2 py-1 rounded-full text-xs font-extrabold ${tierStyle}">${c.tier}</span></td>
      <td class="p-3">
        <div class="flex items-center gap-2">
          <div class="w-24 bg-slate-100 rounded-full h-2"><div class="h-2 rounded-full bg-emerald-500" style="width:${c.completion}%"></div></div>
          <span class="text-xs font-bold text-emerald-700">${c.completion}%</span>
        </div>
      </td>
      <td class="p-3 font-bold text-slate-700">${c.quests_done}</td>
      <td class="p-3 font-bold text-indigo-700">${compact(c.xp)} XP</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="p-4 text-sm text-slate-400 text-center">No customer data.</td></tr>';
}

function chartOptions({ dualAxis = false, horizontal = false } = {}) {
  const compact_ = v => compact(v);
  const stdScales = horizontal
    ? { x: { grid: { color: '#f1f5f9' }, ticks: { callback: compact_ } }, y: { grid: { display: false } } }
    : { x: { grid: { display: false } }, y: { grid: { color: '#f1f5f9' }, ticks: { callback: compact_ } } };
  return {
    indexAxis: horizontal ? 'y' : 'x',
    responsive: true, maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } } },
    scales: dualAxis
      ? { y: { type: 'linear', position: 'left',  grid: { color: '#f1f5f9' }, ticks: { callback: compact_ } }, y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: compact_ } }, x: { grid: { display: false } } }
      : stdScales
  };
}

// ── Shared table utils ────────────────────────────────────────────────────────
function sortRows(rows, state, valueGetter) {
  return [...rows].sort((a, b) => {
    const va = valueGetter(a, state.sortKey);
    const vb = valueGetter(b, state.sortKey);
    const result = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return state.sortDirection === 'asc' ? result : -result;
  });
}

function pageRows(rows, state) {
  const pageSize   = state.pageSize === 'all' ? rows.length || 1 : state.pageSize;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  state.page       = Math.min(Math.max(1, state.page), totalPages);
  const start      = (state.page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalPages, start, end: Math.min(start + pageSize, rows.length) };
}

function renderPagination(containerId, infoId, type, totalRows, pageData, renderFn) {
  const state = tableState[type];
  byId(infoId).textContent = totalRows ? `Showing ${pageData.start + 1}–${pageData.end} of ${totalRows} records` : 'No records found';
  const disabledPrev = state.page === 1               ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100';
  const disabledNext = state.page === pageData.totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100';
  byId(containerId).innerHTML = `
    <button class="table-page-btn px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm ${disabledPrev}" data-action="prev" ${state.page === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left mr-1"></i>Prev</button>
    <span class="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-extrabold text-slate-700">Page ${state.page} / ${pageData.totalPages}</span>
    <button class="table-page-btn px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold text-sm ${disabledNext}" data-action="next" ${state.page === pageData.totalPages ? 'disabled' : ''}>Next<i class="fas fa-chevron-right ml-1"></i></button>`;
  byId(containerId).querySelectorAll('.table-page-btn').forEach(btn => btn.addEventListener('click', () => {
    state.page += btn.dataset.action === 'next' ? 1 : -1;
    renderFn();
  }));
}

// ── Status badge ──────────────────────────────────────────────────────────────
function statusBadge(status) {
  const styles = { Draft: 'bg-slate-100 text-slate-700', Scheduled: 'bg-blue-100 text-blue-700', Live: 'bg-emerald-100 text-emerald-700', Paused: 'bg-amber-100 text-amber-700', Completed: 'bg-violet-100 text-violet-700' };
  return `<span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold ${styles[status] || styles.Draft}"><span class="status-dot bg-current"></span>${status}</span>`;
}

// ── Quest CRUD ────────────────────────────────────────────────────────────────
function openQuestDetails(id) {
  const q = allQuests.find(item => item.id === id);
  if (!q) return;
  const cat       = categories[q.category];
  const completed = q.target * q.completion / 100;
  const roi       = q.budget ? ((q.revenue - q.budget) / q.budget) * 100 : 0;
  showModal(q.title, cat.label, `
    <div class="space-y-5">
      <div class="flex flex-wrap gap-2">
        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold ${cat.bg} ${cat.text}"><i class="fas ${cat.icon}"></i>${cat.label}</span>
        ${statusBadge(q.status)}
        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700"><i class="fas fa-gift"></i>${q.xp} XP</span>
      </div>
      <p class="text-slate-600 leading-relaxed">${q.action}</p>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-2xl bg-slate-50 p-4"><div class="text-xs text-slate-400 font-bold uppercase">Target</div><div class="font-extrabold text-lg">${compact(q.target)}</div></div>
        <div class="rounded-2xl bg-slate-50 p-4"><div class="text-xs text-slate-400 font-bold uppercase">Doing</div><div class="font-extrabold text-lg">${compact(completed)}</div></div>
        <div class="rounded-2xl bg-slate-50 p-4"><div class="text-xs text-slate-400 font-bold uppercase">Revenue</div><div class="font-extrabold text-lg">${money(q.revenue)}</div></div>
        <div class="rounded-2xl bg-slate-50 p-4"><div class="text-xs text-slate-400 font-bold uppercase">ROI</div><div class="font-extrabold text-lg">${percent(roi)}</div></div>
      </div>
      <div class="rounded-2xl border border-slate-200 p-4">
        <div class="flex justify-between text-sm mb-2"><span class="font-bold text-slate-700">Completion forecast</span><span class="font-extrabold text-blue-700">${q.completion}%</span></div>
        <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${q.completion}%; background:${cat.color}"></div></div>
        <div class="text-xs text-slate-500 mt-3">${formatDate(q.start_date)} to ${formatDate(q.end_date)} • ${q.segment}</div>
      </div>
      <div class="flex justify-end gap-3">
        <button onclick="deleteQuest('${q.id}')" class="px-5 py-3 rounded-xl bg-red-50 text-red-700 font-bold">Delete</button>
        <button onclick="editQuest('${q.id}')"   class="px-5 py-3 rounded-xl bg-blue-600 text-white font-bold">Edit Quest</button>
      </div>
    </div>`);
}

function editQuest(id) {
  const q = allQuests.find(item => item.id === id);
  if (!q) return;
  byId('questId').value         = q.id;
  byId('questTitle').value      = q.title;
  byId('questCategory').value   = q.category;
  byId('questStatus').value     = q.status;
  byId('questStart').value      = q.start_date;
  byId('questEnd').value        = q.end_date;
  byId('questSegment').value    = q.segment;
  byId('questTarget').value     = q.target;
  byId('questCompletion').value = q.completion;
  byId('questXp').value         = q.xp;
  byId('questRevenue').value    = q.revenue;
  byId('questBudget').value     = q.budget;
  byId('questAction').value     = q.action;
  byId('saveButtonLabel').textContent = 'Update Quest';
  closeModal();
  openQuestForgeModal();
}

function deleteQuest(id) {
  const q = allQuests.find(item => item.id === id);
  if (!q) return;
  showModal('Delete quest?', q.title, `
    <p class="text-slate-600 mb-6">This removes the quest from the customer channel table, campaign calendar, and all dashboard analytics.</p>
    <div class="flex justify-end gap-3">
      <button onclick="closeModal()" class="px-5 py-3 rounded-xl bg-slate-100 font-bold text-slate-700">Cancel</button>
      <button onclick="confirmDelete('${id}')" class="px-5 py-3 rounded-xl bg-red-600 font-bold text-white">Delete</button>
    </div>`);
}

async function confirmDelete(id) {
  try {
    await apiFetch(`/api/quests/${id}`, { method: 'DELETE' });
    allQuests = allQuests.filter(item => item.id !== id);
    closeModal();
    await reloadAnalytics();
    renderAll();
    showToast('Quest deleted successfully.');
  } catch (err) {
    showToast(err.message || 'Failed to delete quest.', 'error');
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  hideFormError();

  const start = byId('questStart').value;
  const end   = byId('questEnd').value;
  if (start > end) { showFormError('Start date cannot be after end date.'); return; }

  const id      = byId('questId').value;
  const payload = {
    title:      byId('questTitle').value.trim(),
    category:   byId('questCategory').value,
    status:     byId('questStatus').value,
    start_date: start,
    end_date:   end,
    segment:    byId('questSegment').value,
    target:     Number(byId('questTarget').value),
    completion: Number(byId('questCompletion').value),
    xp:         Number(byId('questXp').value),
    revenue:    Number(byId('questRevenue').value),
    budget:     Number(byId('questBudget').value),
    action:     byId('questAction').value.trim()
  };

  const btn = byId('saveButtonLabel');
  const origLabel = btn.textContent;
  btn.textContent = 'Saving…';

  try {
    let saved;
    if (id) {
      saved = await apiFetch(`/api/quests/${id}`, { method: 'PUT',  body: JSON.stringify(payload) });
      const idx = allQuests.findIndex(q => q.id === id);
      if (idx >= 0) allQuests[idx] = saved; else allQuests.unshift(saved);
    } else {
      saved = await apiFetch('/api/quests', { method: 'POST', body: JSON.stringify(payload) });
      allQuests.unshift(saved);
    }
    await reloadAnalytics();
    renderAll();
    resetFormToDefault();
    closeQuestForgeModal();
    byId('questTable').scrollIntoView({ behavior: 'smooth' });
    showToast(id ? 'Quest updated.' : 'Quest created.');
  } catch (err) {
    showFormError(err.message || 'Failed to save quest.');
  } finally {
    btn.textContent = origLabel;
  }
}

async function reloadAnalytics() {
  try {
    const [kpis, charts_, txRes] = await Promise.all([
      apiFetch('/api/analytics/kpis'),
      apiFetch('/api/analytics/charts'),
      apiFetch('/api/analytics/transaction-success')
    ]);
    kpiData   = kpis   || {};
    chartData = charts_ || {};
    txData    = txRes  || {};
  } catch { /* fail silently – charts just won't update */ }
}

function showFormError(msg) {
  byId('formErrorText').textContent = msg;
  byId('formError').classList.remove('hidden');
  byId('formError').classList.add('flex');
}
function hideFormError() {
  byId('formError').classList.add('hidden');
  byId('formError').classList.remove('flex');
}

function resetFormToDefault() {
  byId('questForm').reset();
  byId('questId').value         = '';
  byId('questCategory').value   = 'casa';
  byId('questStatus').value     = 'Scheduled';
  byId('questSegment').value    = 'Mass Retail';
  byId('questStart').value      = '2026-05-01';
  byId('questEnd').value        = '2026-05-15';
  byId('questCompletion').value = 60;
  byId('questXp').value         = 500;
  byId('questTarget').value     = 25000;
  byId('questRevenue').value    = 100000;
  byId('questBudget').value     = 15000;
  byId('saveButtonLabel').textContent = 'Save Quest';
  hideFormError();
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function showModal(title, subtitle, body) {
  byId('modalTitle').textContent    = title;
  byId('modalSubtitle').textContent = subtitle;
  byId('modalBody').innerHTML       = body;
  byId('questModal').classList.remove('hidden');
  byId('questModal').classList.add('flex');
}
function closeModal() { byId('questModal').classList.add('hidden'); byId('questModal').classList.remove('flex'); }
function openQuestForgeModal()  { byId('questForgeModal').classList.remove('hidden'); byId('questForgeModal').classList.add('flex'); setTimeout(() => byId('questTitle').focus(), 50); }
function closeQuestForgeModal() { byId('questForgeModal').classList.add('hidden'); byId('questForgeModal').classList.remove('flex'); }

function scheduleOnDate(dateKey) { resetFormToDefault(); byId('questStart').value = dateKey; byId('questEnd').value = dateKey; openQuestForgeModal(); }

function openDayAgenda(dateKey) {
  const dayQuests = calendarFilteredQuests().filter(q => dateKey >= q.start_date && dateKey <= q.end_date);
  showModal(`Agenda for ${formatDate(dateKey)}`, `${dayQuests.length} quests scheduled`,
    `<div class="space-y-3">${dayQuests.map(q => {
      const cat = categories[q.category];
      return `<button onclick="openQuestDetails('${q.id}')" class="w-full text-left rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
        <div class="flex items-center justify-between"><span class="font-extrabold text-slate-900">${q.title}</span><span class="text-xs font-bold ${cat.bg} ${cat.text} px-2 py-1 rounded-full">${cat.short}</span></div>
        <div class="text-xs text-slate-500 mt-2">${formatDate(q.start_date)} to ${formatDate(q.end_date)} • ${q.status}</div>
      </button>`;
    }).join('')}</div>`);
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCsv() {
  const headers = ['Title', 'Category', 'Status', 'Start', 'End', 'Segment', 'Target Customers', 'Completion %', 'Forecast Revenue', 'Prize Budget', 'Action'];
  const body    = filteredQuests().map(q => [q.title, categories[q.category].label, q.status, q.start_date, q.end_date, q.segment, q.target, q.completion, q.revenue, q.budget, q.action]);
  const csv     = [headers, ...body].map(row => row.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url     = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a       = Object.assign(document.createElement('a'), { href: url, download: 'bankquest-quests.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Loyalty Engine ────────────────────────────────────────────────────────────
const TIER_STYLES = {
  Silver:   { bg: 'bg-slate-100',  text: 'text-slate-700',  border: 'border-slate-200',  icon: 'fa-circle',  bar: 'bg-slate-400'  },
  Gold:     { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-100',  icon: 'fa-star',    bar: 'bg-amber-400'  },
  Platinum: { bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-100', icon: 'fa-gem',     bar: 'bg-violet-500' },
  Diamond:  { bg: 'bg-cyan-50',    text: 'text-cyan-700',   border: 'border-cyan-100',   icon: 'fa-crown',   bar: 'bg-cyan-500'   }
};

const REWARD_TYPE_STYLES = {
  'Cashback':         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'fa-money-bill-wave'          },
  'Free Transaction': { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: 'fa-arrow-right-arrow-left'  },
  'Travel Miles':     { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: 'fa-plane'                   },
  'Gift Voucher':     { bg: 'bg-pink-50',    text: 'text-pink-700',    icon: 'fa-gift'                    },
  'Rate Discount':    { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: 'fa-percent'                 },
  'Prize Draw':       { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: 'fa-ticket'                  }
};

function renderLoyaltySection() {
  renderLoyaltyKpis();
  renderTierDistribution();
  renderTierConfig();
  renderRewards();
  renderBadges();
}

function renderLoyaltyKpis() {
  const s = loyaltySummary;
  const kpis = [
    { label: 'Enrolled Customers', value: (s.totalEnrolled ?? 0).toLocaleString(),       icon: 'fa-users',   color: 'violet', sub: 'in loyalty program'           },
    { label: 'Average XP',         value: (s.avgXp ?? 0).toLocaleString(),                icon: 'fa-bolt',    color: 'amber',  sub: 'across all customers'         },
    { label: 'Active Rewards',     value: s.activeRewards ?? 0,                           icon: 'fa-gift',    color: 'emerald',sub: `${s.totalBadges ?? 0} badge types defined` },
    { label: 'Badges Awarded',     value: (s.totalBadgesAwarded ?? 0).toLocaleString(),   icon: 'fa-medal',   color: 'blue',   sub: 'achievement milestones hit'   }
  ];
  byId('loyaltyKpiGrid').innerHTML = kpis.map(k => `
    <div class="bg-white border border-slate-200 rounded-3xl p-5 kpi-card">
      <div class="flex items-start justify-between mb-4">
        <div class="w-11 h-11 rounded-2xl bg-${k.color}-50 text-${k.color}-600 flex items-center justify-center"><i class="fas ${k.icon}"></i></div>
        <span class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Loyalty</span>
      </div>
      <div class="text-xs text-slate-500 font-bold">${k.label}</div>
      <div class="text-2xl font-extrabold text-slate-900 mt-1">${k.value}</div>
      <div class="text-xs text-slate-400 mt-1">${k.sub}</div>
    </div>`).join('');
}

function renderTierDistribution() {
  const breakdown = (loyaltySummary.tierBreakdown || []).slice().sort((a, b) => b.sort_order - a.sort_order);
  const total = breakdown.reduce((s, t) => s + t.count, 0) || 1;
  byId('tierDistribution').innerHTML = breakdown.map(t => {
    const style = TIER_STYLES[t.tier] || TIER_STYLES.Silver;
    const pct   = Math.round(t.count / total * 100);
    return `
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1 rounded-full ${style.bg} ${style.text}"><i class="fas ${style.icon} text-[10px]"></i>${t.tier}</span>
            <span class="text-xs text-slate-400 font-bold">${t.xp_min.toLocaleString()} – ${t.xp_max >= 999999 ? '∞' : t.xp_max.toLocaleString()} XP</span>
          </div>
          <span class="text-sm font-extrabold text-slate-700">${t.count} <span class="text-xs font-bold text-slate-400">(${pct}%)</span></span>
        </div>
        <div class="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
          <div class="h-full rounded-full transition-all ${style.bar}" style="width:${Math.max(pct, 3)}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderTierConfig() {
  const tiers = (loyaltySummary.tierBreakdown || []).slice().sort((a, b) => a.sort_order - b.sort_order);
  byId('tierConfigTable').innerHTML = tiers.map(t => {
    const style = TIER_STYLES[t.tier] || TIER_STYLES.Silver;
    return `
      <div class="flex items-center gap-4 rounded-2xl border ${style.border} ${style.bg} p-4">
        <div class="w-10 h-10 rounded-xl ${style.bg} ${style.text} flex items-center justify-center flex-shrink-0 border ${style.border}">
          <i class="fas ${style.icon}"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-extrabold ${style.text}">${t.tier}</span>
            <span class="text-xs font-bold text-slate-500">${t.xp_min.toLocaleString()} – ${t.xp_max >= 999999 ? '∞' : t.xp_max.toLocaleString()} XP</span>
          </div>
          <div class="text-xs text-slate-400 mt-0.5 truncate">${t.benefits || 'No benefits configured'}</div>
        </div>
        <button onclick="openTierModal('${t.tier}')" class="flex-shrink-0 w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs">
          <i class="fas fa-pen"></i>
        </button>
      </div>`;
  }).join('');
}

function renderRewards() {
  byId('rewardRows').innerHTML = allRewards.length ? allRewards.map(r => {
    const ts   = REWARD_TYPE_STYLES[r.type] || REWARD_TYPE_STYLES['Gift Voucher'];
    const stk  = r.stock === -1 ? '∞' : r.stock.toLocaleString();
    const stClass = r.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : r.status === 'Inactive' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    const valStr  = r.type === 'Rate Discount' ? `${r.value}%` : r.type === 'Travel Miles' ? `${r.value.toLocaleString()} mi` : r.value > 0 ? money(r.value) : '—';
    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-5"><div class="font-extrabold text-slate-900">${r.name}</div><div class="text-xs text-slate-400 mt-0.5 max-w-xs truncate">${r.description}</div></td>
        <td class="p-5"><span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold ${ts.bg} ${ts.text}"><i class="fas ${ts.icon}"></i>${r.type}</span></td>
        <td class="p-5 font-extrabold text-slate-800">${valStr}</td>
        <td class="p-5"><span class="font-extrabold text-blue-700">${r.xp_cost.toLocaleString()}</span> <span class="text-xs text-slate-400">XP</span></td>
        <td class="p-5 font-bold text-slate-700">${stk}</td>
        <td class="p-5"><span class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-extrabold ${stClass}"><span class="status-dot bg-current"></span>${r.status}</span></td>
        <td class="p-5 text-right">
          <button onclick="openRewardModal('${r.id}')" class="w-9 h-9 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700"><i class="fas fa-pen"></i></button>
          <button onclick="deleteReward('${r.id}')"    class="w-9 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-700"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
  }).join('') : '<tr><td colspan="7" class="p-10 text-center text-slate-500">No rewards in catalog. Add the first one.</td></tr>';
}

function renderBadges() {
  byId('badgeGrid').innerHTML = allBadges.length ? allBadges.map(b => `
    <div class="rounded-2xl border border-slate-200 p-5 hover:border-indigo-200 hover:shadow-sm transition">
      <div class="flex items-start justify-between gap-2">
        <div class="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg flex-shrink-0">
          <i class="fas ${b.icon || 'fa-medal'}"></i>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">+${b.xp_bonus} XP</span>
          <button onclick="deleteBadge('${b.id}')" class="w-8 h-8 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="mt-4">
        <h4 class="font-extrabold text-slate-900">${b.name}</h4>
        <p class="text-xs text-slate-500 mt-1">${b.description}</p>
        <div class="mt-3 flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold text-slate-400 truncate">${b.criteria}</span>
          <span class="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full flex-shrink-0">${b.award_count || 0} awarded</span>
        </div>
      </div>
    </div>`).join('')
  : '<div class="col-span-4 p-8 text-center text-slate-500">No badges defined yet. Create the first one.</div>';
}

// ── Loyalty CRUD ──────────────────────────────────────────────────────────────
function openRewardModal(id = null) {
  const r = id ? allRewards.find(r => r.id === id) : null;
  byId('rewardModalTitle').textContent = r ? 'Edit Reward' : 'New Reward';
  byId('rewardSaveLabel').textContent  = r ? 'Update Reward' : 'Save Reward';
  byId('rewardId').value          = r?.id           ?? '';
  byId('rewardName').value        = r?.name         ?? '';
  byId('rewardDescription').value = r?.description  ?? '';
  byId('rewardType').value        = r?.type         ?? 'Cashback';
  byId('rewardStatus').value      = r?.status       ?? 'Active';
  byId('rewardValue').value       = r?.value        ?? 0;
  byId('rewardXpCost').value      = r?.xp_cost      ?? 500;
  byId('rewardStock').value       = r?.stock        ?? -1;
  byId('rewardFormError').classList.add('hidden');
  byId('rewardFormError').classList.remove('flex');
  byId('rewardModal').classList.remove('hidden');
  byId('rewardModal').classList.add('flex');
}
function closeRewardModal() { byId('rewardModal').classList.add('hidden'); byId('rewardModal').classList.remove('flex'); }

async function handleRewardSubmit(e) {
  e.preventDefault();
  const id = byId('rewardId').value;
  const payload = {
    name:        byId('rewardName').value.trim(),
    description: byId('rewardDescription').value.trim(),
    type:        byId('rewardType').value,
    status:      byId('rewardStatus').value,
    value:       Number(byId('rewardValue').value),
    xp_cost:     Number(byId('rewardXpCost').value),
    stock:       Number(byId('rewardStock').value)
  };
  try {
    let saved;
    if (id) {
      saved = await apiFetch(`/api/loyalty/rewards/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      const idx = allRewards.findIndex(r => r.id === id);
      if (idx >= 0) allRewards[idx] = saved; else allRewards.unshift(saved);
    } else {
      saved = await apiFetch('/api/loyalty/rewards', { method: 'POST', body: JSON.stringify(payload) });
      allRewards.unshift(saved);
    }
    loyaltySummary.activeRewards = allRewards.filter(r => r.status === 'Active').length;
    closeRewardModal();
    renderRewards();
    renderLoyaltyKpis();
    showToast(id ? 'Reward updated.' : 'Reward created.');
  } catch (err) {
    byId('rewardFormErrorText').textContent = err.message || 'Failed to save.';
    byId('rewardFormError').classList.remove('hidden');
    byId('rewardFormError').classList.add('flex');
  }
}

async function deleteReward(id) {
  const r = allRewards.find(r => r.id === id);
  if (!r || !confirm(`Delete reward "${r.name}"?`)) return;
  try {
    await apiFetch(`/api/loyalty/rewards/${id}`, { method: 'DELETE' });
    allRewards = allRewards.filter(r => r.id !== id);
    loyaltySummary.activeRewards = allRewards.filter(r => r.status === 'Active').length;
    renderRewards();
    renderLoyaltyKpis();
    showToast('Reward deleted.');
  } catch (err) { showToast(err.message || 'Failed to delete reward.', 'error'); }
}

function openTierModal(tierName) {
  const t = (loyaltySummary.tierBreakdown || []).find(t => t.tier === tierName);
  if (!t) return;
  byId('tierModalTitle').textContent = `Edit ${tierName} Tier`;
  byId('tierName').value             = tierName;
  byId('tierXpMin').value            = t.xp_min;
  byId('tierXpMax').value            = t.xp_max >= 999999 ? '' : t.xp_max;
  byId('tierBenefits').value         = t.benefits || '';
  byId('tierModal').classList.remove('hidden');
  byId('tierModal').classList.add('flex');
}
function closeTierModal() { byId('tierModal').classList.add('hidden'); byId('tierModal').classList.remove('flex'); }

async function handleTierSubmit(e) {
  e.preventDefault();
  const tierName = byId('tierName').value;
  const payload  = {
    xp_min:   Number(byId('tierXpMin').value) || 0,
    xp_max:   Number(byId('tierXpMax').value) || 999999,
    benefits: byId('tierBenefits').value.trim()
  };
  try {
    const updated = await apiFetch(`/api/loyalty/tiers/${tierName}`, { method: 'PUT', body: JSON.stringify(payload) });
    const idx = (loyaltySummary.tierBreakdown || []).findIndex(t => t.tier === tierName);
    if (idx >= 0) loyaltySummary.tierBreakdown[idx] = { ...loyaltySummary.tierBreakdown[idx], ...updated };
    closeTierModal();
    renderTierDistribution();
    renderTierConfig();
    showToast(`${tierName} tier updated.`);
  } catch (err) { showToast(err.message || 'Failed to update tier.', 'error'); }
}

function openBadgeModal() {
  byId('badgeForm').reset();
  byId('badgeIcon').value = 'fa-medal';
  byId('badgeModal').classList.remove('hidden');
  byId('badgeModal').classList.add('flex');
}
function closeBadgeModal() { byId('badgeModal').classList.add('hidden'); byId('badgeModal').classList.remove('flex'); }

async function handleBadgeSubmit(e) {
  e.preventDefault();
  const payload = {
    name:        byId('badgeName').value.trim(),
    description: byId('badgeDescription').value.trim(),
    icon:        byId('badgeIcon').value.trim() || 'fa-medal',
    xp_bonus:    Number(byId('badgeXpBonus').value) || 0,
    criteria:    byId('badgeCriteria').value.trim()
  };
  try {
    const saved = await apiFetch('/api/loyalty/badges', { method: 'POST', body: JSON.stringify(payload) });
    saved.award_count = 0;
    allBadges.push(saved);
    loyaltySummary.totalBadges = allBadges.length;
    closeBadgeModal();
    renderBadges();
    renderLoyaltyKpis();
    showToast('Badge created.');
  } catch (err) { showToast(err.message || 'Failed to create badge.', 'error'); }
}

async function deleteBadge(id) {
  const b = allBadges.find(b => b.id === id);
  if (!b || !confirm(`Delete badge "${b.name}"? This removes all awards for this badge.`)) return;
  try {
    await apiFetch(`/api/loyalty/badges/${id}`, { method: 'DELETE' });
    allBadges = allBadges.filter(b => b.id !== id);
    loyaltySummary.totalBadges = allBadges.length;
    renderBadges();
    renderLoyaltyKpis();
    showToast('Badge deleted.');
  } catch (err) { showToast(err.message || 'Failed to delete badge.', 'error'); }
}

/**
 * Evaluate all badge rules against all customers and award any new achievements.
 * Shows a toast with a summary of newly awarded badges.
 */
async function evaluateAchievements() {
  const btn = document.getElementById('btnEvaluate');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Evaluating…'; }
  try {
    const result = await apiFetch('/api/loyalty/achievements/evaluate', { method: 'POST' });
    const msg = result.newAwards === 0
      ? `Evaluated ${result.evaluated} customers – all badges already up to date.`
      : `Awarded ${result.newAwards} new badge${result.newAwards !== 1 ? 's' : ''} across ${result.evaluated} customers!`;
    showToast(msg, result.newAwards > 0 ? 'success' : 'info');
    // Refresh badge award counts
    const badgeData = await apiFetch('/api/loyalty/badges');
    allBadges = badgeData.data;
    loyaltySummary.totalBadgesAwarded = (loyaltySummary.totalBadgesAwarded || 0) + result.newAwards;
    renderBadges();
    renderLoyaltyKpis();
  } catch (err) {
    showToast(err.message || 'Failed to evaluate achievements.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-bolt mr-2"></i> Evaluate All'; }
  }
}

// ── Populate dropdowns ────────────────────────────────────────────────────────
function populateSelects() {
  const categoryOptions = Object.entries(categories).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
  byId('questCategory').innerHTML         = categoryOptions;
  byId('categoryFilter').innerHTML        = `<option value="all">All categories</option>${categoryOptions}`;
  byId('calendarCategoryFilter').innerHTML = `<option value="all">All calendar categories</option>${categoryOptions}`;

  const segments = ['Mass Retail', 'Salary Customers', 'Youth & Students', 'Affluent', 'Credit Card Holders', 'Dormant Customers'];
  const tiers    = ['Diamond', 'Platinum', 'Gold', 'Silver'];
  byId('customerSegmentFilter').innerHTML = `<option value="all">All segments</option>${segments.map(s => `<option>${s}</option>`).join('')}`;
  byId('customerTierFilter').innerHTML    = `<option value="all">All prize tiers</option>${tiers.map(t => `<option>${t}</option>`).join('')}`;
}

// ── Event bindings ────────────────────────────────────────────────────────────
function bindEvents() {
  byId('questForm').addEventListener('submit', handleSubmit);
  byId('resetForm').addEventListener('click',  resetFormToDefault);

  byId('searchInput').addEventListener('input',   () => { tableState.quests.page = 1; renderTable(); });
  byId('categoryFilter').addEventListener('change', () => { tableState.quests.page = 1; renderTable(); });
  byId('questStatusFilter').addEventListener('change', () => { tableState.quests.page = 1; renderTable(); });
  byId('questRowsPerPage').addEventListener('change', e => { tableState.quests.pageSize = e.target.value === 'all' ? 'all' : Number(e.target.value); tableState.quests.page = 1; renderTable(); });
  document.querySelectorAll('.quest-sort').forEach(btn => btn.addEventListener('click', () => { const dir = tableState.quests.sortKey === btn.dataset.sort && tableState.quests.sortDirection === 'asc' ? 'desc' : 'asc'; tableState.quests.sortKey = btn.dataset.sort; tableState.quests.sortDirection = dir; tableState.quests.page = 1; renderTable(); }));

  byId('customerSearchInput').addEventListener('input',   () => { tableState.customers.page = 1; renderCustomerRanking(); });
  byId('customerSegmentFilter').addEventListener('change', () => { tableState.customers.page = 1; renderCustomerRanking(); });
  byId('customerTierFilter').addEventListener('change',   () => { tableState.customers.page = 1; renderCustomerRanking(); });
  byId('customerRowsPerPage').addEventListener('change', e => { tableState.customers.pageSize = e.target.value === 'all' ? 'all' : Number(e.target.value); tableState.customers.page = 1; renderCustomerRanking(); });
  document.querySelectorAll('.customer-sort').forEach(btn => btn.addEventListener('click', () => { const dir = tableState.customers.sortKey === btn.dataset.sort && tableState.customers.sortDirection === 'asc' ? 'desc' : 'asc'; tableState.customers.sortKey = btn.dataset.sort; tableState.customers.sortDirection = dir; tableState.customers.page = 1; renderCustomerRanking(); }));

  byId('prevMonth').addEventListener('click', () => { if (calendarView === 'year') calendarDate.setFullYear(calendarDate.getFullYear() - 1); else if (calendarView === 'week') calendarDate.setDate(calendarDate.getDate() - 7); else calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
  byId('nextMonth').addEventListener('click', () => { if (calendarView === 'year') calendarDate.setFullYear(calendarDate.getFullYear() + 1); else if (calendarView === 'week') calendarDate.setDate(calendarDate.getDate() + 7); else calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
  byId('todayButton').addEventListener('click', () => { calendarDate = new Date(); renderCalendar(); });
  byId('calendarCategoryFilter').addEventListener('change', renderCalendar);
  byId('calendarStatusFilter').addEventListener('change',   renderCalendar);
  document.querySelectorAll('.calendar-view-btn').forEach(btn => btn.addEventListener('click', () => { calendarView = btn.dataset.view; renderCalendar(); }));
  document.querySelectorAll('.year-sub-btn').forEach(btn => btn.addEventListener('click', () => { yearSubView = btn.dataset.sub; renderCalendar(); }));
  byId('yearGroupBy').addEventListener('change',    e => { yearGroupBy = e.target.value; renderCalendar(); });
  byId('yearShowFilter').addEventListener('change', renderCalendar);

  byId('openQuestForgeInline').addEventListener('click', openQuestForgeModal);
  byId('closeQuestForge').addEventListener('click',      closeQuestForgeModal);
  byId('questForgeModal').addEventListener('click', e => { if (e.target.id === 'questForgeModal') closeQuestForgeModal(); });

  byId('reloadData').addEventListener('click', loadAll);
  byId('exportButton').addEventListener('click', exportCsv);
  byId('closeModal').addEventListener('click', closeModal);
  byId('questModal').addEventListener('click', e => { if (e.target.id === 'questModal') closeModal(); });

  byId('logoutBtn').addEventListener('click', async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('gaq_token');
    localStorage.removeItem('gaq_user');
    window.location.replace('/login.html');
  });

  // Loyalty modal bindings
  byId('rewardForm').addEventListener('submit', handleRewardSubmit);
  byId('closeRewardModal').addEventListener('click', closeRewardModal);
  byId('rewardModal').addEventListener('click', e => { if (e.target.id === 'rewardModal') closeRewardModal(); });

  byId('badgeForm').addEventListener('submit', handleBadgeSubmit);
  byId('closeBadgeModal').addEventListener('click', closeBadgeModal);
  byId('badgeModal').addEventListener('click', e => { if (e.target.id === 'badgeModal') closeBadgeModal(); });

  byId('tierForm').addEventListener('submit', handleTierSubmit);
  byId('closeTierModal').addEventListener('click', closeTierModal);
  byId('tierModal').addEventListener('click', e => { if (e.target.id === 'tierModal') closeTierModal(); });
}

// ── Expose to inline onclick handlers ────────────────────────────────────────
window.editQuest        = editQuest;
window.deleteQuest      = deleteQuest;
window.confirmDelete    = confirmDelete;
window.openQuestDetails = openQuestDetails;
window.closeModal       = closeModal;
window.openQuestForgeModal  = openQuestForgeModal;
window.closeQuestForgeModal = closeQuestForgeModal;
window.scheduleOnDate   = scheduleOnDate;
window.openDayAgenda    = openDayAgenda;

// Expose loyalty globals for inline onclick handlers
window.openRewardModal = openRewardModal;
window.deleteReward    = deleteReward;
window.openTierModal   = openTierModal;
window.openBadgeModal        = openBadgeModal;
window.deleteBadge           = deleteBadge;
window.evaluateAchievements  = evaluateAchievements;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
populateSelects();
bindEvents();
resetFormToDefault();
loadAll();
