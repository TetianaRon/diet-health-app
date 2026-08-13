# Diabetes Tracker

A Ukrainian-language nutrition and health tracking web app, built for a Type 2 diabetic with Stage 3 gastritis and no gallbladder. Helps plan small frequent meals, track carbs/GI/GL/fat per meal, and log blood sugar readings. Installable as a PWA on both mobile and Windows desktop, synced across devices via Google Sheets.

## Status

**Working and verified live (real Google Sheets, real sign-in):**
- Google sign-in (`AuthContext` + `sheets.ts`, Google Identity Services token client)
- **Продукти → Продукти** (Ingredients): browsable/narrowing bundle suggestions, USDA + auto-translation fallback for anything not in the bundle, manual entry, add/list all confirmed writing to and reading from the real sheet
- **Продукти → Страви** (Dishes): browse/add pre-computed starter dishes (cooked grains/legumes, yield-weight model); composing a *custom* multi-ingredient recipe is not built yet
- **Налаштування** (Settings): load/edit the 7 daily targets, Google account sign-in/out

**Not built yet:** Сьогодні (Today — daily log, quick-add, progress bars), Цукор (Blood Sugar screen). Both are still placeholders in `App.tsx`.

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
