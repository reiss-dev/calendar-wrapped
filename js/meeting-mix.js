// Who meetings were with: customers (anyone from outside your organisation), colleagues, 1:1s,
// and groups people name themselves ("AE meetings": these people, or these words in the title).
// Pure and DOM-free: runs in the worker, and in tests.

// Mail providers say nothing about which organisation someone is from.
const PERSONAL_DOMAINS = /^(gmail|googlemail|outlook|hotmail|live|msn|icloud|me|mac|yahoo|ymail|aol|proton|protonmail|pm|gmx|web|mail|zoho|fastmail|hey|telenet|skynet|ziggo|kpnmail|planet|hetnet|xs4all|home|online|telia|bredband|comhem|spray|passagen|telenor|online|altibox|tdcadsl|jubii|sol|ofir|yandex|btinternet|sky|virginmedia|talktalk|ntlworld|blueyonder)\./i;
const SECOND_LEVEL = /^(co|com|org|net|ac|gov|ltd|plc|nhs|sch)$/i;
const GROUP_ID = /^[a-z0-9]{1,12}$/;

export const domainOf = (email) => String(email || '').toLowerCase().split('@')[1] || '';
export const isPersonalDomain = (d) => PERSONAL_DOMAINS.test(`${d}.`) || PERSONAL_DOMAINS.test(d);

/** acme-customer.co.uk → "Acme Customer"; mail.contoso.com → "Contoso". */
export function companyName(domain) {
  const parts = String(domain || '').toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2) return '';
  parts.pop(); // the TLD
  if (parts.length > 1 && SECOND_LEVEL.test(parts[parts.length - 1])) parts.pop();
  const core = parts[parts.length - 1] || '';
  return core.split(/[-_]/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** The organisation's own domains: the owner's, or failing that the one most attendees share. */
export function homeDomains(events, selfEmail) {
  const own = new Set();
  for (const e of events) {
    const o = domainOf(e.owner || selfEmail);
    if (o && !isPersonalDomain(o)) own.add(o);
  }
  if (own.size) return [...own];
  const counts = new Map();
  for (const e of events) for (const a of e.others || []) { const d = domainOf(a.email); if (d && !isPersonalDomain(d)) counts.set(d, (counts.get(d) || 0) + 1); }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? [top[0]] : [];
}

/** Is this domain one of the organisation's own (or a subdomain of one)? */
export const homeTest = (home) => (d) => home.some((h) => d === h || d.endsWith(`.${h}`));

/** Groups as people typed them, cleaned: [{ id, name, match: ['word', 'name', 'email'] }]. */
export function cleanGroups(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 6).map((g, i) => ({
    id: typeof g?.id === 'string' && GROUP_ID.test(g.id) ? g.id : `g${i + 1}`,
    name: String(g?.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24),
    match: [...new Set((Array.isArray(g?.match) ? g.match : String(g?.match || '').split(/[,;\n]/)).map((w) => String(w).trim().toLowerCase()).filter((w) => w.length >= 2))].slice(0, 30),
  })).filter((g) => g.name && g.match.length);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function groupMatcher(g) {
  const words = g.match.filter((w) => !w.includes('@'));
  const title = words.length ? new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${words.map(escapeRe).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu') : null;
  // 'title' when the title says so; 'people' when one of the named people was there.
  return (e) => {
    if (title && title.test(e.title || '')) return 'title';
    return (e.others || []).some((a) => {
      const email = String(a.email || '').toLowerCase(), name = String(a.name || '').toLowerCase();
      return g.match.some((m) => (m.includes('@') ? email === m || (m.startsWith('@') && email.endsWith(m)) : email.split('@')[0].split(/[._-]/).includes(m) || email.startsWith(`${m}@`) || name === m || name.split(/\s+/).includes(m) || (m.includes(' ') && name.includes(m))));
    }) ? 'people' : null;
  };
}

/**
 * Sorts meetings into kinds. Returns null when the calendar has no attendee emails to go on.
 * { home, types: [{ key, name?, count, hours, pct }], customers: [{ name, domain, count, hours }],
 *   customerShare, externalPeople, groups }
 */
export function meetingMix(meetings, { selfEmail = null, groups = [] } = {}) {
  const withEmails = meetings.filter((e) => (e.others || []).some((a) => a.email));
  if (meetings.length < 5 || withEmails.length / Math.max(1, meetings.length) < 0.3) return null;
  const home = homeDomains(meetings, selfEmail);
  if (!home.length) return null;
  const isHome = homeTest(home);
  const gs = cleanGroups(groups).map((g) => ({ ...g, test: groupMatcher(g) }));
  const types = new Map();
  const customers = new Map();
  const outsiders = new Map();
  const add = (key, e, extra = {}) => {
    const cur = types.get(key) || { key, count: 0, hours: 0, ...extra };
    cur.count++; cur.hours += e.durationH; types.set(key, cur);
  };
  let total = 0;
  for (const e of meetings) {
    total += e.durationH;
    const others = (e.others || []).filter((a) => a.email);
    const external = others.filter((a) => !isHome(domainOf(a.email)));
    for (const a of external) if (a.name && !/@/.test(a.name)) outsiders.set(a.email.toLowerCase(), a.name.replace(/"/g, '').trim());
    // A company counts once per meeting, however many of its people came.
    const companies = new Set(external.map((a) => domainOf(a.email)).filter((d) => d && !isPersonalDomain(d)));
    for (const d of companies) {
      const cur = customers.get(d) || { domain: d, name: companyName(d), count: 0, hours: 0 };
      cur.count++; cur.hours += e.durationH; customers.set(d, cur);
    }
    // A title always decides. Named people only claim meetings without customers in them, so a
    // customer call your account executive joins is still a customer call.
    let g = gs.find((x) => x.test(e) === 'title');
    if (!g && !external.length) g = gs.find((x) => x.test(e) === 'people');
    if (g) add(`g:${g.id}`, e, { name: g.name });
    else if (external.length) add('customer', e);
    else if (!others.length) add('other', e);
    else if (others.length === 1) add('one', e);
    else add('internal', e);
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  const list = [...types.values()].map((x) => ({ ...x, hours: r1(x.hours), pct: total ? Math.round((x.hours / total) * 100) : 0 })).sort((a, b) => b.hours - a.hours);
  const cust = types.get('customer');
  return {
    home: home[0],
    homes: home,
    types: list,
    customers: [...customers.values()].map((c) => ({ ...c, hours: r1(c.hours) })).sort((a, b) => b.hours - a.hours).slice(0, 12),
    companies: customers.size,
    customerShare: cust && total ? Math.round((cust.hours / total) * 100) : 0,
    customerMeetings: cust ? cust.count : 0,
    externalPeople: new Set(meetings.flatMap((e) => (e.others || []).filter((a) => a.email && !isHome(domainOf(a.email))).map((a) => a.email.toLowerCase()))).size,
    externalNames: [...new Set(outsiders.values())].slice(0, 150),
    groups: gs.map(({ id, name, match }) => ({ id, name, match })),
  };
}
