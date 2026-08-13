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

## 2026-08-13 — Google Cloud OAuth setup + dropped Claude for nutrition lookup

**Google Cloud OAuth setup completed:**

- Google renamed "OAuth consent screen" to "Google Auth Platform" with separate tabs (Branding/Audience/Clients/Data Access) since the developer's project was created — `docs/technical-spec.md` setup steps still describe the right end-state, just under new tab names now.
- Added the `.../auth/spreadsheets` scope (Data Access tab), added both test users (Audience tab), created the OAuth Client ID (Clients tab).
- `VITE_GOOGLE_CLIENT_ID` and `VITE_SPREADSHEET_ID` filled into local `.env` (gitignored).
- Confirmed the OAuth client's secret is not needed — the app uses Google Identity Services' browser-based token flow, not a server-side authorization-code exchange.

**Spreadsheet setup — course-corrected:**

- First attempt: tried to fill in tab headers directly via Claude-in-Chrome browser automation on the developer's live Google Sheet. This went wrong — keystroke simulation was unreliable (Tab/Delete keys landed inconsistently, one stray edit briefly renamed the whole spreadsheet). Fixed the immediate damage (title) but stopped rather than keep fighting it.
- Switched approach per developer's suggestion: built the spreadsheet locally as `.xlsx` (5 sheets: Ingredients, Dishes, DailyLog, BloodSugar, Settings, headers matching the schema, Settings pre-filled with Project Brief midpoint defaults) using openpyxl, verified programmatically, sent to the developer to upload to Drive and convert to Sheets themselves. Much more reliable than remote-controlling the Sheets UI.
- **Lesson:** for structured spreadsheet setup, generate the file and hand it off rather than driving Google Sheets' UI via browser automation.

**Key decision — dropped Claude API from the nutrition-lookup path:**

