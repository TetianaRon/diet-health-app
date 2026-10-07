# Track My Meals — Project Instructions

**Version:** v2.3

## Issues log

Identifier: TMM
Log: `docs/roadmap.md` → Intake

## Identity

Track My Meals (Трекер харчування) is a Ukrainian-language meal and blood-sugar tracker. It runs as a web app and an Android app (Capacitor), with Google Sheets as each user's database. Nothing is public: the Android app is on Play's internal testing track only, and the web app's Google sign-in admits test users only. Its first user is the developer's mother: Type 2 diabetes, stage 2 gastritis, no gallbladder, fatty liver and elevated cholesterol. She doesn't read English and isn't technical, so every path she uses works in Ukrainian with no English input. She lives separately and reports bugs; she doesn't test. The developer, Tetiana, designs the app: its logic, architecture, features and look. Claude writes the code and keeps the docs current. Development discussion is in English; all UI text is Ukrainian.

## Production flow

1. **Intake.** New feedback, ideas and bug reports go to `docs/roadmap.md` → Intake with a one-line note and a proposed place. Build only when the developer asks for it now, or when something live is broken.
2. **Plan.** Work happens in small numbered releases in `docs/roadmap.md`. The design of each feature lives in `docs/technical-spec.md`.
3. **Build.** One branch per release (`release/x.y`) or fix, cut from an up-to-date `main`. `main` is live: Vercel deploys it and Play builds come from it. Only finished, checked work is merged into `main`; docs-only changes may go straight to it.
4. **Verify.** Unit tests and `tsc`, then the app itself on the test sheet (local dev server; the developer signs in) and on the developer's devices or the emulator, all before the Play upload. Never on mom's phone or her sheet.
5. **Release.** The developer pushes `main` and uploads the Play bundle to the internal testing track. Mom is a tester on that track, so the upload is the release to her. Play release notes are in English only.
6. **Record.** `docs/build-log.md` gets the decisions and verification; the roadmap gets the release's status.

## Task routing

| Task | Read |
|---|---|
| Releasing a version or a hotfix | `docs/tasks/dha-task-release.md` |
| Checking a change in the running app (web or Android) | `docs/tasks/dha-task-device-testing.md` |
| Adding or changing verified food database entries | `docs/tasks/dha-task-verified-db-change.md` |
| Importing a user's own food data | `docs/tasks/dha-task-user-data-import.md` |
| Interviewing mom (trigger message `МАМА: ПОЧАТИ ОПИТУВАННЯ`) | `docs/tasks/dha-task-interview.md` |

## Skills

| Skill | When it applies | Gate |
|---|---|---|
| `claude-governance:issue-logging` | Logging or resolving Intake entries | Soft |
| `claude-governance:plan-discipline` | Working on an improvement plan in `docs/` (not the roadmap) | Soft |
| `claude-governance:build-standards` | Changing `CLAUDE.md` or a task file | Soft |
| `claude-governance:doc-formatting` | Writing user-facing docs (README, public pages) | Soft |
| `claude-governance:git-commit-message` | When the developer asks for a commit message | Soft |
| `claude-governance:session-discipline` | Session wrap-up and handoff | Soft |

## Standing rules

1. Never load a source speculatively — only what the current task requires.
2. Always confirm before creating pages, tickets, or other external artifacts.
3. Always confirm before modifying `CLAUDE.md`, task files or memory. Docs updated as part of a release (roadmap, build log, spec) are part of the work.
4. Any time a workflow issue is noticed — incorrect output, workflow gap, redundant step, routing failure, documentation drift, or missing guardrail — ask whether to log it now or hold it for later, under `issue-logging`.
5. **Not a medical app.** No medical claims anywhere: no "safe for diabetics", "recommended" or "treats". Recommendations are arithmetic on the user's own settings, shown with the disclaimer. Every reference value (nutrients and GI) carries its source, a reliability level, the reasoning and the date it was verified. Each verified-database entry is written for public readers (the database is published on roncreator.com).
6. **No browser automation of Google Sheets structure.** Never type headers, tabs or bulk content into a live sheet. Build a file locally, or give the developer exact values to enter. Reading a sheet back to check it is fine.
7. **Buttons name their outcome.** Every action in a review or decision UI says what it does (e.g. «Залишити моє 105 ккал»). There are no generic "Disagree" buttons, and the page says what happens with no answer.
8. **Fix the whole class.** When one data or wording error is found, search for the same error everywhere it could occur and fix every instance. After a structural or source change, sweep every note, spec section, roadmap line and review text that explains it.

## Code map

- React + Vite + TypeScript PWA. The Android app wraps it with Capacitor (`android/`, package `ca.roncreator.trackmymeals`). `api/` holds the Vercel functions for the USDA lookup and translation.
- `src/i18n/uk.ts`: the only source of UI strings. Numbers in UI text go through `formatDecimal` (`src/lib/numberFormat.ts`), which gives a decimal comma.
- `src/lib/health.ts`: pure health math (GL, fat limit, meal gap, GI class), unit-tested.
- `src/lib/sheets.ts`: Google Sheets client and Google Identity Services token auth. The token lives in memory only, so sign-in is needed every session and after every page reload.
- Spreadsheet tabs: row 1 holds fixed column keys, row 2 readable names (`uk.sheetLabels`), and data starts at row 3. Tabs are read only through `parseTab()` (`src/lib/sheetRow.ts`). Structure rules are in `src/lib/sheetSchema.ts`; the silent upgrade and column migrations are in `sheetUpgrade.ts` and `columnMigrations.ts`.
- **Verified food database:**
  - `src/data/verified-foods.json`, typed and validated in `verifiedFoods.ts`;
  - mapped to built-in items in `builtInFoods.ts`;
  - GI lookups in `gi-table.ts`, from the database only;
  - names from before 1.8 in `legacyBuiltIns.ts`;
  - it's built by `tools/verified-db/` (see its README).
- `src/lib/foodSearch.ts`: database-first search and GI suggestions.
- `src/lib/nutrition.ts`: product lookup in the database first, then USDA FoodData Central. No Claude-based lookup.
- `src/lib/ingredients.ts`, `dishes.ts`, `dailyLog.ts`, `records.ts`, `weight.ts`, `medications.ts`: typed data access per tab, with pure, unit-tested row mappers.
- `src/lib/mealStats.ts`, `mealRecommendation.ts`: per-meal stats, and the split of daily limits into a per-meal recommendation.
- `src/context/`: auth, the sheet structure check and notifications. `src/screens/`: one file per screen or dialog.
- `unknownFields`: values left blank on purpose. They're stored as 0 and excluded from totals; never treat one as a real zero.

## Docs

- `docs/roadmap.md`: the planner — releases, Intake (the issues log) and "Next session — start here".
- `docs/technical-spec.md`: the design of every feature.
- `docs/build-log.md`: decisions and verification, in date order.
- `docs/project-brief.md`: health context and nutritional parameters.
- `docs/requirements-open-questions.md`: mom's interview answers and what's still open.
- `docs/automation-candidates.md`: patterns worth turning into skills or agents.
- `docs/roadmap-archive.md`, `docs/build-log-archive-2026-04-09.md`: history (released releases, resolved intake, log entries before 1.5). Read only when a task needs that history.
