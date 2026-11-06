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

/** Card colours: paper and ink. Shared by the canvas card and the server's link preview. */
export const CARD_THEMES = {
  blue: ['#2338e8', '#ffd9e6'], pink: ['#ff4f8b', '#3a0619'], black: ['#121014', '#f2eee6'], yellow: ['#ffd23f', '#2e1a05'],
  green: ['#a8f0c6', '#0b3b2b'], purple: ['#c8b6ff', '#2b0e52'], orange: ['#ff5a1f', '#2a0e00'], teal: ['#0d5c63', '#bdf5ee'], white: ['#f3f1ec', '#17151a'],
};
export const cardColours = (m) => CARD_THEMES[m.th] || (m.m === 'p' ? CARD_THEMES.pink : CARD_THEMES.blue);

/** Every tile a card can carry, by mode, in the order offered. */
export const TILE_KEYS = {
  w: ['h', 'c', 's', 'ws', 'pn', 'tt', 'b', 'r', 'd', 'cs', 'co', 'to', 'tr', 'fr', 'rc'],
  p: ['e', 'h', 'cat', 'pn', 'fw', 'tr', 'bd', 'ls', 'to'],
};
const N_KEYS = {
  w: ['h', 'c', 's', 'wh', 'b', 'r', 'd', 'pc', 'tc', 'cs', 'co', 'to', 'tr', 'fr', 'rc'],
  p: ['e', 'h', 'cc', 'ls', 'fw', 'tw', 'tr', 'bd', 'pc', 'to'],
};

/** Reduce stats to a card model. Names and titles are dropped when hideNames is set. */
export function cardModel(s, { hideNames = true, who = '', locale = 'en', tiles = null, theme = null } = {}) {
  const work = s.mode === 'work';
  const n = work ? {
    h: Math.round(s.totalHours), c: s.meetings, s: s.shareOfWork, ws: s.worstWeek ? iso(s.worstWeek.start) : '', wh: s.worstWeek ? Math.round(s.worstWeek.hours) : 0,
    b: s.backToBack, r: s.recurringShare, d: s.avgPerWorkingDay,
    to: s.timeOff?.taken || 0, tr: s.travel?.trips || 0, fr: s.longestFreeStreak?.length || 0, rc: Math.round(s.reclaim?.totalHours || 0),
  } : {
    e: s.events, h: Math.round(s.totalHours), cat: s.categories[0]?.key || '', cc: s.categories[0]?.count || 0,
    ls: s.longestBusyStreak.length, fw: s.freeWeekends, tw: s.totalWeekends, tr: s.travel.trips, bd: s.birthdays, to: s.timeOff?.taken || 0,
  };
  if (work && s.mix) { n.cs = s.mix.customerShare; n.co = s.mix.companies; }
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
  const keys = cleanKeys(tiles, model.m);
  if (keys.length) model.k = keys;
  if (theme && CARD_THEMES[theme]) model.th = theme;
  return model;
}
const cleanKeys = (k, m) => (Array.isArray(k) ? [...new Set(k.filter((x) => TILE_KEYS[m].includes(x)))].slice(0, 6) : []);

/** Validate a model that arrived in a URL. Returns null when it isn't one of ours. */
export function sanitizeModel(x) {
  if (!x || x.v !== 2 || !['w', 'p'].includes(x.m)) return null;
  const y = Number(x.y);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return null;
  if (!Array.isArray(x.mo) || x.mo.length !== 12 || typeof x.n !== 'object' || !x.n) return null;
  const n = {};
  for (const k of N_KEYS[x.m]) if (x.n[k] != null) n[k] = num(x.n[k], k === 's' || k === 'r' || k === 'cs' ? 100 : 1e6);
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
  const k = cleanKeys(x.k, x.m);
  if (k.length) out.k = k;
  if (typeof x.th === 'string' && CARD_THEMES[x.th]) out.th = x.th;
  return out;
}

export const modelPersona = (m) => personaCopy(m.p, m.pp);

