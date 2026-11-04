# Calendar Wrapped

Your year, in meetings. Drop in a calendar export, or connect Google Calendar, and get a Wrapped-style story, a share card in four formats, a persona, and a ranked plan for getting time back. Works for work and personal calendars, and for whole teams.

Everything runs in the browser. Nothing is uploaded. The only server code is four small Cloudflare Pages functions for payments, emailing the plan, and anonymous counts.

Launching? Read [LAUNCH.md](LAUNCH.md) first.

## Run it

```bash
npm run dev
```

Open http://localhost:4173 and click **See a demo**. Add `?demo=personal` for the personal sample. Drop one `.ics` anywhere for a personal story, or several for a team report.

```bash
npm test                       # 24 tests: parser, stats, team, Google, Outlook, links, server functions
npm run inspect -- file.ics    # diagnose a real export, titles hidden
npm run rebrand -- "Name" domain.app
npm run og                     # regenerate og.png (needs Playwright and the dev server)
npm run sample                 # regenerate sample calendars and fixtures
```

No build step and no runtime dependencies. The ICS parser (`vendor/ical.js`, MPL-2.0) is vendored.

## What's in it

| Feature | Where |
|---|---|
| ICS parsing, recurrence, time zones, Outlook quirks, de-duplication | `js/ics.js` |
| Google Calendar connect: token in memory, revoked after loading | `js/google.js` |
| Stats engine, personas, reclaim plan, team maths | `js/stats.js` |
| Story slides, player, per-slide share, sound and haptics, screen-reader narration | `js/slides.js`, `js/story.js`, `js/sound.js` |
| Share cards in portrait, square, story and wide; names hidden by default | `js/card.js` |
| Shareable links that carry the card in the URL fragment | `js/share.js` |
| Team mode, £29 | `js/team.js` |
| Unlocks for personal and team | `js/pay.js` |
| Email or copy the plan | `js/plan.js`, `functions/api/subscribe.js` |
| Anonymous funnel counters | `js/analytics.js`, `functions/api/hit.js` |
| Light and dark appearance, following the system | `styles.css` |
| Brand, prices, Google client ID, toggles | `js/config.js` |

## How the numbers are counted

- A **meeting** is a timed event, not cancelled, that you didn't decline, between 5 minutes and 8 hours, with at least one other person, or an organiser who isn't you. Focus time, lunch and holds with nobody else are ignored, as are room-only bookings.
- When an export has **no attendee data** (Outlook's published calendars, many Apple exports), every timed event counts. Whether it's a work calendar is then judged by office-hours share and video-call links.
- **People** rankings ignore meetings with more than 25 people, so an all-hands doesn't swamp them.
- **Share of working time** assumes a 40-hour week over the working days elapsed so far this year.
- **Travel** and **days off** come from titles and Google's out-of-office entries. Treat them as a best guess.
- **Reclaim** estimates are annualised and conservative. The free suggestion is the most specific one, usually a change to a named meeting.
- **Team** shared meetings are matched by event UID, which Google and Exchange keep identical across attendees.

## Privacy model

- Calendar data never leaves the device, except the plan text when someone asks for it by email.
- Share links put the card's numbers in the URL fragment, which isn't sent to servers. Names and titles are off unless switched on.
- Counters store one daily total per event name. No cookies, IDs or IPs.
- The privacy policy at `privacy.html` matches this, and covers Google's Limited Use wording for verification.

## Known limits

- Social previews of shared links show the generic `og.png`, because crawlers don't see the URL fragment. A per-card preview needs server-side image rendering.
- Unlocks are stored per device in `localStorage`. A determined person can bypass a £4 unlock, and that's fine.
- Outlook formats were tested with reproduced files, not a live tenant. See LAUNCH.md for the test plan.
