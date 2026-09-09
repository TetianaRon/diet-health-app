# Diabetes Tracker

A Ukrainian-language nutrition and health tracking web app, built for a Type 2 diabetic with Stage 2 gastritis, no gallbladder, fatty liver, and elevated cholesterol. Helps plan small frequent meals, track carbs/GI/GL/fat per meal, and log blood sugar readings. Installable as a PWA on both mobile and Windows desktop, synced across devices via Google Sheets.

## Status

**All four tabs and every feature from `docs/technical-spec.md` are built**, plus a later addition: a `glycemicFlag` ("none"/"watch"/"avoid") on both Ingredients and Dishes with a derived "this dish contains a flagged ingredient" hint, and a "meals before this reading" expandable review on the Blood Sugar screen. Mom's interview is complete — health context and Settings defaults (1800 kcal, 6 meals/day) are corrected in code and docs.

**Built and unit-tested this session, not yet live-verified signed-in:** the glycemic-flag/blood-sugar-review feature above (`npm run test` 76/76, `npm run build` clean). Verification is blocked the same way it was before — Google's sign-in popup can't be completed by browser automation — so a manual click-through is still needed: cycle a flag on an ingredient and a dish, confirm the derived hint and dish→ingredient prompt behave, expand a Blood Sugar entry's meals-before list. See `docs/build-log.md`'s 2026-09-07 "Built the food/blood-sugar review feature" entry.

**Scoped but not built:** the meal-time reminder/notification mechanics mom asked for in her interview. Full Phase 1 design is locked in (Capacitor Android wrapper, package id `ca.roncreator.trackmymeals`, local notifications scheduled from a cached last-meal timestamp with quiet-hours suppression, release-keystore signing from build #1) — implementation should need no further design decisions. A home-screen widget + dynamic app-icon color swap are an explicit Phase 2, deferred until Phase 1 has been used in practice. See `docs/build-log.md`'s 2026-09-09 entry for the full design and the alternatives that were rejected and why.

**Renamed:** the app is now **Трекер харчування** / **Track My Meals** (was "Трекер Діабету"/"Diabetes Tracker") — the old name implied a medical-app scope this utility tool shouldn't claim. Applied across `src/i18n/uk.ts`, `index.html`, and the PWA manifest in `vite.config.ts`.

**New:** `docs/automation-candidates.md` — mechanics/workflows from building this app, flagged as candidates for future Claude Code skills/agents/plugins once there's enough cross-project usage to justify formalizing them.

**Repo state:** nothing from this session is committed yet — last commit is `24239be`. Modified: `CLAUDE.md`, `docs/build-log.md`, `docs/technical-spec.md`, `index.html`, `vite.config.ts`, `src/i18n/uk.ts`, `src/index.css`, `src/data/starter-dishes.{ts,test.ts}`, `src/lib/{dailyLog,dishes,ingredients}.{ts,test.ts}`, `src/screens/{BloodSugarScreen,FoodsScreen,TodayScreen}.tsx`. New: `docs/automation-candidates.md`, `src/lib/glycemicFlag.ts`, `src/lib/glycemicFlag.test.ts`.

**Still pending manual spreadsheet edits** (accumulating across sessions — the app works without them, blank cells just read as the default, but they're needed for the sheet to be legible if opened directly): `Favorite` header on Ingredients column M (pending since 2026-08-14); `GlycemicFlag` header on Ingredients column N and Dishes column O; `DailyCaloriesTarget`→1800 and `MealsPerDay`→6 in the live Settings tab (the code defaults were corrected after mom's interview, the sheet itself wasn't).

**Also still pending, lower priority:** reviewing mom's old Google Sheet for real dish/ingredient data to expand the starter bundle; weight tracking and blood-sugar-trend-chart are confirmed wishes with no schema/UI designed yet.

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
- [docs/automation-candidates.md](docs/automation-candidates.md) — workflows/mechanics flagged as candidates for future Claude Code skills/agents/plugins
- [CLAUDE.md](CLAUDE.md) — instructions for Claude Code when working in this repo (dev mode / interview mode)
