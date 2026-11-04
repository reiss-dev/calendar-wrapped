// All generated wording lives here, as translatable templates.
// The stats engine stores ids and raw numbers; this turns them into text in the current locale.
import { t, tn, monthName } from './i18n.js';
import { fmt } from './ui.js';

const n = (v) => fmt.int(v);
const h = (v) => fmt.hours(v);

// ---------------------------------------------------------------- personas
const PERSONAS = {
  // work
  ghost: ['👻', () => t('The Ghost'), () => t('Not a single meeting found. Either you’ve achieved enlightenment or you exported the wrong calendar.')],
  tetris: ['🧱', () => t('The Calendar Tetris Champion'), () => t('Over half your working hours were meetings. Your calendar is less a schedule, more a wall.')],
  firefighter: ['🚒', () => t('The Firefighter'), (p) => t('{n} days of back-to-back meetings. You don’t take breaks, you take hits.', { n: n(p.n) })],
  people: ['🤝', () => t('The People Person'), (p) => t('{n} one-to-ones. You run on conversation and know everyone’s dog’s name.', { n: n(p.n) })],
  earlybird: ['🌅', () => t('The Early Bird'), (p) => t('{n} meetings before 8am. The worm never stood a chance.', { n: n(p.n) })],
  nightowl: ['🦉', () => t('The Night Owl'), (p) => t('{n} meetings running past 6pm. Time zones are a construct, apparently.', { n: n(p.n) })],
  roadwarrior: ['✈️', () => t('The Road Warrior'), (p) => t('{n} trips this year. Your laptop has seen more lounges than your sofa.', { n: n(p.n) })],
  habit: ['🔁', () => t('The Creature of Habit'), (p) => t('{n}% of your meeting time was recurring. Same time next week?', { n: n(p.n) })],
  ringleader: ['🎪', () => t('The Ringleader'), (p) => t('You organised {n} meetings. If there’s an invite, odds are you sent it.', { n: n(p.n) })],
  deepworker: ['🧘', () => t('The Deep Worker'), (p) => t('Only {n}% of your time in meetings. Protect it. People will try to take it.', { n: n(p.n) })],
  balanced: ['⚖️', () => t('The Balanced One'), () => t('A respectable amount of meetings and a respectable amount of actual work. Suspicious.')],
  // personal
  blank: ['📄', () => t('The Blank Page'), () => t('Nothing in the calendar. Either spontaneous or suspiciously organised elsewhere.')],
  machine: ['🏋️', () => t('The Machine'), (p) => t('{n} workouts in the calendar. Rest days are for other people.', { n: n(p.n) })],
  butterfly: ['🦋', () => t('The Social Butterfly'), (p) => t('{n} dinners, drinks and coffees. Your friends have a good year because of you.', { n: n(p.n) })],
  globetrotter: ['🌍', () => t('The Globetrotter'), (p) => t('{n} trips. Your suitcase never fully gets unpacked.', { n: n(p.n) })],
  taxi: ['🚗', () => t('The Family Taxi'), (p) => t('{n} pickups, drop-offs and school things. Unpaid, unthanked, undefeated.', { n: n(p.n) })],
  culture: ['🎭', () => t('The Culture Vulture'), (p) => t('{n} gigs, films and shows. You have opinions about the support act.', { n: n(p.n) })],
  homebody: ['🛋️', () => t('The Homebody'), (p) => t('{n} weekends with nothing booked. Peace, quiet and a very good sofa.', { n: n(p.n) })],
  planner: ['📋', () => t('The Planner'), (p) => t('{n} things in the calendar. If it’s not written down, it didn’t happen.', { n: n(p.n) })],
  easygoing: ['🌤️', () => t('The Easygoing One'), () => t('Enough plans to have a life, not so many that it needs project management.')],
};

export function personaCopy(id, params = {}) {
  const P = PERSONAS[id] || PERSONAS.balanced;
  return { id, params, emoji: P[0], name: P[1](params), blurb: P[2](params) };
}
/** Re-render a stored persona in the current language. Old saved stats without an id pass through. */
export const persona = (p) => (p?.id && PERSONAS[p.id] ? personaCopy(p.id, p.params) : p);

