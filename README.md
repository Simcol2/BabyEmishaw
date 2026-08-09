# Baby Emishaw · Guess the Day

A guess-the-due-date game for the baby shower. Guests submit one guess each
(date, time, place, who she'll be with, plus a bonus middle-name guess), see
everyone else's picks on a shared calendar board, and the host can reveal the
real due date, run a live countdown, and crown the closest guess after the
birth.

## How it's built

- `index.html` — the entire game (markup, styles, client JS). Static, no
  build step.
- `api/storage.js` — a small serverless function that the page calls for
  anything that needs to be **shared across every guest's phone** (guesses,
  the reveal state). It's backed by [Upstash Redis](https://upstash.com) via
  `@upstash/redis` in production. `api/_lib/kv.js` holds the actual
  read/write logic, shared with the cron function below.
- Anything **private to one phone** (which entry is "mine") is kept in that
  browser's `localStorage` and never leaves the device.
- `api/cron/daily-reminder.js` — runs once a day (see `vercel.json`). If any
  guess's date is today, it emails everyone who left a reminder address —
  every subscriber gets notified for every guessed day on the board, not
  just the day they personally picked. Sends through
  [Resend](https://resend.com).
- `api/broadcast.js` — lets Britt send an ad-hoc email to every subscriber
  on demand (a false-labor update, a "today might be the day" heads up),
  separate from the automatic daily reminder. Shares the same mail sender
  (`api/_lib/mail.js`) as the cron function.

## Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this from the
   repo).
2. In the [Vercel dashboard](https://vercel.com/new), import the
   `Simcol2/BabyEmishaw` repository. No build settings are needed — Vercel
   auto-detects the static `index.html` and the `api/` serverless function.
3. **Connect a Redis store** (required — without this, guesses appear to
   save but silently vanish, see "Why did my guess disappear?" below):
   - In the Vercel project, open the **Storage** tab.
   - Vercel's standalone "KV" product was retired and folded into the
     **Marketplace**, so look for **Create Database** / **Browse
     Marketplace** and pick a Redis provider (**Upstash** is the standard
     one — "Upstash for Redis").
   - Create it, then **Connect** it to this project.
   - Vercel injects the store's env vars automatically on connect. Depending
     on the exact flow it may use either `KV_REST_API_URL` /
     `KV_REST_API_TOKEN` (legacy KV-compatible names) or
     `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (native Upstash
     names) — `api/_lib/kv.js` checks for both, so either is fine. Open
     **Settings → Environment Variables** afterward and confirm one of those
     pairs is actually there.
   - Redeploy (Vercel usually does this automatically once the store is
     connected — check the Deployments tab for a fresh one).

**Why did my guess disappear?** Without a connected store, `api/_lib/kv.js`
silently falls back to an in-memory `Map`. That fallback only lives for the
life of one serverless function instance — Vercel spins up separate,
short-lived instances per request, so "memory" from one guess is often gone
by the time the next request comes in (different instance, cold start,
redeploy). The form and board still work, so nothing *looks* broken, but
nothing durable is actually being saved. If guesses vanish, it means step 3
above isn't actually wired up yet — go check the Storage tab and the env
vars.

4. **Set up email reminders** (optional — the board works fine without
   this, guests just won't be able to leave a reminder email that actually
   sends anything):
   - Sign up at [resend.com](https://resend.com) and create an API key.
   - In the Vercel project's **Settings → Environment Variables**, add:
     - `RESEND_API_KEY` — the key from Resend.
     - `CRON_SECRET` — any random string you make up. Vercel automatically
       sends it as a bearer token when it triggers the cron job, which
       stops anyone else from hitting that URL to spam guests on demand.
     - `FROM_EMAIL` (optional) — defaults to
       `Baby Emishaw <onboarding@resend.dev>`, which works out of the box
       with no domain setup. Verify your own domain in Resend and set this
       if you want a nicer from-address.
     - `SITE_URL` (optional) — your deployed URL, included as a link in the
       reminder emails.
   - Redeploy after adding the env vars.
   - The cron is scheduled in `vercel.json` (`0 13 * * *`, i.e. 13:00 UTC /
     9am US Eastern daily) — edit that if you want a different time.
     Vercel's cron schedules always run in UTC.

## Local development

```bash
npm install
npx vercel dev
```

`vercel dev` runs the static file and the `/api/storage` function together
on `localhost`. Without a linked KV store it uses the in-memory fallback,
which is fine for trying things out locally (data resets whenever the dev
server restarts).

## Host / admin access

Tap the ✦ mark in the footer five times to open the host panel. The
passcode is set in `index.html`:

```js
const HOST_PASSCODE = "EMISHAW2026";
```

Change it to whatever you like before sharing the link. Note this is a soft
gate for a party game, not real security — the passcode lives in the page's
source code, so don't put anything sensitive behind it.

From the host panel you can:
- Reveal the real due date (starts the live countdown for all guests)
- Hide it again
- Enter the actual birth date to crown the closest guess
- Copy every email address guests left for reminders
- See all the bonus middle-name guesses
- Clear every entry and start over

It's reachable two ways: the secret tap, or going straight to `/admin`
(e.g. `https://your-project.vercel.app/admin`) — both land on the same
passcode gate.

## Britt's page

`/BabyEmishaw` (e.g. `https://your-project.vercel.app/BabyEmishaw`) is a
separate, separately-gated page just for Britt. Passcode:

```js
const BRITT_PASSCODE = "6132";
```

Change it in `index.html` the same way as the host passcode — same caveat,
it's a soft gate, not real security. This page is deliberately kept
separate from the host panel above: **notes guests leave for Britt only
ever appear here**, never in the general host panel, so the person running
logistics doesn't necessarily see them.

From her page Britt can:
- See every guess, including each guest's note to her inline
- Send an on-demand email update to every subscriber — two one-tap presets
  ("false labor, still waiting" / "I think today's the day") that fill in
  the message box, or her own custom text — via `POST /api/broadcast`

The broadcast endpoint checks the passcode server-side too (against a
`BRITT_PASSCODE` env var, falling back to `6132` if it's not set) so the
URL can't be hit blindly to spam guests — set that env var in Vercel if you
change the passcode in the page, so the two stay in sync.

## Configuration

- `DEFAULT_DUE` in `index.html` sets the placeholder due date shown before
  the host reveals the real one, and is used as a fallback if the host
  reveals without picking a date.
- The calendar board is hardcoded to **October 2026**; guesses outside that
  month (allowed by the date picker's min/max) still save and show up in an
  "Outside October" list beneath the calendar.
- The guess form's date field defaults to today's date (clamped to the
  picker's min/max) rather than a fixed date, so the form itself never
  hints at which day is the real due date.
