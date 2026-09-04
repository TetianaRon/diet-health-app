# Diabetes Tracker

A Ukrainian-language nutrition and health tracking web app, built for a Type 2 diabetic with Stage 3 gastritis and no gallbladder. Helps plan small frequent meals, track carbs/GI/GL/fat per meal, and log blood sugar readings. Installable as a PWA on both mobile and Windows desktop, synced across devices via Google Sheets.

## Status

**All four tabs and every feature from `docs/technical-spec.md` are now built** — Сьогодні, Продукти (Ingredients + Dishes, including custom multi-ingredient recipes), Цукор, Налаштування, plus favorites and a merged starter-bundle+personal-sheet model so the bundle is usable without individually saving each item first. What's left is real-world verification and mom's interview, not more building.

**Verified live before today's session** (real Google Sheets, real sign-in): Google sign-in, basic Ingredients add/list, Settings load/save.

**Built today (2026-08-14), not yet live-tested:** Blood Sugar screen; custom dish composition; the bundle-merge behavior (Ingredients/Dishes browsing, dish composition, and meal logging all reworked to pull from the bundle + personal sheet together); favorites; a reworked USDA lookup (candidate list instead of one guess, GI accuracy fix, "Знайти" no longer re-guesses bundle matches); two validation bugs fixed (blank numeric fields were silently saving as `0` in the add-ingredient form and Settings). See `docs/build-log.md`'s 2026-08-14 entries, especially the session wrap-up at the end, for the full list and reasoning behind each.

**Repo state:** nothing from today is committed yet — last commit is `ae40f48` (2026-08-13). Every change passed `npm run test`/`npm run build` individually; not re-verified as one combined diff.

**Needs a manual spreadsheet edit before the next sign-in:** add `Favorite` as the header in the Ingredients tab's column M1 — blank existing rows are fine, they default to "not favorited".

**Not started:** the interview with mom (`docs/requirements-open-questions.md` is still empty) — the app is usable and being dogfooded by the developer ahead of that; exact targets/food lists are still open pending her answers.

**Credentials:** all three are set up and confirmed working in the developer's local `.env` (Google OAuth client, spreadsheet ID, USDA API key) — see `docs/technical-spec.md` for setup steps if starting fresh elsewhere.

For the detailed, chronological account of decisions and fixes, see [docs/build-log.md](docs/build-log.md) — the most recent entries are most relevant for picking up where things left off.

## Getting started

Requires [Node.js](https://nodejs.org/) (LTS).

```bash
npm install
cp .env.example .env   # then fill in the values, see docs/technical-spec.md
npm run dev
```

Other scripts: `npm run test` (unit tests), `npm run build` (production + PWA build), `npm run lint`.

The app runs without `.env` values filled in, but Google Sheets sync won't work until the Google OAuth client is set up, and USDA food lookup needs a free `VITE_USDA_API_KEY` — see [docs/technical-spec.md](docs/technical-spec.md).

## Docs

- [docs/project-brief.md](docs/project-brief.md) — goal, health context, architecture, tech decisions
- [docs/requirements-open-questions.md](docs/requirements-open-questions.md) — interview questions and answers
- [docs/technical-spec.md](docs/technical-spec.md) — implementation spec (architecture decided, targets pending mom's interview)
- [docs/build-log.md](docs/build-log.md) — development journal
- [CLAUDE.md](CLAUDE.md) — instructions for Claude Code when working in this repo (dev mode / interview mode)
