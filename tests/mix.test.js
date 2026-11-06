import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseICS, guessSelfEmail } from '../js/ics.js';
import { computeStats } from '../js/stats.js';
import { meetingMix, companyName, cleanGroups, homeDomains } from '../js/meeting-mix.js';
import { maskStats, makeMasker, hiddenTerms, levelOf, REDACTED } from '../js/privacy.js';
import { cardModel } from '../js/model.js';

const Y = 2026;
const range = { rangeStart: new Date(Y, 0, 1), rangeEnd: new Date(Y + 1, 0, 1) };
const NOW = new Date(Y, 10, 4, 12);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sample = (groups = []) => { const { events, meta } = parseICS(read('sample/work.ics'), range); return computeStats(events, { ...range, selfEmail: guessSelfEmail(events, meta), now: NOW, groups }); };

const ME = 'me@grafana.com';
const m = (title, emails, hours = 1) => ({ title, durationH: hours, owner: ME, others: emails.map((e) => ({ email: e, name: e.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) })) });

test('company names come from email domains', () => {
  assert.equal(companyName('acme-customer.co.uk'), 'Acme Customer');
  assert.equal(companyName('mail.contoso.com'), 'Contoso');
  assert.equal(companyName('ing.nl'), 'Ing');
  assert.deepEqual(homeDomains([{ owner: 'a@gmail.com', others: [{ email: 'x@corp.se' }, { email: 'y@corp.se' }, { email: 'z@other.se' }] }]), ['corp.se'], 'a gmail owner falls back to the most common work domain');
});

test('meetings sort into customer, internal, 1:1 and your own groups', () => {
  const meetings = [
    m('Acme QBR', ['kate@acme.com', 'sam.ae@grafana.com'], 2),
    m('Contoso architecture', ['ola@contoso.no']),
    m('Team sync', ['a@grafana.com', 'b@grafana.com']),
    m('Pipeline review', ['sam.ae@grafana.com', 'b@grafana.com']),
    m('Sam / me', ['sam.ae@grafana.com']),
    m('Priya 1:1', ['priya@grafana.com']),
    m('Interview', ['candidate@gmail.com']),
  ];
  const plain = meetingMix(meetings, { selfEmail: ME });
  const by = (mix) => Object.fromEntries(mix.types.map((x) => [x.key, x.count]));
  assert.deepEqual(by(plain), { customer: 3, internal: 2, one: 2 });
  assert.equal(plain.home, 'grafana.com');
  assert.deepEqual(plain.customers.map((c) => c.name), ['Acme', 'Contoso'], 'personal mail domains are not companies');
  assert.equal(plain.customerShare, 50);

  const ae = meetingMix(meetings, { selfEmail: ME, groups: [{ name: 'AE meetings', match: 'sam.ae@grafana.com, pipeline' }] });
  const t = by(ae);
  assert.equal(t['g:g1'], 2, 'the AE sync and the pipeline review');
  assert.equal(t.customer, 3, 'a customer call the AE joins is still a customer call');
  assert.equal(ae.types.find((x) => x.key === 'g:g1').name, 'AE meetings');
  const byTitle = meetingMix(meetings, { selfEmail: ME, groups: [{ name: 'QBRs', match: 'qbr' }] });
  assert.equal(by(byTitle)['g:g1'], 1, 'a title match wins even with customers present');
  assert.equal(meetingMix(meetings.slice(0, 3), { selfEmail: ME }), null, 'too few meetings to say');
});

test('groups are cleaned: names, words, limits', () => {
  const g = cleanGroups([{ name: '  AE meetings ', match: 'Sam, ;x, TOM@corp.com' }, { name: '', match: 'a,b' }, { name: 'No words', match: '' }, { id: 'evil"><', name: 'Ok', match: ['qbr'] }]);
  assert.deepEqual(g.map((x) => x.name), ['AE meetings', 'Ok']);
  assert.deepEqual(g[0].match, ['sam', 'tom@corp.com']);
  assert.equal(g[1].id, 'g4');
});

