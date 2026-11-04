// Scheduled Worker: one check-in email a quarter.
//  - People who ticked "Send me a check-in each quarter" (SUBSCRIBERS KV, written by /api/subscribe)
//  - Active team-plan subscribers (read from Stripe)
// Never more than one email per person per 60 days. Deploy with: npx wrangler deploy (see wrangler.toml)
import { sign, secretOf, stripe, json } from '../../functions/_lib/util.js';
import { useDictionary, t } from '../../js/i18n.js';
import nl from '../../js/i18n/nl.js';
import sv from '../../js/i18n/sv.js';
import nb from '../../js/i18n/nb.js';
import da from '../../js/i18n/da.js';

const DICTS = { en: {}, nl, sv, nb, da };
const GAP = 60 * 86400000;

function emailText(kind, { locale = 'en', site, brand, unsubscribe }) {
  useDictionary(DICTS[locale] ? locale : 'en', DICTS[locale] || {});
  try {
    if (kind === 'team') {
      return {
        subject: t('Time for this quarter’s team report'),
        text: `${t('Hi,')}\n\n${t('A new quarter has started. Ask the team for fresh exports and run the report again to see whether last quarter’s changes stuck.')}\n\n${site}#team\n\n${t('You can manage or cancel your plan from the report page.')}\n\n${brand}`,
      };
    }
    return {
      subject: t('How’s your calendar looking?'),
      text: `${t('Hi,')}\n\n${t('A quarter has gone by since you looked at your year in meetings. It takes thirty seconds to run it again and see whether the changes stuck.')}\n\n${site}\n\n${t('Your calendar still never leaves your device.')}\n\n${brand}\n\n${t('Stop these emails: {link}', { link: unsubscribe })}`,
    };
  } finally { useDictionary('en', {}); }
}

async function send(env, to, { subject, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  });
  return res.ok;
}

export async function run(env, { now = new Date(), dryRun = false } = {}) {
  const site = (env.SITE_URL || '').replace(/\/?$/, '/');
  const brand = env.BRAND || 'Calendar Wrapped';
  const out = { personal: 0, team: 0, skipped: 0, failed: 0 };
  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !site) return { ...out, error: 'not_configured' };

  // People who opted in.
  if (env.SUBSCRIBERS) {
    let cursor;
    do {
      const page = await env.SUBSCRIBERS.list({ prefix: 'sub:', cursor });
      for (const { name } of page.keys) {
        const rec = JSON.parse((await env.SUBSCRIBERS.get(name)) || '{}');
        if (rec.lastSent && now - new Date(rec.lastSent) < GAP) { out.skipped++; continue; }
        const email = name.slice(4);
        const unsubscribe = `${site}api/unsubscribe?t=${encodeURIComponent(await sign(`unsub:${email}`, secretOf(env)))}`;
        const ok = dryRun || await send(env, email, emailText('personal', { locale: rec.locale, site, brand, unsubscribe }));
        if (ok) { out.personal++; if (!dryRun) await env.SUBSCRIBERS.put(name, JSON.stringify({ ...rec, lastSent: now.toISOString() })); } else out.failed++;
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }

  // Team-plan subscribers.
  if (env.STRIPE_SECRET_KEY && env.STRIPE_TEAM_PRICE_ID) {
    let after = '';
    for (;;) {
      const page = await stripe(env, `subscriptions?status=active&limit=100&price=${encodeURIComponent(env.STRIPE_TEAM_PRICE_ID)}&expand[]=data.customer${after ? `&starting_after=${after}` : ''}`);
      for (const sub of page.data || []) {
        const email = sub.customer?.email;
        const key = `team:${sub.id}`;
        const last = env.SUBSCRIBERS ? await env.SUBSCRIBERS.get(key) : null;
        if (!email || (last && now - new Date(last) < GAP)) { out.skipped++; continue; }
        const locale = sub.customer?.preferred_locales?.[0]?.slice(0, 2);
        const ok = dryRun || await send(env, email, emailText('team', { locale: locale === 'no' ? 'nb' : locale, site, brand }));
        if (ok) { out.team++; if (!dryRun && env.SUBSCRIBERS) await env.SUBSCRIBERS.put(key, now.toISOString()); } else out.failed++;
      }
      if (!page.has_more || !page.data?.length) break;
      after = page.data[page.data.length - 1].id;
    }
  }
  return out;
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(run(env)); },
  // Manual run for testing: GET /?token=REMINDER_TOKEN&dry=1
  async fetch(request, env) {
    const u = new URL(request.url);
    if (!env.REMINDER_TOKEN || u.searchParams.get('token') !== env.REMINDER_TOKEN) return new Response('Not found', { status: 404 });
    return json(await run(env, { dryRun: u.searchParams.get('dry') === '1' }));
  },
};
