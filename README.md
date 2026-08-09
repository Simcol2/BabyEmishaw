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
  the reveal state). It's backed by [Vercel KV](https://vercel.com/docs/storage/vercel-kv)
  (Upstash Redis) in production.
- Anything **private to one phone** (which entry is "mine") is kept in that
  browser's `localStorage` and never leaves the device.

## Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this from the
   repo).
2. In the [Vercel dashboard](https://vercel.com/new), import the
   `Simcol2/BabyEmishaw` repository. No build settings are needed — Vercel
   auto-detects the static `index.html` and the `api/` serverless function.
3. **Connect a KV store** (required for guesses to be shared between
   guests):
   - In the new Vercel project, go to **Storage → Create Database → KV**
     (Upstash Redis under the hood).
   - Create it and choose **Connect to Project** for this project.
   - Vercel automatically injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`
     into the project's environment variables — no manual copy/paste needed.
   - Redeploy (or it will redeploy automatically once the store is linked).

Without a connected KV store, `api/storage.js` falls back to an in-memory
store so the app still *runs*, but guesses won't persist or be shared
between visitors in production — only useful for local testing.

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

## Configuration

- `DEFAULT_DUE` in `index.html` sets the placeholder due date shown before
  the host reveals the real one, and is used as a fallback if the host
  reveals without picking a date.
- The calendar board is hardcoded to **October 2026**; guesses outside that
  month (allowed by the date picker's min/max) still save and show up in an
  "Outside October" list beneath the calendar.