- **Why:** the Anthropic API requires a paid credit balance (console.anthropic.com), which the developer flagged as an unwanted cost. Re-examined whether it was actually necessary.
- **New approach:** bundled-first, API-fallback —
  1. A curated starter dataset (~150–200 common Ukrainian staples, to be curated) ships in the Ingredients tab from day one, covering most of mom's actual diet (whole/home-cooked foods, per the health context).
  2. Glycemic Index is *always* bundled/static (`src/data/gi-table.ts`) — no free or paid API actually provides GI data, it comes from academic studies, so this was never solvable via API regardless of Claude.
  3. **USDA FoodData Central** (free, no cost, no card required) covers macros/calories for anything not in the bundle. Chosen over Open Food Facts for the MVP since mom's diet leans toward raw/whole foods (USDA's strength) rather than packaged/branded products (Open Food Facts' strength) — can add Open Food Facts later if real usage shows gaps.
  4. Manual entry remains available regardless (already implied by the existing `Source` column and the Foods screen's planned "add/edit" — nothing new needed there).
- **Language compatibility:** solved by the existing `NameUk`/`NameEn` split in the Ingredients schema — USDA is English-only, but mom only ever sees `NameUk`; `NameEn` is supplied at data-entry time (by the starter dataset curation, or by whoever adds a new food), so no translation service is needed.
- **Effect on code:** `src/lib/claude.ts` and `api/lookup-food.ts` to be replaced with `src/lib/nutrition.ts` (bundle lookup → USDA fallback) and `src/data/starter-foods.ts` / `src/data/gi-table.ts`. No serverless proxy needed anymore, since USDA's API key is free/public-data and safe to call directly from the browser (unlike the Anthropic key). Claude may return later as an optional fallback for obscure/homemade dishes, not on the required path.

**Next steps:**

- Curate the starter foods dataset and static GI table
- Implement `src/lib/nutrition.ts` (bundle-first, USDA fallback) and remove `src/lib/claude.ts` / `api/lookup-food.ts`
- Sign up for a free USDA FoodData Central API key
- Verify `npm run dev` end-to-end with real Google sign-in against the new spreadsheet
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Implemented bundled-first nutrition lookup

**Completed** (same day as the decision above, continued in a follow-up session):

- `src/data/starter-foods.ts` — first-pass curated dataset: 60 common Ukrainian staple ingredients (grains, dairy, proteins, legumes, vegetables, fruits, nuts/fats), each with `nameUk`/`nameEn` and full macros + GI per 100g. Raw ingredients only, by design — composite dishes (borscht, etc.) belong in the Dishes tab, built from these, not hardcoded here. Scaled back from the ~150–200 target in the prior entry: 60 well-sourced entries beat padding the list with lower-confidence numbers for a health-tracking app. Expand as real usage surfaces gaps.
- `src/data/gi-table.ts` — static GI lookup (exact + substring match), derived from the starter dataset plus ~15 extra common foods (watermelon, honey, sweet potato, etc.) that aren't full starter entries but come up often enough to want GI for.
- `src/lib/nutrition.ts` — `lookupFood(nameUk, nameEn)`: checks the starter bundle by either name first (no network call), falls back to `lookupUsda()` which queries USDA FoodData Central (`dataType=Foundation,SR Legacy`, restricting to raw/generic foods) and fills GI from the static table. Verified the exact query/response shape against the live API (nutrient numbers 203/204/205/208/269/291/307 = protein/fat/carbs/kcal/sugars/fiber/sodium) before writing the implementation, not just from memory.
- `src/lib/nutrition.test.ts` — 8 tests covering starter-data matching, USDA fallback, nutrient-number mapping, GI fill-in, empty results, and request failures.
- Removed `src/lib/claude.ts` and `api/lookup-food.ts`; dropped `@anthropic-ai/sdk` and `@vercel/node` from `package.json` (131 packages removed on reinstall).
- Added `VITE_USDA_API_KEY` to `.env.example`/`.env`; removed `ANTHROPIC_API_KEY`.
- Verified: `npm run test` (14/14 pass, including the new nutrition tests), `npm run build` (typecheck + PWA build clean).

**Next steps:**

- Sign up for a free USDA FoodData Central API key (api.data.gov, no card) and fill in `VITE_USDA_API_KEY`
- Build the actual Foods screen UI (search → bundle/USDA estimate → mom approves → write to Ingredients)
- Verify `npm run dev` end-to-end with real Google sign-in against the new spreadsheet
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — USDA key confirmed live; built the Foods screen

**USDA key:** developer signed up and saved `VITE_USDA_API_KEY`; verified with a real (non-DEMO_KEY) request before moving on.

**Google auth implemented for real:** `src/lib/sheets.ts` was still throwing stubs — replaced with Google Identity Services' browser token-client flow (`initTokenClient` + `requestAccessToken`), confirmed earlier this app never needs the OAuth client secret. Token lives in memory only; sign-in required once per session.

**Foods screen built** (`src/screens/FoodsScreen.tsx`), scoped to **Ingredients only** this pass — Dishes (recipe composition from multiple ingredients) is a big enough feature to defer to its own pass rather than bundle in:

- Not signed in → message + sign-in button; signed in → fetches and lists Ingredients, client-side search by `nameUk`
- Add flow: type `nameUk`/`nameEn` → "Знайти" calls `lookupFood` (already built) → editable estimate with a source badge (Базова база/USDA/Вручну) → "Зберегти" validates all numeric fields (GI included — never silently saves a 0) → writes to the sheet
- New supporting files: `src/lib/ingredients.ts` (typed `Ingredient` + pure row↔object mappers, tested in `src/lib/ingredients.test.ts`) and `src/context/AuthContext.tsx` (shared sign-in state via `useAuth()`)
- `CLAUDE.md` updated with the new `src/context/`/`src/screens/` conventions

**Verified:** `npm run test` (17/17 pass), `npm run build` clean, and the not-signed-in state confirmed correctly in a live browser session (message + button render, tab navigation works).

**Note on browser verification:** a real Google sign-in popup opened during the session — the developer clicked through it directly (not something Claude triggered or interacted with). Since the add/lookup flow is gated behind real sign-in by design, it could only be verified via the 8 existing `nutrition.test.ts` tests otherwise, so this doubled as the first real end-to-end check of the sign-in flow.

**Next steps:**

- Developer signs in for real and confirms a new ingredient actually appears in the Google Sheet
- Build the Dishes half of the Foods screen (recipe composition)
- Build out Today, Blood Sugar, and Settings screens (Settings should also get the "Google account" sign-in/out control per the original screen plan)
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Built the Settings screen

**Why Settings next:** it unblocks the most — Today's progress bars and the meal-gap warning both need `Settings` targets — and it's where the "Google account" control was always meant to live per the original screen plan (it had been living ad hoc on the Foods screen instead).

**`src/lib/sheets.ts`:** added `batchUpdateRanges()` — Settings rows already exist from the starter template (unlike Ingredients, which is append-only), so updates target existing rows in place via the Sheets API's `values:batchUpdate`, one request for all 7 targets.

**`src/lib/settings.ts`** (new): `Settings` type for the 7 targets, key-based row lookup (reads the Key column fresh each update rather than assuming fixed row numbers — more robust if the sheet ever gets reordered), `getSettings()`/`updateSettings()`. Pure functions (`parseSettingsRows`, `computeSettingsUpdates`) tested in `src/lib/settings.test.ts` without needing to mock network calls.

**`src/screens/SettingsScreen.tsx`** (new): account section (sign-in status + sign-in/out button, now the primary home for this control) always visible; the 7 targets only shown once signed in, editable, single "Зберегти" writes all of them back.

**Verified:** `npm run test` (22/22 pass), `npm run build` clean, not-signed-in state confirmed in a live browser session (account section + targets correctly hidden until signed in).

**Next steps:**

- Developer signs in for real; confirms Settings loads the actual sheet values and a save round-trips correctly
- Build Today screen (daily log, quick-add, progress vs. Settings targets, meal-gap warning using `src/lib/health.ts`)
- Build the Dishes half of the Foods screen
- Build Blood Sugar screen
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults
