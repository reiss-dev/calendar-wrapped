# Launch plan

Everything is built and tested. What's left needs your accounts, your judgement, or native speakers. In order:

## 1. Push the code (5 minutes)

The project is a local git repository with full history. Create an empty private repository on GitHub, then:

```bash
git remote add origin git@github.com:<you>/<repo>.git
```

```bash
git push -u origin main
```

## 2. Pick a name you own (this week)

"Wrapped" is Spotify's brand, and every link, card and email carries the name. Ideas, availability not checked: **Booked Solid**, **Meeting Year**, **Hours Back**, **Calendar Rewind**, **Invite Only**. Check the domain, UKIPO and EUIPO trademarks, and social handles, then:

```bash
npm run rebrand -- "Booked Solid" bookedsolid.app
```

```bash
npm run og
```

## 3. Get translations reviewed (this week)

All four languages pass the completeness checker, but they were drafted by a model. You work with Benelux and Nordic customers, so ask one native speaker per language for 20 minutes. Point them at the persona names and the jokes first. After any edit, run `node tools/i18n-check.js <code>`.

## 4. Start sign-in verification now (longest lead time)

**Google.** Create an OAuth client of type Web, add your domain as an authorised JavaScript origin, and put the client ID in `js/config.js`. The single scope `calendar.events.readonly` is sensitive, so submit for verification. You'll need the privacy page, domain verification and a short screen recording. Until it's approved, up to 100 named test users can use it. Allow several weeks.

**Microsoft.** In Microsoft Entra ID, register an app with these settings:
- Supported accounts: "any organisational directory and personal Microsoft accounts".
- A **Single-page application** redirect URI of `https://<domain>/auth-callback.html`.
- The delegated permissions `User.Read` and `Calendars.Read`.

Put the client ID in `js/config.js`. Publisher verification (via the Microsoft Partner Network) removes the "unverified" label and stops many tenants blocking consent. Some organisations still require admin consent, and the app explains this and suggests a file export.

## 5. Test real calendars (an afternoon)

Send friends to `/diagnose.html`. It gives them a counts-only report and an anonymised copy of their calendar to send back. For your own exports:

```bash
npm run inspect -- ~/Downloads/calendar.ics
```

Add any interesting anonymised file to `tests/fixtures/` with a test. Priority: an Outlook web publish, desktop "Save Calendar" and Microsoft sign-in on a real Microsoft 365 tenant, and an Apple export.

## 6. Deploy (an hour)

Cloudflare Pages, no build command, output directory `/`.

| Setting | Value | For |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` | Payments |
| `STRIPE_PRICE_ID` | One-off price with GBP 4, EUR 5, SEK 49, NOK 49, DKK 39 as currency options | Personal unlock |
| `STRIPE_TEAM_PRICE_ID` | Monthly price with GBP 15, EUR 18, SEK 179, NOK 179, DKK 129 | Team plan |
| `UNLOCK_SECRET` | Long random string | Signing unlock and unsubscribe tokens |
| `RESEND_API_KEY`, `MAIL_FROM` | From Resend, domain verified | Emailing the plan |
| `SUBSCRIBERS`, `COUNTERS`, `BENCH`, `REFERRALS` | KV namespaces | Check-ins, counts, benchmarks, unlock by sharing |
| `REFERRAL_GOAL` | Optional, default `3` | Friends needed to unlock by sharing |
| `STATS_TOKEN` | Long random string | Reading counts at `/api/hit?token=…` |
| `LOKI_URL`, `LOKI_USER`, `LOKI_TOKEN` | From Grafana Cloud | Dashboard |

In Stripe, turn on the customer portal so team customers can cancel. Then set `allowPreviewUnlock: false` in `js/config.js` and run one real payment of each kind, then refund it.

**Reminders Worker.** In `workers/reminders/wrangler.toml`, set the KV namespace ID (the same one as `SUBSCRIBERS`) and `SITE_URL`. Add the secrets listed in that file, then from that folder:

```bash
npx wrangler deploy
```

Try it with `/?token=REMINDER_TOKEN&dry=1` first. It runs at 08:17 UTC on the first day of each quarter and never emails anyone twice within 60 days.

**Grafana Cloud.** In a free stack, create an access policy token with `logs:write`. Copy the Loki URL and user ID into the Pages settings above. Import `grafana/dashboard.json` and pick your Loki data source. You get the funnel, conversion rates, how people bring their calendar, Core Web Vitals at p75 and front-end errors.

## 7. Launch week

Spotify Wrapped has landed in late November or the first week of December in recent years. The format stays top of mind for about ten days.

| When | What |
|---|---|
| By 20 Nov | Name, deploy, real payments, translations reviewed |
| 23–27 Nov | Soft launch to 20–30 people. Watch the dashboard, fix the biggest drop |
| Spotify Wrapped day | Post your own card on LinkedIn; the link preview now shows it |
| Following Tue–Thu | Product Hunt, scheduled 00:01 Pacific |
| 1 January | First quarterly check-in goes out automatically |

## 8. Copy, ready to paste

The numbers come from the sample calendar. Swap in yours.

**Product Hunt tagline** (55 characters)

> Your year in meetings, as a story you'll want to share

**Description**

> Drop in your calendar, or sign in, and get a Wrapped-style story of your year: hours in meetings, your worst week, who you saw most, and the persona your calendar earned you. Then one-tap fixes for the meetings costing you most. It all runs in your browser.

**Maker comment**

> I spend my working life helping teams see where their systems spend time. I'd never looked at where mine went. So I built this: your calendar goes in, a story comes out, and nothing leaves your device. It found 271 hours I could realistically get back next year, mostly from two recurring meetings, and it drafts the message to the organiser for you. There's a team version that costs your shared meetings in person-hours, and it works in Dutch, Swedish, Norwegian and Danish too. What's your persona?

**LinkedIn**

> I spent 428 hours in meetings this year. That's 11 working weeks.
>
> I built a little tool that turns your calendar into a Spotify Wrapped-style story, and mine says I'm "The Road Warrior".
>
> The useful bit is at the end: it finds the recurring meetings costing you most and drafts the note to the organiser. For me, two meetings should be fortnightly. I'd never have spotted it.
>
> Your calendar never leaves your browser. Make yours and compare: [link]