test('the sample year has customers, and the stats say who is outside', () => {
  const s = sample();
  assert.ok(s.mix, 'mix computed');
  assert.equal(s.mix.home, 'northwindlabs.com');
  assert.deepEqual(s.mix.customers.map((c) => c.name).sort(), ['Acme Customer', 'Contoso Bank']);
  assert.ok(s.mix.customerShare > 5 && s.mix.customerShare < 60, String(s.mix.customerShare));
  assert.ok(s.colleagues.every((p) => !p.ext));
  assert.ok(JSON.parse(JSON.stringify(s.mix)).types.length >= 3, 'survives the worker boundary');
  const g = sample([{ name: 'Deals', match: 'deal review, pricing' }]);
  assert.ok(g.mix.types.some((x) => x.name === 'Deals' && x.count > 0));
});

test('hiding customers: names, companies and their people are blanked, colleagues stay', () => {
  const s = sample();
  // Make sure an outsider is at the top, as happens for anyone in sales.
  const kate = { name: 'Kate Thornton', email: 'kate@acme-customer.co.uk', count: 999, hours: 500, ext: true };
  s.collaborators = [kate, ...s.collaborators];
  s.topTitles = [{ key: 'Customer call: Acme', count: 40 }, ...s.topTitles];
  s.moments = [{ m: 3, emoji: '🤝', title: 'Signed Contoso Bank, Kate cried' }];
  const mask = makeMasker(s, 'colleagues');
  assert.equal(mask('Customer call: Acme'), `Customer call: ${REDACTED}`);
  assert.equal(mask('Contoso Bank - architecture review'), `${REDACTED} - architecture review`);
  assert.equal(mask('Kate / Alex sync'), `${REDACTED} / Alex sync`);
  assert.equal(mask('Priya / Alex 1:1'), 'Priya / Alex 1:1', 'colleagues stay');
  const out = maskStats(s, 'colleagues');
  assert.ok(!out.collaborators.some((p) => p.ext), 'outsiders are not among the most seen');
  assert.equal(out.topTitles[0].key, `Customer call: ${REDACTED}`);
  assert.ok(out.mix.customers.every((c) => /^Customer [A-Z]$/.test(c.name) && !c.domain));
  assert.equal(out.moments[0].title, `Signed ${REDACTED}, ${REDACTED} cried`);
  const text = JSON.stringify(out);
  for (const w of ['Acme', 'Contoso', 'Kate', 'Thornton', 'Oliver', 'acme-customer']) assert.ok(!text.includes(w), `${w} leaked`);
  assert.equal(s.topTitles[0].key, 'Customer call: Acme', 'the original is untouched');
  const model = cardModel(out, { hideNames: false });
  assert.equal(model.n.pn, s.colleagues[0].name.split(' ')[0]);
  assert.ok(!JSON.stringify(model).includes('Acme'));
});

test('no names: nothing that names anyone, extra words hidden too', () => {
  const s = sample();
  s.moments = [{ m: 1, emoji: '🚀', title: 'Project Falcon launch with Priya' }];
  const out = maskStats(s, 'none', ['Project Falcon']);
  assert.equal(out.collaborators.length, 0);
  assert.equal(out.topTitles.length, 0);
  assert.ok(out.recurringSeries.every((x) => x.title === '' && !x.organizer));
  assert.equal(out.moments[0].title, `${REDACTED} launch with ${REDACTED}`);
  const text = JSON.stringify(out);
  for (const p of s.collaborators) assert.ok(!text.includes(p.name), p.name);
  assert.ok(!text.includes('alex.morgan'), 'the owner email is gone');
  assert.equal(levelOf({ mode: 'personal' }, 'colleagues'), 'none');
  assert.equal(levelOf({ mode: 'work', mix: null }, 'colleagues'), 'none', 'cannot tell customers apart, so hide everyone');
  assert.ok(hiddenTerms(s, 'all', ['Falcon']).includes('Falcon'));
  assert.equal(maskStats(s, 'all'), s);
});
