# Calendar Wrapped

Your year, in meetings. Drop in a calendar export, or sign in with Google or Microsoft, and get a Wrapped-style story with hand-built visuals, a share card in four formats, a 9:16 story video, your time off and birthdays, a planner for next year's best days off, a persona, and a ranked plan for getting time back with one-tap actions. Works for work and personal calendars, for whole teams, and in English, Dutch, Swedish, Norwegian and Danish.

Calendars are read and analysed in the browser, off the main thread. They are never uploaded. The server side is a handful of Cloudflare Pages Functions plus one scheduled Worker.

Launching? Read [LAUNCH.md](LAUNCH.md).

## Run it

```bash
npm run dev
```

Open http://localhost:4173 and click **See a demo**. Add `?demo=personal` for the personal sample and `?lang=nl` (or `sv`, `nb`, `da`) for another language. Drop one `.ics` (or Google's export `.zip` as it comes) for a personal story. Drop several and it asks: your own work and personal calendars combined, or a team report.

```bash
npm test                         # 70 unit tests
npm run e2e                      # headless Chromium end to end (needs Playwright)
npm run inspect -- file.ics      # diagnose a real export, titles hidden
npm run rebrand -- "Name" domain.app
npm run og                       # regenerate og.png
npm run offline                  # after changing app files: regenerate sw.js and _headers (a test checks)
npm run sample                   # regenerate samples and fixtures
node tools/i18n-check.js nl      # check a translation
```

To test against the real functions, run them with Wrangler and point the e2e suite at it:

```bash
npx wrangler pages dev . --kv BENCH --kv COUNTERS --kv SUBSCRIBERS --kv REFERRALS
```

```bash
E2E_BASE=http://localhost:8788 npm run e2e
```

No build step. Runtime dependencies are vendored: the display typeface, Bricolage Grotesque (`fonts/`, SIL OFL; self-hosted so no font request goes to a third party), the ICS parser (`vendor/ical.js`, MPL-2.0), the MP4 muxer for story videos (`vendor/mp4-muxer.js`, MIT), and for link previews the resvg renderer (`functions/_vendor/resvg.wasm`, MPL-2.0) and Inter (`functions/_vendor/fonts.js`, SIL OFL).

## Look and feel

The year as a tear-off desk calendar. System text for reading, Bricolage Grotesque (condensed, heavy) for numbers and headlines, two-tone story pages (coloured ink on coloured paper, `.c-*` in `styles.css` and `THEME_COLOURS` in `js/card.js`), a tear-off page turn in the story, and a flip-calendar word on the landing page. Every story page is checked to fit a 375×667 phone in English and Dutch.

## What's where

| Area | Files |
|---|---|
| Parsing: ICS, recurrence, time zones, Outlook quirks, de-duplication | `js/ics.js` |
| Sign-in: Google (token client) and Microsoft (PKCE popup), tokens never stored | `js/google.js`, `js/microsoft.js`, `auth-callback.html` |
| Engine in a Web Worker, with in-page fallback | `js/engine.js`, `js/engine-core.js`, `js/worker.js` |
| Stats, personas, reclaim plan, year over year, team maths, benchmarks, time off, birthdays | `js/stats.js` |
| Public holidays for eleven countries, best-days-off planner | `js/holidays.js` |
| Things the calendar missed: time off, trips and moments added by hand; highlights | `js/extras.js` |
| Time off, planner and birthday slides and panels | `js/timeoff-ui.js` |
| All generated wording, translatable | `js/copy.js` |
| Visualisations, all hand-drawn SVG | `js/viz.js` |
| Flights globe: routes from flight entries, canvas globe | `js/geo.js`, `js/globe.js`, `js/geo/*` (data: `tools/make-geo.mjs`, credits in `js/geo/LICENSES.md`) |
| Story, slides, sound and haptics, screen-reader narration | `js/slides.js`, `js/story.js`, `js/sound.js` |
| One-tap actions: organiser messages, calendar blocks, settings steps | `js/actions.js`, `js/reclaim-ui.js` |
| Share cards, links, comparisons | `js/card.js`, `js/model.js`, `js/share.js` |
| Meeting types (customers, internal, 1:1s, your own groups) | `js/meeting-mix.js`, `js/mix-ui.js` |
| What shared things show: no names, hide customers, or everything | `js/privacy.js` |
| Story video: 9:16 MP4 drawn and encoded on the device (WebCodecs, MediaRecorder fallback) | `js/video.js`, `js/video-ui.js` |
| Unlock by sharing: invite codes on share links, three friends unlock | `js/referral.js`, `functions/api/referral.js` |
| Team mode | `js/team.js` |
| Payments: one-off personal unlock, monthly team plan | `js/pay.js`, `functions/api/checkout.js`, `verify.js`, `entitlement.js`, `portal.js` |
| Link previews: per-card page and PNG | `functions/c/[token].js`, `functions/og/[token].js`, `functions/_lib/card-svg.js` |
| Email the plan, quarterly check-ins, unsubscribe | `functions/api/subscribe.js`, `unsubscribe.js`, `workers/reminders/` |
| Benchmarks | `js/bench.js`, `functions/api/bench.js` |
| Funnel, errors, Web Vitals, Grafana dashboard | `js/analytics.js`, `functions/api/hit.js`, `grafana/dashboard.json` |
| Languages | `js/i18n.js`, `js/i18n/*.js`, `tools/i18n-*.js` |
| Tester tools | `diagnose.html`, `js/anonymise.js`, `tools/inspect.js` |
| Brand, prices, sign-in client IDs, toggles | `js/config.js` |
| Deploy: Workers entry and config (also deploys as Pages) | `worker/index.js`, `wrangler.jsonc`, `.assetsignore` |

