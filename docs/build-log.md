# Build Log

Development journal — decisions, changes, and notes in chronological order.

## 2026-04-22 — Project Initialization

**Completed:**

- Defined user health context: Type 2 diabetes, Stage 3 gastritis, no gallbladder
- Agreed on architecture: Google Sheets (database) + Claude Web App (interface)
- Created Notion project documentation: Project Brief, Open Questions, System Prompt, Technical Spec
- Designed two-mode system prompt: Development mode (English) + Interview mode (Ukrainian)
- Set interview trigger phrase: `МАМА: ПОЧАТИ ОПИТУВАННЯ`

**Key decisions:**

- UI language: Ukrainian
- Backend/search language: English (more reliable nutritional data)
- Platform: Web app in phone browser (no install)
- Database: Google Sheets (already familiar to mom)
- Blood sugar units: mmol/L
- Documentation language: English

**Next steps:**

- Run interview with mom via Claude Project
- Fill Technical Spec based on her answers
- Begin MVP development

## 2026-05-06 — Developer's Personal Calorie Counter (parallel build)

**Context:** Developer requested a personal calorie counter app built in parallel while mom's interview is pending. Source spreadsheet analyzed via Google Drive connector (file ID: `1X9wub-hxIcS2iDrPkjA2ivvxg8yii9w_JInp_ydbMBY`).

**What was built:**
Self-contained single-artifact calorie tracker (HTML/CSS/JS + Claude API). Runs in browser, persists via `localStorage`. Three tabs: Today's Log, Food Library, Progress.

**Features (v2):**

- Breakfast / Lunch / Dinner / Snacks structure matching existing spreadsheet
- Fuzzy search across food library with description preview and kcal/100g shown in dropdown
- AI food lookup via Anthropic API when food not in library — auto-saves result with description
- 31 pre-seeded foods extracted from real spreadsheet history
- All library foods have descriptions (what it is, how prepared)
- Food library tab: search, edit name/description/calories, delete, add manually
- Daily calorie progress bar with 1800 kcal/day goal
- Weight logging per day
- Weight trend chart (last 30 days, line)
- Daily calorie chart (last 14 days, bar — red if over goal)
- Stats: current weight, 30-day change, 7-day avg calories
- Export + analyze day via Claude chat

**Architecture decision — Google Sheets sync:**
Decided NOT to sync with existing spreadsheet. It is a pre-filled template, not a clean database. App is self-contained with localStorage — simpler, no auth required. Open question: revisit Sheets sync as a later milestone if developer wants cross-device persistence.

**Developer notes addressed:**

- Fuzzy search with description previews in dropdown ✅
- Library descriptions + edit flow ✅
- Spreadsheet sync — deferred (open)
- Weight progress chart ✅
- Calorie goal set to 1800 kcal/day ✅

**Next steps for this app:**

- Test food lookup and library editing in real use
- Revisit Sheets sync if cross-device data is needed
- Potential: weekly calorie summary, streak tracking

**Status:** Never finished — not used as a base for the diabetes tracker app. Kept here for history only.

## 2026-08-12 — Migrated project into GitHub repo

**Completed:**

- Moved all Notion documentation (Project Brief, Requirements — Open Questions, Technical Spec, Build Log) into `docs/` in this repo
- Converted the Claude Project system prompt into [`CLAUDE.md`](../CLAUDE.md) at the repo root, so Claude Code follows the same dev-mode / interview-mode rules
- Notion remains the source of record for now for the interview-prep pages (Interview Prompt, instructions for mom); this repo is the source of record for code and the docs above going forward

**Next steps:**

- Run the interview with mom (Ukrainian, trigger phrase `МАМА: ПОЧАТИ ОПИТУВАННЯ`)
- Fill in `docs/requirements-open-questions.md` → Mom's Answers
- Fill in `docs/technical-spec.md` and begin scaffolding the actual app

## 2026-08-12 — Cross-platform architecture + skeleton

**Context:** Developer wants the app usable on both mobile and Windows desktop, with data synced between them, and wants to start building before mom's interview is done (the interview only affects specific numbers/food lists, not the architecture).

**Key decisions:**

- **Desktop delivery:** one responsive codebase, installable as a PWA on both mobile and Windows — no separate native/Electron build.
- **Sync:** kept Google Sheets as the database. Since it's already cloud-hosted, every device reading/writing the same spreadsheet via the Sheets API gives cross-device sync for free — no extra sync layer needed.
- **Frontend stack:** React + Vite + TypeScript.
- **Nutrition lookup security:** Claude/Anthropic API key must never ship to the browser — added a serverless proxy (`api/lookup-food.ts`) instead of calling the API client-side.
- **Hosting target:** Vercel (static PWA + serverless function in one deploy) — not deployed yet, local dev only for now.

**Completed:**

- Updated `docs/project-brief.md` with a Platform & Sync section
- Wrote a first-draft `docs/technical-spec.md`: architecture diagram, Google Sheets schema, OAuth setup steps, Claude proxy contract, screen structure, deployment plan
- Scaffolded the React + Vite + TS PWA skeleton: 4-tab app shell (Сьогодні / Продукти / Цукор / Налаштування), `src/lib/health.ts` (GL calc, fat-limit check, meal-gap warning) with unit tests, `src/lib/sheets.ts` and `src/lib/claude.ts` client stubs, `api/lookup-food.ts` proxy stub

**Blocked / needs developer action:**

- Node.js isn't installed on the dev machine — couldn't run `npm install`/`npm run dev` to verify the skeleton boots. All files were hand-written; verification is pending Node install.
- Google Cloud OAuth setup and Anthropic API key are still needed before Sheets sync or AI lookup actually work (see `docs/technical-spec.md` → Google Sheets API integration).

**Next steps:**

- Install Node.js, then verify `npm run dev` / `npm run test` / `npm run build`
- Set up the Google Cloud OAuth client + test users, and the Anthropic API key
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults
