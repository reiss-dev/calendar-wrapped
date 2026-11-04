# Launch plan

Everything in the product is built. This is what's left, in the order it needs doing.

## 1. Pick a name you own (this week)

"Wrapped" is Spotify's brand. Every share link and watermark will carry the name, so change it before any of them go out. Some directions to check (availability not verified):

- **Booked Solid** – funny, describes the problem, works for personal too
- **Meeting Year** – plain and searchable
- **Hours Back** – leads with the outcome, suits the reclaim plan and the team product
- **Calendar Rewind** – closest to the Wrapped feeling without the trademark
- **Invite Only** – playful, short

Check the domain, a quick trademark search (UKIPO and EUIPO), and the social handles. Then:

```bash
node tools/rebrand.js "Booked Solid" bookedsolid.app
npm run og
```

That updates the page, config, privacy policy, file names and docs, and regenerates the social image.

## 2. Start Google verification now (it has the longest lead time)

Connect Google Calendar is built and tested against a mocked Google. It stays hidden until `google.clientId` is set in `js/config.js`.

1. Create a Google Cloud project and an OAuth client of type **Web application**. Add your domain as an authorised JavaScript origin.
2. Configure the consent screen with the app name, logo, the homepage, and `https://<domain>/privacy.html` as the privacy policy.
3. Add the single scope `https://www.googleapis.com/auth/calendar.events.readonly`. It is a sensitive scope, so it needs verification.
4. Verify domain ownership in Search Console.
5. Submit for verification with a short screen recording that shows sign-in, the consent screen, and the story built from the events.
6. Until approved, the app works for up to 100 named test users and shows Google's "unverified app" warning. That is fine for a soft launch.

Allow several weeks for this. The file upload path works without it, so it never blocks launch.

## 3. Test a real Outlook tenant (one afternoon)

The parser handles the Outlook formats I could reproduce: Windows time zone names, `Canceled:` titles, busy status, the all-day flag, and published calendars with no attendees. Real tenants vary, so check with a Microsoft 365 trial tenant or your own work account:

| Export path | How | What to check |
|---|---|---|
| Outlook on the web, published | Settings → Calendar → Shared calendars → Publish, "Can view all details", download the ICS link | Does it include attendees? Is the publish option blocked by policy? |
| New Outlook / Outlook for Windows | File → Save Calendar, whole calendar, full details | Attendees, time zones, recurring exceptions |
| Outlook for Mac | File → Export | Same |

For each file:

```bash
node tools/inspect.js ~/Downloads/calendar.ics
```

It prints the producer, time zones, attendee coverage, the detected mode, meeting counts and persona, with titles hidden. If anything looks wrong, add the file (anonymised) to `tests/fixtures/` with a test.

If publishing is commonly blocked, Microsoft Graph sign-in is the equivalent of the Google button. It's a contained change in a new `js/microsoft.js` mirroring `js/google.js`.

## 4. Deploy (an hour)

Cloudflare Pages, no build command, output directory `/`.

| Setting | Value | Needed for |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` | Payments |
| `STRIPE_PRICE_ID` | One-off price, £4 | Personal unlock |
| `STRIPE_TEAM_PRICE_ID` | One-off price, £29 | Team report |
| `UNLOCK_SECRET` | Long random string | Signing unlock tokens |
| `RESEND_API_KEY`, `MAIL_FROM` | From Resend, with your domain verified | Emailing the plan |
| `SUBSCRIBERS` (KV binding) | A KV namespace | January check-in opt-ins |
| `COUNTERS` (KV binding) | A KV namespace | Funnel counts |
| `STATS_TOKEN` | Long random string | Reading counts at `/api/hit?token=...` |

Then set `allowPreviewUnlock: false` in `js/config.js`. Every one of these is optional except Stripe: without the email key the plan falls back to the visitor's own mail app, and without the KV bindings counting quietly switches off.

Before going live, run one real £4 and one real £29 payment end to end and refund them.

## 5. Launch week

Spotify Wrapped has landed in late November or the first week of December in recent years, and the format is top of mind for about ten days afterwards. Plan around it:

| When | What |
|---|---|
| By 20 Nov | Name, domain, deploy, real payments tested |
| 23–27 Nov | Soft launch: 20 to 30 friends and colleagues. Watch the funnel, fix what breaks |
| Spotify Wrapped day | Post your own card on LinkedIn the same morning |
| Next Tuesday to Thursday | Product Hunt, scheduled for 00:01 Pacific |
| Early January | Send the January check-in to everyone who opted in |

Watch these at `/api/hit?token=...`: `story_started` → `story_finished` → `card_saved` / `link_copied` → `unlock_opened` → `unlock_paid`. The biggest drop tells you what to fix next.

## 6. Copy, ready to paste

The numbers below come from the sample calendar. Swap in your own before posting.

**Product Hunt tagline** (55 characters)

> Your year in meetings, as a story you'll want to share

**Product Hunt description**

> Drop in your calendar export and get a Wrapped-style story of your year: hours in meetings, your worst week, the person you saw most, and the persona your calendar earned you. Then a plan to get time back. It all runs in your browser, nothing is uploaded.

**Maker comment**

> I spend my working life helping teams understand where their systems spend time. I'd never once looked at where mine went. So I built this: your calendar file goes in, a story comes out, and nothing leaves your device. It found 271 hours I could realistically get back next year, mostly from two recurring meetings. There's a team version too, which shows the meetings everyone shares and costs them in person-hours. I'd love to know what your persona is.

**LinkedIn post**

> I spent 428 hours in meetings this year. That's nearly 11 working weeks.
>
> I only know because I built a little tool that turns your calendar into a Spotify Wrapped-style story. My persona is apparently "The Road Warrior".
>
> The useful bit is at the end: it looks at your recurring meetings and tells you exactly which changes give the most time back. For me it's two meetings that should be fortnightly, and I'd never have spotted it.
>
> Your calendar never leaves your browser. Try it here: [link]
>
> What did yours say?

**Short post for X / Threads**

> I spent 428 hours in meetings this year. Made a thing that tells you yours, privately, in about 30 seconds. My persona: The Road Warrior. What's yours? [link]