## How the numbers are counted

- A **meeting** is a timed event, not cancelled, that you didn't decline, between 5 minutes and 8 hours, with at least one other person or an organiser who isn't you. Focus time, lunch, holds and room-only bookings don't count.
- With **no attendee data** (Outlook web publishing, many Apple exports), every timed event counts, and whether it's a work calendar is judged by office-hours share and video-call links.
- **People** rankings ignore meetings with more than 25 people.
- **Share of working time** uses the working week chosen on the prep screen. It defaults by language: 37.5 hours in English and Norwegian, 40 in Dutch and Swedish, 37 in Danish.
- **Year over year** compares this year's pace with last year's full year when the export covers at least nine months of it.
- **Flights** become routes when a title or location names an airport code ("LHR → ARN", "London Heathrow (LHR)") or a city ("Flight to Stockholm", "Vlucht naar Kopenhagen"). A leg with no origin starts from the previous destination within three weeks, otherwise from home. Home is the most common origin, or the calendar's time-zone city. Places data loads only when flights are found.
- **Travel** comes from titles in five languages.
- **Work and personal together.** Each calendar is tagged work or personal (guessed, changeable on the prep screen) and each event keeps its calendar's owner. The story is about the chosen type: meetings only ever come from work calendars, plans from personal ones, while trips, time off and birthdays come from all. With both, a Work and life page compares meeting hours with personal plans, double-bookings, and evening and weekend meetings.
- **Leaving things out.** Words on the prep screen, or titles unticked on the summary, are removed before anything is counted, so the story, card and report agree. Kept with the results (30 days, or this tab only).
- **Only your own leave counts.** Colleagues' leave notices land in your calendar too, often accepted, so an entry counts only if you made it, nobody else is on it, or it was sent to you alone without naming the sender (an HR system booking it). Declined entries never count.
- **Time off** is all-day (or six-hour-plus) entries with a leave title in five languages ("Annual leave", "Vakantie", "Semester"…) or Outlook's and Google's out-of-office status. Personal calendars also count hotel and Airbnb stays. It's counted in working days, so weekends and public holidays inside a break don't count. Sick days are counted apart, and entries titled "Bank holiday" aren't leave. Days after today are "booked". A break is leave days joined by weekends or public holidays. A break's place comes from its title ("Holiday - Cornwall") or a flight landing during it.
- **Public holidays** cover England and Wales, Scotland, Northern Ireland, Ireland, the Netherlands, Belgium, Luxembourg, Sweden, Norway, Denmark and Finland, picked on the prep screen. The default is the calendar's own time zone (Outlook's Windows names too), then the browser's, then the language, and a choice is remembered on the device. Weekend holidays move to the next weekday where the UK and Ireland do that. Days most people get off in practice are included (Midsummer Eve and Christmas Eve in Sweden and Finland, New Year's Eve in Sweden, Dutch Liberation Day in lustrum years).
- **Best days off** looks at each public holiday on a weekday and finds up to five days of leave that add the most free days around it, keeping only windows that at least double the leave. The story shows the best three; the summary shows up to five, each with an "Add to calendar" file.
- **Things added by hand** on the prep screen are kept per year on the device. Time off becomes an out-of-office block; a trip becomes a flight out and a flight home (and time off when it was a holiday); moments only appear in the highlights. None of them ever count as meetings or plans.
- **Highlights** are the moments someone added, plus up to three the calendar makes obvious: the longest break of five days or more, milestone birthdays, and the furthest trip of 1,500 km or more. The slide shows when there's one moment added, or three highlights in all.
- **Birthdays** are entries with a birthday word in five languages, one per person per year. Names and ages come from titles like "Sam's birthday", "Grandma turns 90", "Verjaardag oma" or "Kim fylder 50". Ages ending in 0, and 18 and 21, are milestones.
- **Does this look right?** The summary flags numbers that usually mean the file isn't what it seems: leave more than 12 days over the country's usual, meetings over 70% of working time (or no attendee data at all), long meetings of four hours or more making up 15% of meeting time, and meetings with other people on them but not you (a shared calendar's). Each lists what's behind it, so one tap leaves it out; "It's right" hides the check.
- **Meeting types.** A meeting with anyone from outside your organisation's email domain is a customer meeting (personal mail domains like Gmail never name a company). Only colleagues: internal, or a 1:1 with one of them. Your own groups ("AE meetings") match by title words, or by people's names or emails; a title match always wins, while people only claim meetings without customers, so a customer call your account executive joins stays a customer call. Companies are named from their domain (acme-customer.co.uk → Acme Customer).
- **Hiding customers** blanks, in everything shared, the company names, the full, first and last names of outside people (unless a colleague shares that name), and any words added by hand. Outsiders drop out of "most seen", top customers become Customer A, B, C, and reclaim suggestions are reduced to their totals. The story you watch yourself shows everything.
- **Reclaim** estimates are annualised and conservative. The free suggestion is the most specific one, usually a named meeting.
- **Team** shared meetings are matched by event UID, which Google and Exchange keep identical across attendees.

## Privacy model

For IT and security teams, `security.html` sets this out with the data flows and how to check them.


- Calendar data never leaves the device. The only exception is the plan text, and only when someone asks for it by email.
- A Content Security Policy enforces it: the browser may only connect to the site itself, and Google or Microsoft for sign-in. One source in `js/security-headers.js`, written to `_headers` for static files and added in code to server-built pages. No inline scripts.
- Results (which include names and titles) are kept in the browser for 30 days, or only in the tab with **Keep results on this device** off. Start over clears them. See `js/vault.js`.
- A service worker keeps a copy of the app, so it works with the network off: the simplest proof nothing is sent.
- Error reports carry the error's shape only, scrubbed in the browser and again on the server (`js/scrub.js`). Worker request logging is off.
- Share links carry a card's numbers, without names or titles unless switched on. A middle setting keeps colleagues' names and hides customers; slide images, the video and the carousel follow the same setting (`js/privacy.js`). The server reads a link only to draw its preview image, and stores nothing.
- Benchmarks receive a few rounded numbers, only after someone taps **Compare with others**.
- Until someone unlocks, their share links carry a random invite code. When a friend makes their own Wrapped from a real calendar (demos don't count), the server stores a count against that code and a salted hash of the friend's random code. Videos are made on the device.
- Analytics are daily counts per event name, plus error messages and Web Vitals. There are no cookies, IDs or IP addresses.
- `privacy.html` says all of this, including Google's Limited Use wording.

## Known limits

- Translations were machine-drafted and validated for completeness, not by native speakers. See LAUNCH.md.
- Outlook formats were tested with reproduced files and a mocked Microsoft Graph, not a live tenant.
- Unlocks are stored per device. A determined person can bypass a £4 unlock, or fake three friends, and that's fine. The team plan is re-checked against Stripe daily.
- Story videos need WebCodecs (Chrome, Edge, Safari 16.4+) for a fast MP4. Firefox falls back to recording in real time (about 30 seconds), as WebM. Emoji in the video come from the device's own emoji font.
