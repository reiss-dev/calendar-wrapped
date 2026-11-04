// The card model: the few numbers a share card needs, with no wording baked in.
// Links carry this, so a card renders in the viewer's language and two cards can be compared.
import { t, tn } from './i18n.js';
import { fmt } from './ui.js';
import { personaCopy, categoryLabel } from './copy.js';

const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, n);
const num = (v, max = 1e6) => { const x = Number(v); return Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x * 10) / 10)) : 0; };
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const CATS = ['fitness', 'food', 'birthday', 'health', 'travel', 'family', 'culture', 'home'];
const LOCALE_CODES = ['en', 'nl', 'sv', 'nb', 'da'];

/** Reduce stats to a card model. Names and titles are dropped when hideNames is set. */
export function cardModel(s, { hideNames = true, who = '', locale = 'en' } = {}) {
  const work = s.mode === 'work';
  const n = work ? {
    h: Math.round(s.totalHours), c: s.meetings, s: s.shareOfWork, ws: s.worstWeek ? iso(s.worstWeek.start) : '', wh: s.worstWeek ? Math.round(s.worstWeek.hours) : 0,
    b: s.backToBack, r: s.recurringShare, d: s.avgPerWorkingDay,
  } : {
    e: s.events, h: Math.round(s.totalHours), cat: s.categories[0]?.key || '', cc: s.categories[0]?.count || 0,
    ls: s.longestBusyStreak.length, fw: s.freeWeekends, tw: s.totalWeekends, tr: s.travel.trips, bd: s.birthdays,
  };
  if (!hideNames) {
    const top = work ? s.collaborators[0] : s.people[0];
    if (top) { n.pn = clip(work ? top.name.split(' ')[0] : top.name, 24); n.pc = top.count; }
    if (work && s.topTitles[0]) { n.tt = clip(s.topTitles[0].key, 26); n.tc = s.topTitles[0].count; }
  }
  const max = Math.max(1, ...s.monthly.map((m) => m.value));
  const model = {
    v: 2, m: work ? 'w' : 'p', y: s.year, l: locale,
    p: s.persona.id || 'balanced', pp: s.persona.params || {},
    n,
    mo: s.monthly.map((m) => Math.round((m.value / max) * 100)),
    hi: Math.max(0, s.monthly.findIndex((m) => s.busiestMonth && m.month === s.busiestMonth.month)),
  };
  if (who) model.w = clip(who, 20);
  return model;
}

/** Validate a model that arrived in a URL. Returns null when it isn't one of ours. */
export function sanitizeModel(x) {
  if (!x || x.v !== 2 || !['w', 'p'].includes(x.m)) return null;
  const y = Number(x.y);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;
  if (!Array.isArray(x.mo) || x.mo.length !== 12 || typeof x.n !== 'object' || !x.n) return null;
  const n = {};
  const keys = x.m === 'w' ? ['h', 'c', 's', 'wh', 'b', 'r', 'd', 'pc', 'tc'] : ['e', 'h', 'cc', 'ls', 'fw', 'tw', 'tr', 'bd', 'pc'];
  for (const k of keys) if (x.n[k] != null) n[k] = num(x.n[k], k === 's' || k === 'r' ? 100 : 1e6);
  if (x.m === 'w' && /^\d{4}-\d{2}-\d{2}$/.test(x.n.ws || '')) n.ws = x.n.ws;
  if (x.m === 'p' && CATS.includes(x.n.cat)) n.cat = x.n.cat;
  if (x.n.pn) n.pn = clip(x.n.pn, 24);
  if (x.m === 'w' && x.n.tt) n.tt = clip(x.n.tt, 26);
  const pp = {};
  for (const [k, v] of Object.entries(x.pp || {}).slice(0, 4)) if (/^[a-z]{1,3}$/.test(k)) pp[k] = num(v);
  const out = {
    v: 2, m: x.m, y, l: LOCALE_CODES.includes(x.l) ? x.l : 'en',
    p: /^[a-z]{2,16}$/.test(x.p) ? x.p : 'balanced', pp, n,
    mo: x.mo.map((v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))),
    hi: Math.max(0, Math.min(11, Math.round(Number(x.hi) || 0))),
  };
  if (x.w) out.w = clip(x.w, 20);
  return out;
}

export const modelPersona = (m) => personaCopy(m.p, m.pp);

/** The six tiles on a card, worded in the current language. */
export function cardTiles(m) {
  const n = m.n;
  if (m.m === 'w') {
    return [
      [fmt.int(n.h), t('hours in meetings')],
      [fmt.int(n.c), t('meetings')],
      [`${fmt.int(n.s)}%`, t('of working time')],
      n.ws ? [fmt.weekRange(new Date(`${n.ws}T00:00:00`)), t('worst week, {h} hrs', { h: fmt.int(n.wh) })] : ['—', t('worst week')],
      n.pn ? [n.pn, t('most seen, {n} times', { n: fmt.int(n.pc) })] : [fmt.int(n.b), t('back-to-back meetings')],
      n.tt ? [`“${n.tt}”`, t('most common title, {n} times', { n: fmt.int(n.tc) })] : [`${fmt.int(n.r)}%`, t('of meeting time on repeat')],
    ];
  }
  return [
    [fmt.int(n.e), t('plans in the diary')],
    [fmt.int(n.h), t('hours of planned life')],
    n.cat ? [categoryLabel(n.cat), t('top category, {n} times', { n: fmt.int(n.cc) })] : ['—', t('top category')],
    n.pn ? [n.pn, t('most seen, {n} times', { n: fmt.int(n.pc) })] : [tn('{n} day', '{n} days', n.ls), t('longest run with plans')],
    [t('{a} of {b}', { a: fmt.int(n.fw), b: fmt.int(n.tw) }), t('weekends with nothing planned')],
    n.tr ? [fmt.int(n.tr), t('trips away')] : [fmt.int(n.bd), t('birthdays remembered')],
  ];
}

/** Side-by-side rows for two cards of the same kind. "More" isn't better, it's just more. */
export function comparison(me, them) {
  if (!me || !them || me.m !== them.m) return null;
  const rows = me.m === 'w'
    ? [['h', t('hours in meetings')], ['c', t('meetings')], ['s', t('of working time'), '%'], ['b', t('back-to-back meetings')]]
    : [['e', t('plans in the diary')], ['h', t('hours of planned life')], ['tr', t('trips away')], ['fw', t('weekends with nothing planned')]];
  const out = rows.map(([k, label, unit = '']) => {
    const a = me.n[k] || 0, b = them.n[k] || 0;
    return { key: k, label, mine: `${fmt.int(a)}${unit}`, theirs: `${fmt.int(b)}${unit}`, a, b, more: a === b ? 'tie' : a > b ? 'me' : 'them' };
  });
  const lead = out[0];
  const ratio = lead.b ? lead.a / lead.b : 0;
  return { rows: out, more: lead.more, ratio: Math.round(ratio * 10) / 10 };
}
