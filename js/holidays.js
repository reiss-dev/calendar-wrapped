// Public holidays for the five supported countries, and a planner that finds the days of leave
// that buy the longest breaks. Pure and DOM-free: the engine and the tests use it directly.
//
// Countries follow the language: English → England and Wales, Dutch → the Netherlands,
// Swedish → Sweden, Norwegian → Norway, Danish → Denmark. Days most people get off in practice
// are included (Swedish Midsummer Eve, Christmas Eve and New Year's Eve); one-off royal
// holidays are not.

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const COUNTRY_BY_LOCALE = { en: 'GB', nl: 'NL', sv: 'SE', nb: 'NO', da: 'DK' };
export const countryFor = (locale) => COUNTRY_BY_LOCALE[locale] || 'GB';
/** Usual paid leave a year, for a gentle "still to use" note. */
export const TYPICAL_LEAVE = { GB: 25, NL: 25, SE: 25, NO: 25, DK: 25 };

/** Easter Sunday (Gregorian), by the anonymous computus. */
export function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
const nthWeekday = (year, month, weekday, n) => { const d = new Date(year, month, 1); while (d.getDay() !== weekday) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7 * (n - 1)); return d; };
const lastWeekday = (year, month, weekday) => { const d = new Date(year, month + 1, 0); while (d.getDay() !== weekday) d.setDate(d.getDate() - 1); return d; };
const firstOnOrAfter = (year, month, day, weekday) => { const d = new Date(year, month, day); while (d.getDay() !== weekday) d.setDate(d.getDate() + 1); return d; };

function gb(y) {
  const E = easter(y), out = [];
  const ny = new Date(y, 0, 1);
  out.push([ny.getDay() === 6 ? addDays(ny, 2) : ny.getDay() === 0 ? addDays(ny, 1) : ny, 'New Year’s Day', 'newyear']);
  out.push([addDays(E, -2), 'Good Friday', 'easter'], [addDays(E, 1), 'Easter Monday', 'easter']);
  out.push([nthWeekday(y, 4, 1, 1), 'Early May bank holiday', 'earlymay'], [lastWeekday(y, 4, 1), 'Spring bank holiday', 'latemay'], [lastWeekday(y, 7, 1), 'Summer bank holiday', 'summer']);
  // Christmas and Boxing Day move to the next free weekdays when they fall at a weekend.
  const xmas = new Date(y, 11, 25);
  const taken = new Set();
  for (const [d, name] of [[xmas, 'Christmas Day'], [addDays(xmas, 1), 'Boxing Day']]) {
    let day = d;
    while (isWeekend(day) || taken.has(dayKey(day))) day = addDays(day, 1);
    taken.add(dayKey(day));
    out.push([day, name, 'christmas']);
  }
  return out;
}
function nl(y) {
  const E = easter(y);
  const kings = new Date(y, 3, 27); if (kings.getDay() === 0) kings.setDate(26);
  const out = [[new Date(y, 0, 1), 'Nieuwjaarsdag', 'newyear'], [E, 'Eerste Paasdag', 'easter'], [addDays(E, 1), 'Tweede Paasdag', 'easter'], [kings, 'Koningsdag', 'kings'],
    [addDays(E, 39), 'Hemelvaartsdag', 'ascension'], [addDays(E, 49), 'Eerste Pinksterdag', 'whitsun'], [addDays(E, 50), 'Tweede Pinksterdag', 'whitsun'],
    [new Date(y, 11, 25), 'Eerste Kerstdag', 'christmas'], [new Date(y, 11, 26), 'Tweede Kerstdag', 'christmas']];
  if (y % 5 === 0) out.push([new Date(y, 4, 5), 'Bevrijdingsdag', 'liberation']); // a day off for most people in lustrum years
  return out;
}
function se(y) {
  const E = easter(y);
  return [[new Date(y, 0, 1), 'Nyårsdagen', 'newyear'], [new Date(y, 0, 6), 'Trettondedag jul', 'epiphany'], [addDays(E, -2), 'Långfredagen', 'easter'], [E, 'Påskdagen', 'easter'], [addDays(E, 1), 'Annandag påsk', 'easter'],
    [new Date(y, 4, 1), 'Första maj', 'mayday'], [addDays(E, 39), 'Kristi himmelsfärdsdag', 'ascension'], [addDays(E, 49), 'Pingstdagen', 'whitsun'], [new Date(y, 5, 6), 'Sveriges nationaldag', 'national'],
    [firstOnOrAfter(y, 5, 19, 5), 'Midsommarafton', 'midsummer'], [firstOnOrAfter(y, 5, 20, 6), 'Midsommardagen', 'midsummer'], [firstOnOrAfter(y, 9, 31, 6), 'Alla helgons dag', 'allsaints'],
    [new Date(y, 11, 24), 'Julafton', 'christmas'], [new Date(y, 11, 25), 'Juldagen', 'christmas'], [new Date(y, 11, 26), 'Annandag jul', 'christmas'], [new Date(y, 11, 31), 'Nyårsafton', 'newyear']];
}
function no(y) {
  const E = easter(y);
  return [[new Date(y, 0, 1), 'Første nyttårsdag', 'newyear'], [addDays(E, -3), 'Skjærtorsdag', 'easter'], [addDays(E, -2), 'Langfredag', 'easter'], [E, 'Første påskedag', 'easter'], [addDays(E, 1), 'Andre påskedag', 'easter'],
    [new Date(y, 4, 1), 'Arbeidernes dag', 'mayday'], [new Date(y, 4, 17), 'Grunnlovsdag', 'constitution'], [addDays(E, 39), 'Kristi himmelfartsdag', 'ascension'], [addDays(E, 49), 'Første pinsedag', 'whitsun'], [addDays(E, 50), 'Andre pinsedag', 'whitsun'],
    [new Date(y, 11, 25), 'Første juledag', 'christmas'], [new Date(y, 11, 26), 'Andre juledag', 'christmas']];
}
function dk(y) {
  const E = easter(y);
  const out = [[new Date(y, 0, 1), 'Nytårsdag', 'newyear'], [addDays(E, -3), 'Skærtorsdag', 'easter'], [addDays(E, -2), 'Langfredag', 'easter'], [E, 'Påskedag', 'easter'], [addDays(E, 1), '2. påskedag', 'easter'],
    [addDays(E, 39), 'Kristi himmelfartsdag', 'ascension'], [addDays(E, 49), 'Pinsedag', 'whitsun'], [addDays(E, 50), '2. pinsedag', 'whitsun'],
    [new Date(y, 11, 25), 'Juledag', 'christmas'], [new Date(y, 11, 26), '2. juledag', 'christmas']];
  if (y <= 2023) out.push([addDays(E, 26), 'Store bededag', 'prayer']); // abolished from 2024
  return out;
}
const RULES = { GB: gb, NL: nl, SE: se, NO: no, DK: dk };

const cache = new Map();
/** Public holidays for a year, sorted: [{ key: 'YYYY-MM-DD', name, group }]. */
export function bankHolidays(country, year) {
  const id = `${country}:${year}`;
  if (!cache.has(id)) {
    const seen = new Map();
    for (const [d, name, group] of (RULES[country] || RULES.GB)(year)) if (!seen.has(dayKey(d))) seen.set(dayKey(d), { key: dayKey(d), name, group });
    cache.set(id, [...seen.values()].sort((a, b) => (a.key < b.key ? -1 : 1)));
  }
  return cache.get(id);
}
/** Holidays around a year (the year before and after too), as a Map keyed by date. */
export function holidayMap(country, year) {
  const m = new Map();
  for (const y of [year - 1, year, year + 1]) for (const h of bankHolidays(country, y)) m.set(h.key, h);
  return m;
}

/**
 * The leave that buys the longest breaks in a year. For each public holiday on a weekday, finds the
 * window of up to `maxTake` days of leave that adds the most free days (weekends and holidays),
 * then picks the best non-overlapping windows. Returned in date order:
 * [{ start, end, take, off, leave: [keys], group, name }].
 */
export function bestBreaks(country, year, { max = 3, maxTake = 5, from = new Date(year, 0, 1) } = {}) {
  const hol = holidayMap(country, year);
  const isOff = (d) => isWeekend(d) || hol.has(dayKey(d));
  const found = [];
  for (const anchor of bankHolidays(country, year)) {
    const A = fromKey(anchor.key);
    if (isWeekend(A)) continue;
    let best = null;
    for (let s = -9; s <= 0; s++) {
      for (let e = 0; e <= 9; e++) {
        let a = addDays(A, s), b = addDays(A, e);
        const leave = [];
        for (let d = a; d <= b; d = addDays(d, 1)) if (!isOff(d)) leave.push(dayKey(d));
        if (leave.length < 1 || leave.length > maxTake) continue;
        while (isOff(addDays(a, -1)) && addDays(a, -1) >= from) a = addDays(a, -1);
        while (isOff(addDays(b, 1))) b = addDays(b, 1);
        const off = Math.round((b - a) / DAY) + 1;
        if (off < leave.length * 2 || a < from) continue;
        const cand = { start: dayKey(a), end: dayKey(b), take: leave.length, off, leave, group: anchor.group, name: anchor.name };
        const free = off - leave.length;
        if (!best || free > best.off - best.take || (free === best.off - best.take && leave.length < best.take)) best = cand;
      }
    }
    if (best && fromKey(best.start).getFullYear() === year) found.push(best);
  }
  found.sort((x, y) => (y.off - y.take) - (x.off - x.take) || y.off / y.take - x.off / x.take);
  const picked = [];
  for (const c of found) {
    if (picked.some((p) => !(c.end < p.start || c.start > p.end))) continue;
    picked.push(c);
    if (picked.length >= max) break;
  }
  return picked.sort((x, y) => (x.start < y.start ? -1 : 1));
}
