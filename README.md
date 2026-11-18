# 品酒日记 Wine Diary

A mobile-first web app for keeping a structured wine tasting journal: record each wine in seconds at the winery, search everything you have tasted later, and compare notes with the friends who were there.

> **Status: design stage.** There is no code yet. The design is in [docs/design.zh.md](docs/design.zh.md) (Chinese).

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
| Background jobs | Cloudflare Queues |
| Front end | Preact + Vite, no CSS framework, installable PWA |
| Sign-in | Google (OAuth with PKCE) |
| AI | Claude, called from the Worker only: label reading, review summaries, turning free text into aroma tags |
| Tests | Vitest, Playwright |

## Documents

- [docs/design.zh.md](docs/design.zh.md): architecture, features, data model, visual direction and phases.

## License

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only), the same as jaysbadminton.
