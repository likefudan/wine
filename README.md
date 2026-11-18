# 品酒日记 Wine Diary

A mobile-first web app for keeping a structured wine tasting journal: record each wine in seconds at the winery, search everything you have tasted later, and compare notes with the friends who were there.

- **Site**: https://wine.llmat.dev (sign up with Google; the owner approves newcomers beyond a daily number)
- **Test site**: https://wine-staging.llmat.dev

> **Status: phase 1** (record at the winery): Google sign-in, wine lists, finding a wine by name or label photo, quick notes and the three guided depths, a searchable personal library, offline notes, 简体 / 繁體 / English. Sharing, critic reviews, cellar and recommendations come in later phases ([docs/design.zh.md](docs/design.zh.md) §6).

## Why

At a winery tasting you are poured seven or eight wines in an hour. By the time you get home the impressions are gone, and a year later you cannot remember whether you have had a wine before. Existing wine sites assume you already speak the language of tasting, which makes them hard to start with.

## What it will do

- **Guide a complete beginner through a tasting.** The same tasting sheet has three depths. Beginner asks plain questions about what you feel ("do your gums feel dry?"), explains why each one is asked, and translates your answers into a proper tasting note. Standard follows the WSET systematic approach. Expert opens every field, plus faults, serving conditions and blind guessing. A quick mode records a wine in ten seconds.
- **Identify the wine, not just describe it.** Type a few letters or photograph the label. Every note is attached to a specific wine and vintage, so the journal stays searchable.
- **Wine lists for a trip or a tasting.** A list holds the wines in pouring order, across one or more winery stops.
- **Taste together.** Share a list by QR code, private, view-only or open to contributions. Friends add their own notes under the same wines. Scores stay hidden until you have submitted your own.
- **See what critics and the community said**, after you have made up your own mind, and compare the aromas you found with theirs.
- **Work offline.** Tasting rooms often have no signal. Notes are saved on the phone and synced later.
- **简体中文, 繁體中文 and English.**

Planned for later: cellar inventory ("you have had this before") and recommendations based on your own tasting history and how your palate differs from the critics'.

## Stack

One Cloudflare Worker serving both the pages and the API, following [likefudan/jaysbadminton](https://github.com/likefudan/jaysbadminton):

| Part | Choice |
| --- | --- |
| Runtime | Cloudflare Workers with static assets |
| API | Hono |
| Database | D1 (SQLite) with numbered SQL migrations |
| Photos | R2 |
| Front end | Preact + Vite, no CSS framework, installable PWA |
| Sign-in | Google (OAuth with PKCE) |
| AI | Claude, called from the Worker only: label reading, review summaries, turning free text into aroma tags |
| Tests | Vitest, Playwright |

## Development

Node 22.

```sh
npm ci
printf 'DEV_LOGIN="1"\nENVIRONMENT="dev"\nOWNER_EMAILS="you@example.com"\nSITE_ORIGIN="http://localhost:8787"\n' > .dev.vars
npm run db:migrate:local
npm run dev            # http://localhost:8787, sign in with any email via "Dev login"
npm run lint && npm run typecheck && npm test
npm run test:e2e       # browser tests on a throwaway local site
```

`DEV_LOGIN` lets anyone sign in without Google; it only works when `ENVIRONMENT` is not `production` and is never set on the real sites.

## Deploying

The same way as jaysbadminton: merging to `main` deploys the test site, releasing deploys production: run **Actions → Release → Run workflow** on `main` (`.github/workflows/release.yml`), which tags the latest green `main` as `vYYYY.MM.DD`, publishes a GitHub release and deploys it; give it an existing tag to redeploy or roll back to that version. Pushing a `v*` tag by hand does the same (`.github/workflows/ci.yml`). The deploy job finds or creates the D1 database, binds the R2 photo bucket when it exists, runs the migrations, deploys and pushes the Worker secrets.

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | What |
| --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Deploys. The token needs Workers Scripts, D1, Workers R2 Storage (edit), Account Settings (read), and on the zone llmat.dev Workers Routes, DNS (edit) and Zone (read). |
| `OWNER_EMAILS` | Google emails of the site owners, comma-separated: they can always sign in, approve newcomers and set 每天免审核名额 in 我的 → 成员. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The same OAuth client as jaysbadminton. Its redirect URIs must include `https://wine.llmat.dev/api/auth/google/callback` and `https://wine-staging.llmat.dev/api/auth/google/callback`. |
| `AZURE_FOUNDRY_API_KEY` | Reading wine labels (Claude on Azure, the same key as jaysbadminton). Label scanning is hidden behind a message while it is missing. |

## LWIN wine directory

Typing a producer or wine also suggests wines from [LWIN](https://www.liv-ex.com/lwin/), Liv-ex's free wine list (Creative Commons; the app credits it under the suggestions). The rows are not in this repository. To load or refresh them, download the spreadsheet from Liv-ex, then:

```sh
pip install openpyxl
python3 scripts/lwin_import.py LWINdatabase.xlsx lwin.sql
npx wrangler r2 object put wine-photos-staging/lwin/lwin.sql --file lwin.sql --remote
```

and run **Actions → Load LWIN** (`.github/workflows/lwin.yml`) once for `staging` and once for `production`. The SQL replaces the previous load. Only live wines are kept (about 186,000; no spirits).

## American wine labels

Every wine sold in the US needs a label approval from TTB, so its public COLA registry names many small American wineries that LWIN lacks. **Actions → Export TTB** (`.github/workflows/ttb.yml`) runs `scripts/ttb_export.py`, which searches the registry for American wines date range by date range (it exports at most 1,000 rows at a time), pausing between requests, and saves the result to the test site's private bucket at `ttb/ttb.csv`. A full export from 2005 takes an hour or two. The registry is public US government data. Then:

```sh
npx wrangler r2 object get wine-photos-staging/ttb/ttb.csv --file ttb.csv --remote
python3 scripts/ttb_import.py ttb.csv ttb.sql LWIN.csv   # LWIN.csv: the LWIN spreadsheet saved as CSV, to skip wines it has
npx wrangler r2 object put wine-photos-staging/ttb/ttb.sql --file ttb.sql --remote
```

and run **Actions → Load LWIN** with data `ttb`. The labels sit in the LWIN tables with negative ids (only a real LWIN code is kept on a wine), one row per brand and fanciful name, without flavoured, fruit or honey wines.

## American appellations

The 子产区 field suggests the 280 current American Viticultural Areas, and picking one fills in an empty region and country (Oakville → Napa Valley, USA). The list is TTB public data, kept in `src/shared/ava.ts`. To refresh it:

```sh
curl -o ava.csv https://dyuie4zgfxmt6.cloudfront.net/open-data/ttb_viticultural_areas.csv
python3 scripts/ava_import.py ava.csv src/shared/ava.ts
```

## Documents

- [docs/design.zh.md](docs/design.zh.md): architecture, features, data model, visual direction and phases.

## License

No license has been chosen yet. All rights reserved.