// ---------------------------------------------------------------- suggestions
const SUGGESTIONS = {
  async: [(p) => t('Make “{title}” async twice a week', p), (p) => t('{count} occurrences, {hours} hours. Daily meetings rarely need to be daily. Two written updates a week keep the rhythm and give everyone the time back.', p)],
  shorten: [(p) => t('Trim “{title}” by 5 minutes', p), (p) => t('{count} occurrences at {minutes} minutes. {shorter}-minute slots give everyone a breather and nobody notices the difference.', p)],
  cadence: [(p) => t('Move “{title}” to every other week', p), (p) => t('It ran {count} times for {hours} hours. Halving the cadence is the biggest lever you have, and most weekly meetings survive it fine.', p)],
  optional: [() => t('Go optional on big meetings'), (p) => t('{count} meetings had eight or more people ({hours} hours). If you spoke in fewer than half, you could read the notes instead.', p)],
  agenda: [() => t('Ask for an agenda'), (p) => t('{count} group meetings ({hours} hours) had no description at all. “No agenda, no attenda” saves roughly a quarter of them.', p)],
  buffers: [() => t('Turn on speedy meetings'), (p) => t('{days} days were wall-to-wall. Default 25 and 50 minute slots give you {hours} hours of breathing room back.', p)],
  focus: [() => t('Block one no-meeting morning a week'), (p) => t('{days} days had no two-hour gap for real work. One protected morning restores about {hours} focus hours a year.', p)],
  hours: [() => t('Set working hours in your calendar'), (p) => t('{hours} hours of meetings sat before 8am or after 6pm. Visible working hours nudge others to book inside them.', p)],
  friday: [() => t('Protect Friday afternoons'), (p) => t('{count} meetings landed on a Friday afternoon. Nobody is at their best in them. Move the movable ones.', p)],
  rsvp: [() => t('Actually reply to invites'), (p) => t('{count} meetings you attended without ever responding. A “no” is free. Decline a third of them.', p)],
  reconnect: [(p) => t('Text {name}', p), (p) => t('You saw them {count} times this year but not since {month}. Low effort, high return.', p)],
  weekends: [(p) => t('{free} empty weekends', p), (p) => t('Nothing booked on {free} of {total} weekends. Great if that was the plan. If not, book the thing you keep saying you’ll do.', p)],
  evenings: [() => t('Protect a weeknight'), (p) => t('{count} weekday evenings had something on. Pick one night a week that stays empty on purpose.', p)],
  recurring: [(p) => t('Still enjoying “{title}”?', p), (p) => t('{hours} hours across {count} sessions this year. If you look forward to it, brilliant. If you dread it, it’s allowed to stop.', p)],
  move: [() => t('Put exercise in the calendar'), (p) => t('{count} workouts made it in. Things that are scheduled happen. Things that aren’t, don’t.', p)],
};

function formatParams(p = {}) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'month' && typeof v === 'number') out[k] = monthName(v);
    else if (k === 'hours' && typeof v === 'number') out[k] = h(v);
    else if (typeof v === 'number') out[k] = n(v);
    else out[k] = v;
  }
  return out;
}

export function suggestionCopy(kind, params) {
  const S = SUGGESTIONS[kind];
  if (!S) return { title: kind, detail: '' };
  const p = formatParams(params);
  return { title: S[0](p), detail: S[1](p) };
}
/** Re-render a stored suggestion in the current language. */
export const suggestion = (x) => (x?.params && SUGGESTIONS[x.kind] ? { ...x, ...suggestionCopy(x.kind, x.params) } : x);

// ---------------------------------------------------------------- categories and comparisons
const CATEGORY_LABELS = {
  fitness: () => t('Fitness'), food: () => t('Food and drinks'), birthday: () => t('Birthdays'), health: () => t('Health and appointments'),
  travel: () => t('Travel'), family: () => t('Family and kids'), culture: () => t('Culture and events'), home: () => t('Home and errands'),
};
export const categoryLabel = (key) => (CATEGORY_LABELS[key] ? CATEGORY_LABELS[key]() : key);

const EQUIVALENTS = {
  weeks: () => t('full working weeks'),
  flights: () => t('flights from London to New York'),
  office: () => t('complete watches of The Office (US)'),
  marathons: () => t('marathons, at a steady four-hour pace'),
};
export const equivalentLabel = (key) => (EQUIVALENTS[key] ? EQUIVALENTS[key]() : key);

export const plural = { trips: (k) => tn('{n} trip', '{n} trips', k), days: (k) => tn('{n} day', '{n} days', k) };
