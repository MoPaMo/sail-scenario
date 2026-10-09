# Sail Scenario Workshop

An unofficial, fan-made web tool for designing custom scenarios for **Sail** (Akiyama Koryo & Kozu Yusei, Allplay 2023). Players place tokens on the ocean board, get an instant check of whether the scenario is playable, print it as a scenario-book card, and publish it to a shared gallery.

Built with Next.js 16 (App Router), React 19 and TypeScript. Ready to deploy on Vercel.

## Features

- **Board editor** with the real board geometry: rows A–G, columns 1–25, tapering to D1 and D25 (79 spaces).
- **Token limits from the box.** You can't place more than the game contains (see below).
- **Course check:** reachability, shortest route, unavoidable kraken spaces, storm deadlines (round 2 / round 4), and dead-end spaces the ship can enter but never leave towards the End. The best route and dead ends are drawn on the map.
- **Scenario card** in the scenario book's format (START / ISLAND / KRAKEN / END / STORM), plus a print layout that fits board and card on one A4 landscape page.
- **Start from** any of the six printed scenarios. Publishing an unchanged copy is blocked.
- **Share links** that encode the layout in readable coordinates: `/?s=D1&e=D17&i=D3.G6&k=G4.A6&w=5.12&t=Name`.
- **Undo/redo**, drag-to-paint with a mouse, autosaved drafts (browser storage), keyboard shortcuts.
- **Responsive.** On phones the board turns upright (start at the top) so spaces stay tappable, and the token palette becomes a bottom bar.
- **Accessible.** The board is a keyboard grid (arrow keys move, Enter places, Delete removes), with visible focus and reduced-motion support.
- **Publishing** with a **Cloudflare Turnstile captcha**, a multilingual **profanity filter** on the scenario name, author name and notes, rule validation on the server, and per-IP rate limiting.
- **Private edit links:** authors can enter an email address when publishing and get a secret link for editing or deleting the scenario later. The address is used once and never stored.
- **Gallery** and a shareable page per scenario with "Remix in the editor". Spoilers (best route, dead ends, move counts) stay hidden until a player taps **Show tips**.
- Optional **Seafarers expansion tokens** (whirlpool, ally ship, crow's nest).

## Token inventory

| Token | In the box | Notes |
|---|---|---|
| Start | 1 | single space |
| End | 1 | chevron covering 3 spaces, e.g. C10, E10, D11 |
| Island | 12 | ship can't enter |
| Kraken | 9 | entering it damages the ship |
| Storm | 4 | used in pairs (cloud above + below a column), so **max 2 storms** |
| Whirlpool, Ally ship, Crow's nest | 2 each | Seafarers expansion only |

Sources: the Allplay base-game rulebook component list ("26 Tokens: 1 Start, 1 End, 12 Island, 9 Kraken, 4 Storm") and the Seafarers expansion contents ("2 Whirlpool, 2 Ally Ship, 2 Crow's Nest Tokens"). The editor places expansion tokens but doesn't model their effects in the course check, because their rules aren't public; the expansion's rulesheet applies at the table.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests (board model, analysis, profanity, submission flow)
npm run typecheck
```

With no environment variables set, the app uses Cloudflare's always-pass test captcha keys and stores scenarios in memory. Everything works locally, but published scenarios disappear on restart.

## Deploy to Vercel

1. **Push this folder to a Git repository** (GitHub, GitLab or Bitbucket) and import it at [vercel.com/new](https://vercel.com/new). Vercel detects Next.js; no build settings need changing. (Or run `npx vercel` in the folder.)

2. **Add storage**: in the project's **Storage** tab, add **Upstash for Redis** from the Marketplace and connect it to the project. It injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`. (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` work too.) Without it, the gallery and dialog show a "no database connected" notice.

3. **Add the captcha keys**: in the Cloudflare dashboard, open **Turnstile → Add widget**, add your Vercel domain (and any custom domain) as hostnames, and choose "Managed" mode. Then set in Vercel → Settings → Environment Variables:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = the site key
   - `TURNSTILE_SECRET_KEY` = the secret key

   Set both or neither. With neither, the site runs on test keys and the publish dialog says so. With only one, publishing is refused with an explanation.

4. **Email edit links** (optional): with a domain verified in [Resend](https://resend.com) (here `sail.mopamo.dev`), set `resend_secret` to the Resend API key (`RESEND_SECRET` and `RESEND_API_KEY` work too). The sender defaults to `Sail Scenario Workshop <noreply@sail.mopamo.dev>` (override with `EMAIL_FROM`) and links point to `SITE_URL`, else the Vercel production domain, else `https://sail.mopamo.dev`. Without a key, the email field simply doesn't appear.

5. Optional: set `ADMIN_TOKEN` (16+ random characters) to enable moderation deletes.

6. **Redeploy** so the new variables take effect. `NEXT_PUBLIC_*` values are baked in at build time.

See `.env.example` for the full list.

## Edit links and privacy

When an author enters an email address while publishing:

1. The server creates a random 256-bit edit key and stores only its SHA-256 hash with the scenario.
2. It emails `https://sail.mopamo.dev/s/<id>/edit#k=<key>` through Resend, then forgets the address. It's never written to the database or the logs, and the publish dialog clears the field.
3. The key sits in the URL fragment, so browsers never send it to the server in requests or `Referer` headers. The edit page moves it into the tab's session storage and removes it from the address bar, then checks it against the hash before opening the editor.
4. Saving (`PATCH`) and deleting (`DELETE`) send the key as `Authorization: Bearer <key>`. The server compares hashes in constant time and rate-limits attempts per IP.

Without an email address, a published scenario can't be edited by anyone except via the admin token. Because the address isn't stored, a lost link can't be re-sent. If Resend fails to deliver, the publish dialog shows the link once so the author can save it. Resend, as the email provider, keeps its own delivery log.

## Moderation

Every name, author and notes field passes the profanity filter, but some content may still need removing:

```bash
curl -X DELETE https://your-site.vercel.app/api/scenarios/<id> \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

The id is the last part of the scenario's URL (`/s/<id>`). You can also delete keys directly in the Upstash console (`sail:scenario:<id>` plus the member in the `sail:scenarios` sorted set).

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/scenarios?offset=0&limit=24` | newest published scenarios |
| `POST` | `/api/scenarios` | publish: `{ title, author?, notes?, layout, captchaToken, email? }` |
| `GET` | `/api/scenarios/:id` | one scenario |
| `PATCH` | `/api/scenarios/:id` | edit: `{ title, author?, notes?, layout }` with `Authorization: Bearer <edit key>` |
| `DELETE` | `/api/scenarios/:id` | remove, with the edit key or `ADMIN_TOKEN` |
| `POST` | `/api/scenarios/:id/access` | check an edit key (`Authorization: Bearer <edit key>`) |

A `layout` looks like:

```json
{
  "start": "D1",
  "end": "D17",
  "islands": ["D3", "G6", "C10"],
  "kraken": ["G4", "A6"],
  "storms": [5, 12],
  "whirlpools": [], "allies": [], "crowsNests": []
}
```

`end` is the point of the End chevron: `D17` covers C16, E16 and D17.

The server rejects off-board spaces, overlaps, more tokens than the box holds, unreachable Ends, storms behind the Start or on/past the End, and unchanged copies of printed scenarios. Cheap checks run before the captcha token is verified, so a typo doesn't burn the user's captcha.

## How the course check models movement

Every move goes forward (to higher columns):

- **helm pairs** (and helm cannon flips) move one step diagonally, towards the trick winner's side of the board (row A side or row G side);
- **fish-tail pairs** move straight ahead one space, which is two columns.

A move onto an island or off the board doesn't happen. Entering a kraken space damages the ship. Touching any End space wins immediately. "Shortest route" is the minimum number of moves; the drawn route avoids kraken spaces first, then minimises moves. A round lasts 4–7 tricks, so the check warns if a storm needs more moves than the tricks available before its deadline.

## Profanity filter

`lib/profanity.ts` (engine) and `lib/profanity-data.ts` (word data) check the scenario name, author name and notes, live in the editor and again on the server. Users only see a generic message, so the filter can't be probed word by word.

- **English:** [obscenity](https://github.com/jo3-l/obscenity)'s curated dataset, plus extra slurs it misses and an allowlist for real names it would block (Booby Island, Penistone, Great Tit, shiitake, "Mar Negro").
- **Other languages:** curated patterns for German, French, Spanish, Portuguese, Italian, Dutch, Polish, Czech/Slovak, Croatian/Serbian/Bosnian, Russian/Ukrainian (Cyrillic and transliterated), Turkish, Hungarian, Swedish/Norwegian/Danish and Finnish. Each pattern matches the whole word, the start of a word, or anywhere inside one, so that e.g. "Barsch", "Kirscheis", "Kurve", "Fitting", "Pickle" and "Peder" pass.
- **Evasions:** invisible characters, Cyrillic/Greek look-alike letters, accents and umlauts (both ö → o and ö → oe), digits and symbols for letters (`sh1t`, `4rsch`, `$h!t`), stretched letters (`fuuuuck`), words split by spaces, dots or dashes (`f u c k`, `wich ser`), and censored spellings (`f*ck`).
- **Hate symbols and codes:** swastikas, SS runes, 14/88, HH88, 🖕.

`tests/profanity.test.ts` holds about 210 titles that must be blocked and about 180 that must pass (place names, birds, nautical terms, foreign words that look rude). Add to both lists when you change the data.

The word data was cross-checked against the [List of Dirty, Naughty, Obscene and Otherwise Bad Words](https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words) (CC BY 4.0) but curated by hand: used as whole-word lists, LDNOOBW blocks ordinary words like *pesce* (fish), *regina*, *pot*, *nicht* or *bitte*. "Schwanz" is deliberately allowed: it's the fish-tail symbol in the German edition.

## Spoilers

Published scenario pages show the map and the scenario card only. The best route, dead-end spaces and move counts sit behind a **Tips** panel that players open themselves. The editor always shows them, as a design aid.

## Project layout

```
app/
  page.tsx                 editor
  gallery/page.tsx         gallery + the six printed scenarios
  s/[id]/page.tsx          published scenario page
  api/scenarios/…          REST endpoints
components/
  Editor.tsx               editor state, history, input handling
  BoardSvg.tsx             board renderer (horizontal / upright, compact thumbnails)
  LegendCard.tsx           scenario-book card
  CourseCheck.tsx          analysis panel
  ScenarioBody.tsx         published scenario: map, card, tips behind a reveal
  PublishDialog.tsx        publish form + Turnstile + optional email
  EditGate.tsx / EditDialog.tsx   editing via the private link
lib/
  board.ts                 board geometry and movement
  tokens.ts                token inventory
  scenario.ts              layout model, editing rules, parsing, share links
  analysis.ts              route finding and checks
  official.ts              the six printed scenarios
  profanity.ts             profanity filter (engine)
  profanity-data.ts        profanity filter (word data)
  turnstile.ts             captcha verification
  email.ts                 Resend email for edit links
  editKey.ts               edit keys (only hashes are stored)
  store.ts                 Upstash Redis / in-memory storage
  submit.ts                publish pipeline (tested without HTTP)
tests/                     node:test suites (npm test)
```

## Legal

Unofficial fan project, not affiliated with Allplay or the designers. The board is drawn from scratch; no artwork from the game is included. The six printed layouts are included as coordinates only, so players can remix them.
