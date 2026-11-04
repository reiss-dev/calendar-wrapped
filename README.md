# Calendar Wrapped

Your year, in meetings. Drop in a calendar export, or sign in with Google or Microsoft, and get a Wrapped-style story with hand-built visuals, a share card in four formats, a persona, and a ranked plan for getting time back with one-tap actions. Works for work and personal calendars, for whole teams, and in English, Dutch, Swedish, Norwegian and Danish.

Calendars are read and analysed in the browser, off the main thread. They are never uploaded. The server side is a handful of Cloudflare Pages Functions plus one scheduled Worker.

Launching? Read [LAUNCH.md](LAUNCH.md).

## Run it

```bash
npm run dev
```

Open http://localhost:4173 and click **See a demo**. Add `?demo=personal` for the personal sample and `?lang=nl` (or `sv`, `nb`, `da`) for another language. Drop one `.ics` for a personal story, or several for a team report.

```bash
npm test                         # 45 unit tests
npm run e2e                      # headless Chromium end to end (needs Playwright)
npm run inspect -- file.ics      # diagnose a real export, titles hidden
npm run rebrand -- "Name" domain.app
npm run og                       # regenerate og.png
npm run sample                   # regenerate samples and fixtures
node tools/i18n-check.js nl      # check a translation
```

To test against the real functions, run them with Wrangler and point the e2e suite at it:

```bash
npx wrangler pages dev . --kv BENCH --kv COUNTERS --kv SUBSCRIBERS
```

```bash
E2E_BASE=http://localhost:8788 npm run e2e
```

No build step. Runtime dependencies are vendored: the ICS parser (`vendor/ical.js`, MPL-2.0), and for link previews the resvg renderer (`functions/_vendor/resvg.wasm`, MPL-2.0) and Inter (`functions/_vendor/fonts.js`, SIL OFL).

## What's where

| Area | Files |
|---|---|
| Parsing: ICS, recurrence, time zones, Outlook quirks, de-duplication | `js/ics.js` |
| Sign-in: Google (token client) and Microsoft (PKCE popup), tokens never stored | `js/google.js`, `js/microsoft.js`, `auth-callback.html` |
| Engine in a Web Worker, with in-page fallback | `js/engine.js`, `js/engine-core.js`, `js/worker.js` |
| Stats, personas, reclaim plan, year over year, team maths, benchmarks | `js/stats.js` |
| All generated wording, translatable | `js/copy.js` |
| Visualisations, all hand-drawn SVG | `js/viz.js` |
| Flights globe: routes from flight entries, canvas globe | `js/geo.js`, `js/globe.js`, `js/geo/*` (data: `tools/make-geo.mjs`, credits in `js/geo/LICENSES.md`) |
| Story, slides, sound and haptics, screen-reader narration | `js/slides.js`, `js/story.js`, `js/sound.js` |
| One-tap actions: organiser messages, calendar blocks, settings steps | `js/actions.js`, `js/reclaim-ui.js` |
| Share cards, links, comparisons | `js/card.js`, `js/model.js`, `js/share.js` |
| Team mode | `js/team.js` |
| Payments: one-off personal unlock, monthly team plan | `js/pay.js`, `functions/api/checkout.js`, `verify.js`, `entitlement.js`, `portal.js` |
| Link previews: per-card page and PNG | `functions/c/[token].js`, `functions/og/[token].js`, `functions/_lib/card-svg.js` |
| Email the plan, quarterly check-ins, unsubscribe | `functions/api/subscribe.js`, `unsubscribe.js`, `workers/reminders/` |
| Benchmarks | `js/bench.js`, `functions/api/bench.js` |
| Funnel, errors, Web Vitals, Grafana dashboard | `js/analytics.js`, `functions/api/hit.js`, `grafana/dashboard.json` |
| Languages | `js/i18n.js`, `js/i18n/*.js`, `tools/i18n-*.js` |
| Tester tools | `diagnose.html`, `js/anonymise.js`, `tools/inspect.js` |
| Brand, prices, sign-in client IDs, toggles | `js/config.js` |

## How the numbers are counted

- A **meeting** is a timed event, not cancelled, that you didn't decline, between 5 minutes and 8 hours, with at least one other person or an organiser who isn't you. Focus time, lunch, holds and room-only bookings don't count.
- With **no attendee data** (Outlook web publishing, many Apple exports), every timed event counts, and whether it's a work calendar is judged by office-hours share and video-call links.
- **People** rankings ignore meetings with more than 25 people.
- **Share of working time** uses the working week chosen on the prep screen. It defaults by language: 37.5 hours in English and Norwegian, 40 in Dutch and Swedish, 37 in Danish.
- **Year over year** compares this year's pace with last year's full year when the export covers at least nine months of it.
- **Flights** become routes when a title or location names an airport code ("LHR → ARN", "London Heathrow (LHR)") or a city ("Flight to Stockholm", "Vlucht naar Kopenhagen"). A leg with no origin starts from the previous destination within three weeks, otherwise from home. Home is the most common origin, or the calendar's time-zone city. Places data loads only when flights are found.
- **Travel and days off** come from titles in five languages and from Google's and Outlook's out-of-office entries.
- **Reclaim** estimates are annualised and conservative. The free suggestion is the most specific one, usually a named meeting.
- **Team** shared meetings are matched by event UID, which Google and Exchange keep identical across attendees.

## Privacy model

- Calendar data never leaves the device. The only exception is the plan text, and only when someone asks for it by email.
- Share links carry a card's numbers, without names or titles unless switched on. The server reads a link only to draw its preview image, and stores nothing.
- Benchmarks receive a few rounded numbers, only after someone taps **Compare with others**.
- Analytics are daily counts per event name, plus error messages and Web Vitals. There are no cookies, IDs or IP addresses.
- `privacy.html` says all of this, including Google's Limited Use wording.

## Known limits

- Translations were machine-drafted and validated for completeness, not by native speakers. See LAUNCH.md.
- Outlook formats were tested with reproduced files and a mocked Microsoft Graph, not a live tenant.
- Unlocks are stored per device. A determined person can bypass a £4 unlock, and that's fine. The team plan is re-checked against Stripe daily.
