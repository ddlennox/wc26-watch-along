# World Cup '26 Watch-Along

A small group site for coordinating where everyone's watching the 2026 World Cup —
across Barnstaple, Brighton, Crawley, London, Hale (Altrincham) and the Malta crew.

## What it does

- **Fixtures** — England's three Group L games with UK kick-off times and channels
  (Croatia 17 Jun / Ghana 23 Jun / Panama 27 Jun), plus a live countdown to the
  11 June opener. All games are free-to-air on BBC/ITV.
- **The Odds** — outright winner prices (Spain, France, England leading) and a
  win/draw/win strip on each England fixture. For sweepstake banter, not gospel.
- **The Pubs** — real, football-friendly pubs in all six towns, filterable by town,
  each with rating and a map link.
- **Who's Watching Where** — the core feature. Anyone posts a plan (game, town,
  venue, time, note) and ticks whether others can join. The board is **shared across
  the whole group** via a serverless function backed by Netlify Blobs, and polls
  every 20 seconds to stay in sync. Identity is a name stored locally per device.

## Structure

```
index.html                    Front-end (all CSS/JS inline, no build step)
netlify/functions/plans.mjs   Serverless function: GET/POST/DELETE plans in Netlify Blobs
package.json                  Declares @netlify/blobs
netlify.toml                  Points Netlify at the functions folder
```

## How the data layer works

The board talks to `/api/plans`:
- `GET` returns all plans
- `POST` upserts one plan (used for both posting and join/leave)
- `DELETE ?id=` removes one

The function uses one shared Blobs store (`wc-plans`) with strong consistency, so a
posted plan appears immediately. Netlify injects the Blobs credentials into the
function at runtime — nothing to configure.

If `/api/plans` is ever unreachable (e.g. the file is opened straight off disk), the
front-end quietly falls back to this browser's `localStorage`, so it still runs —
just per-device instead of shared. The board shows which mode it's in.

## Deploy

Plain drag-and-drop won't work here — there's a function with an npm dependency, and
Netlify Drop doesn't run `npm install`. Use one of these:

**CLI (quickest):**
```
npm install -g netlify-cli
npm install
netlify deploy --prod
```

**Git (durable, auto-deploys on push):**
Push this folder to a GitHub repo, then in Netlify: Add new site → Import from Git.
Leave the build command blank, set publish directory to `.`. Netlify runs
`npm install` and bundles the function on every push.

**Local test:**
```
netlify dev
```
Runs the function and a local Blobs store together, so the board works on localhost.

## Known limitations / next steps

- **Open endpoint.** `/api/plans` is currently unauthenticated — anyone with the URL
  can post or delete. Fine for a mates' PoC; add a shared secret or Netlify Identity
  before any wider use.
- **Polling, not real-time.** The board refreshes every 20s. Fine for this; could move
  to a push approach later if wanted.
- **Pub data is general.** Listed pubs show football as a rule, but listings aren't
  confirmed World Cup fixtures — worth a quick call re: late licences (UK pubs can stay
  open to 2am on home-nation match days).
- **Ghana odds are indicative** until the books firm up; Croatia and Panama are live prices.
- **Ideas not yet built:** sweepstake/random-team draw, Golden Boot odds, the full
  104-match fixture list beyond England.
```