/** One tile: [value, label], or null when the card has nothing for it. */
function tile(m, key) {
  const n = m.n;
  if (m.m === 'w') {
    switch (key) {
      case 'h': return [fmt.int(n.h), t('hours in meetings')];
      case 'c': return [fmt.int(n.c), t('meetings')];
      case 's': return [`${fmt.int(n.s)}%`, t('of working time')];
      case 'ws': return n.ws ? [fmt.weekRange(new Date(`${n.ws}T00:00:00`)), t('worst week, {h} hrs', { h: fmt.int(n.wh) })] : null;
      case 'pn': return n.pn ? [n.pn, t('most seen, {n} times', { n: fmt.int(n.pc) })] : null;
      case 'tt': return n.tt ? [`“${n.tt}”`, t('most common title, {n} times', { n: fmt.int(n.tc) })] : null;
      case 'b': return [fmt.int(n.b), t('back-to-back meetings')];
      case 'r': return [`${fmt.int(n.r)}%`, t('of meeting time on repeat')];
      case 'd': return n.d ? [fmt.num(n.d), t('meetings a day')] : null;
      case 'cs': return n.cs != null ? [`${fmt.int(n.cs)}%`, t('of meeting time with customers')] : null;
      case 'co': return n.co ? [fmt.int(n.co), t('companies met')] : null;
      case 'to': return n.to ? [fmt.int(n.to), t('days off')] : null;
      case 'tr': return n.tr ? [fmt.int(n.tr), t('trips away')] : null;
      case 'fr': return n.fr ? [fmt.int(n.fr), t('days in a row without a meeting')] : null;
      case 'rc': return n.rc ? [fmt.int(n.rc), t('hours to win back next year')] : null;
      default: return null;
    }
  }
  switch (key) {
    case 'e': return [fmt.int(n.e), t('plans in the diary')];
    case 'h': return [fmt.int(n.h), t('hours of planned life')];
    case 'cat': return n.cat ? [categoryLabel(n.cat), t('top category, {n} times', { n: fmt.int(n.cc) })] : null;
    case 'pn': return n.pn ? [n.pn, t('most seen, {n} times', { n: fmt.int(n.pc) })] : null;
    case 'ls': return [tn('{n} day', '{n} days', n.ls), t('longest run with plans')];
    case 'fw': return [t('{a} of {b}', { a: fmt.int(n.fw), b: fmt.int(n.tw) }), t('weekends with nothing planned')];
    case 'tr': return n.tr ? [fmt.int(n.tr), t('trips away')] : null;
    case 'bd': return [fmt.int(n.bd), t('birthdays remembered')];
    case 'to': return n.to ? [fmt.int(n.to), t('days off')] : null;
    default: return null;
  }
}

/** The tiles a card would show by default, in order. */
export function defaultTiles(m) {
  const n = m.n;
  return m.m === 'w'
    ? ['h', 'c', 's', n.ws ? 'ws' : 'b', n.pn ? 'pn' : 'b', n.tt ? 'tt' : 'r']
    : ['e', 'h', 'cat', n.pn ? 'pn' : 'ls', 'fw', n.tr ? 'tr' : 'bd'];
}
/** Tiles this card has something for, in the order offered. */
export const availableTiles = (m) => TILE_KEYS[m.m].filter((k) => tile(m, k));

/** Which tiles a card shows, in order: the ones chosen, or else the defaults, six at most. */
export function cardTileKeys(m) {
  const chosen = (m.k || []).filter((k) => tile(m, k));
  if (chosen.length) return chosen.slice(0, 6);
  const out = [];
  for (const k of [...defaultTiles(m), ...TILE_KEYS[m.m]]) {
    if (out.length >= 6) break;
    if (!out.includes(k) && tile(m, k)) out.push(k);
  }
  return out;
}
/** The six tiles on a card, worded in the current language. */
export const cardTiles = (m) => cardTileKeys(m).map((k) => tile(m, k));
export const tileFor = tile;

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
