// Tiny i18n. English source strings are the keys (gettext style), so untranslated
// strings fall back to English and code stays readable. Locale files map English → local.
//   t('Hello {name}', { name })      tn('{n} trip', '{n} trips', n)
export const LOCALES = {
  en: { tag: 'en-GB', name: 'English', currency: 'GBP', week: 37.5 },
  nl: { tag: 'nl-NL', name: 'Nederlands', currency: 'EUR', week: 40 },
  sv: { tag: 'sv-SE', name: 'Svenska', currency: 'SEK', week: 40 },
  nb: { tag: 'nb-NO', name: 'Norsk', currency: 'NOK', week: 37.5 },
  da: { tag: 'da-DK', name: 'Dansk', currency: 'DKK', week: 37 },
};

let current = 'en';
let dict = {};

export const locale = () => current;
export const localeInfo = () => LOCALES[current];
export const localeTag = () => LOCALES[current].tag;

export function t(s, params) {
  const tpl = dict[s] ?? s;
  if (!params) return tpl;
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? params[k] === 0 ? String(params[k]) : m));
}

export function tn(one, other, n, params = {}) {
  const form = new Intl.PluralRules(localeTag()).select(n) === 'one' ? one : other;
  return t(form, { n: Number(n).toLocaleString(localeTag(), { maximumFractionDigits: 1 }), ...params });
}

export function pickLocale({ query, stored, languages = [] } = {}) {
  const norm = (c) => { c = String(c || '').toLowerCase().split('-')[0]; return c === 'no' || c === 'nn' ? 'nb' : c; };
  for (const c of [query, stored, ...languages].map(norm)) if (LOCALES[c]) return c;
  return 'en';
}

/** Load a locale's dictionary. English needs no file. */
export async function setLocale(code) {
  code = LOCALES[code] ? code : 'en';
  try { dict = code === 'en' ? {} : (await import(`./i18n/${code}.js`)).default; } catch { dict = {}; } // missing file: English
  current = code;
  if (typeof document !== 'undefined') document.documentElement.lang = LOCALES[code].tag.split('-')[0];
  return code;
}

/** Synchronous variant for tests and workers that already hold the dictionary. */
export function useDictionary(code, d) { current = LOCALES[code] ? code : 'en'; dict = d || {}; }

export const monthName = (i, style = 'long') => new Intl.DateTimeFormat(localeTag(), { month: style }).format(new Date(2021, i, 1));
export const weekdayName = (i, style = 'long') => new Intl.DateTimeFormat(localeTag(), { weekday: style }).format(new Date(2021, 0, 3 + i)); // 3 Jan 2021 was a Sunday

/** Translate static markup: elements with data-i18n get their text replaced; data-i18n-attr="placeholder,aria-label" too. */
export function translateDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    if (!el.dataset.i18nSrc) el.dataset.i18nSrc = el.innerHTML.trim();
    el.innerHTML = t(el.dataset.i18nSrc);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const a of el.dataset.i18nAttr.split(',')) {
      const key = `i18n${a.replace(/(^|-)([a-z])/g, (m, d, c) => c.toUpperCase())}`; // data-* keys must be camelCase
      if (!el.dataset[key]) el.dataset[key] = el.getAttribute(a) || '';
      el.setAttribute(a, t(el.dataset[key]));
    }
  });
}
