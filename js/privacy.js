// What a shared output may show. Three levels for work calendars:
//   'all'        names and titles as they are
//   'colleagues' colleagues' names stay; customers, their people and their company names are hidden
//   'none'       no names and no meeting titles at all
// Personal calendars use 'all' or 'none'. The story you watch yourself always shows everything;
// cards, links, slide images, the video and the carousel go through here first.
import { t } from './i18n.js';

export const LEVELS = ['none', 'colleagues', 'all'];
export const REDACTED = '•••';
const STOP = new Set(['the', 'and', 'for', 'group', 'global', 'digital', 'tech', 'data', 'cloud', 'labs', 'bank', 'mail', 'team', 'services', 'solutions', 'systems', 'international', 'online', 'consulting', 'partners', 'holdings', 'company', 'customer', 'client', 'meeting', 'call', 'sync', 'review', 'demo']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const levelOf = (s, level) => {
  if (!LEVELS.includes(level)) return 'none';
  if (s?.mode !== 'work' && level === 'colleagues') return 'none';
  if (level === 'colleagues' && !s?.mix) return 'none'; // no way to tell customers apart, so hide everyone
  return level;
};

/** The words to hide at a level: company names, outside people, and whatever the person added. */
export function hiddenTerms(s, level, extra = []) {
  level = levelOf(s, level);
  if (level === 'all') return extra.filter((w) => w.length >= 2);
  const terms = new Set(extra.filter((w) => w.length >= 2));
  const add = (x) => { x = String(x || '').trim(); if (x.length >= 2) terms.add(x); };
  const mix = s.mix;
  if (mix) {
    for (const c of mix.customers || []) {
      add(c.name);
      add(c.name.replace(/\s+/g, ''));
      const first = c.name.split(/\s+/)[0];
      if (first.length >= 4 && !STOP.has(first.toLowerCase())) add(first);
    }
  }
  // First and last names of outside people, unless a colleague shares them.
  const inside = new Set((level === 'none' ? [] : (s.colleagues || s.collaborators || []).filter((p) => !p.ext)).flatMap((p) => p.name.toLowerCase().split(/\s+/)));
  const outside = [...(mix?.externalNames || []), ...(s.collaborators || []).filter((p) => p.ext || level === 'none').map((p) => p.name)];
  if (level === 'none') for (const p of s.people || []) outside.push(p.name);
  for (const name of outside) {
    add(name);
    for (const part of name.split(/\s+/)) if (part.length >= 3 && !inside.has(part.toLowerCase())) add(part);
  }
  return [...terms];
}

/** A function that blanks the hidden words out of any text. */
export function makeMasker(s, level, extra = []) {
  const terms = hiddenTerms(s, level, extra).sort((a, b) => b.length - a.length);
  if (!terms.length) return (x) => x;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(?:${terms.map(escapeRe).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'giu');
  return (x) => (typeof x === 'string' ? x.replace(re, (m, pre) => `${pre}${REDACTED}`) : x);
}

const letter = (i) => String.fromCharCode(65 + (i % 26));

/** A copy of the stats that is safe to share at this level. */
export function maskStats(s, level, extra = []) {
  if (!s) return s;
  level = levelOf(s, level);
  if (level === 'all' && !extra.length) return s;
  const mask = makeMasker(s, level, extra);
  const none = level === 'none';
  const out = { ...s, shareLevel: level };
  const title = (x) => (none ? '' : mask(x));
  if (s.mode === 'work') {
    out.collaborators = none ? [] : level === 'colleagues' ? (s.colleagues || s.collaborators.filter((p) => !p.ext)) : s.collaborators;
    out.topTitles = none ? [] : s.topTitles.map((x) => ({ ...x, key: mask(x.key) }));
    out.recurringSeries = s.recurringSeries.map((x) => ({ ...x, title: title(x.title), organizer: null }));
    for (const k of ['earliest', 'latest', 'longest']) if (s[k]) out[k] = { ...s[k], title: title(s[k].title) };
    // Places can name a customer's office, so they follow the same rules as names.
    if (s.where) out.where = { ...s.where, places: none ? [] : s.where.places.filter((p) => level === 'all' || !p.customer).map((p) => ({ ...p, name: mask(p.name) })) };
    if (s.mix) {
      out.mix = { ...s.mix, externalNames: [], groups: [],
        customers: level === 'all' ? s.mix.customers.map((c) => ({ ...c, name: mask(c.name) })) : s.mix.customers.map((c, i) => ({ ...c, name: t('Customer {x}', { x: letter(i) }), domain: '' })) };
    }
  } else {
    out.people = none ? [] : s.people;
    if (s.recurringSeries) out.recurringSeries = s.recurringSeries.map((x) => ({ ...x, title: title(x.title) }));
    for (const k of ['earliest', 'latest']) if (s[k]) out[k] = { ...s[k], title: title(s[k].title) };
  }
  if (none && s.birthdayInfo) out.birthdayInfo = { ...s.birthdayInfo, list: s.birthdayInfo.list.map((b) => ({ ...b, name: '' })), upcoming: [], milestones: [] };
  if (s.awards) out.awards = s.awards.map((a) => ({ ...a, ...(a.title != null ? { title: title(a.title) } : {}), ...(a.name != null ? { name: none ? '' : mask(a.name) } : {}) }));
  if (s.moments) out.moments = s.moments.map((m) => ({ ...m, title: mask(m.title) }));
  if (s.highlights) out.highlights = s.highlights.map((m) => ({ ...m, title: mask(m.title) }));
  // Shared things only ever need the reclaim totals; the suggestions name series and organisers.
  if (s.reclaim) out.reclaim = { totalHours: s.reclaim.totalHours, workingDays: s.reclaim.workingDays, suggestions: s.reclaim.suggestions.map((x) => ({ kind: x.kind, hoursPerYear: x.hoursPerYear })), featured: null };
  if (s.colleagues) out.colleagues = out.collaborators?.filter((p) => !p.ext) || [];
  out.selfEmail = null;
  out.leaveOutCandidates = [];
  return out;
}
