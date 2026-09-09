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

## 2026-08-13 — End-to-end verification, and a real gap found + fixed: mom doesn't speak English

**Google sign-in and full round-trip confirmed working by the developer**, live: Settings loaded the real sheet values (140/18/1500/5/3/4/7.8, matching the template), a Settings save round-tripped correctly, and Foods successfully looked up "Гречка" against the bundle and displayed the estimate.

**Root cause of the earlier sign-in trouble, for the record:** not a config problem — the developer's browser tab was a stale leftover from an earlier dev-server session on a different port than the one actually running, so it kept reporting the old port as its origin to Google no matter what was registered. Also added `http://localhost:5174` alongside `5173` as a second authorized JavaScript origin on the OAuth client, since dev-server ports drift across sessions.

**Real gap found during that live test:** the add-food form required typing *both* a Ukrainian and an English name (`nameEn` was a manual field, per the original design in the 2026-08-13 "dropped Claude" entry, which assumed "whoever adds a food supplies both names"). The developer pointed out mom doesn't speak English and has no way to supply that field herself. This wasn't a minor friction point — it would have made the core add-food feature unusable for its actual primary user.

**Fix:** `lookupFood()` now takes only `nameUk`. When a food isn't in the bundle, `translateUkToEn()` (new, in `src/lib/nutrition.ts`) translates it via [MyMemory](https://mymemory.translated.net/) — free, no API key, verified live (`гречка` → "Buckwheat", `куряча грудка` → "Chicken Breast", `квашена капуста` → "sauerkraut", all high-confidence) — before querying USDA. `FoodsScreen.tsx`'s add form now has a single name field; the resolved English name is stored automatically, never shown to mom. Updated `docs/project-brief.md` (Language compatibility) and `docs/technical-spec.md` (Nutrition lookup) to match — the earlier "no translation service needed" framing was wrong given a non-English-speaking user, not just incomplete.

**Verified:** `npm run test` (26/26 pass, including new `translateUkToEn` tests and updated `lookupFood` tests for the translate-then-USDA path), `npm run build` clean.

**Next steps:**

- Developer re-tests the add-food flow end-to-end for a food not in the bundle (e.g. something needing real USDA + translation, not just a bundle hit)
- Build Today screen
- Build the Dishes half of the Foods screen
- Build Blood Sugar screen
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Two more real gaps from live testing: silent write failures, raw-vs-cooked ambiguity

**Bug found: adding a food didn't actually persist.** Developer tested the translation fix (worked correctly), but reported the food list doesn't survive navigating away. Checked the live sheet directly — Ingredients tab had only the header row, nothing written, despite the app showing the item as saved.

**Root cause:** `readRange`/`writeRange`/`batchUpdateRanges` in `src/lib/sheets.ts` never checked `response.ok`. `fetch()` only rejects on network failure, not HTTP error status — so any failed Sheets API call (permission issue, bad request, anything) was silently swallowed, and callers (including `FoodsScreen`'s save handler and `SettingsScreen`'s save handler) proceeded as if it had succeeded. This means the Settings save "confirmation" screenshotted earlier in this session may also not have actually persisted — not yet independently re-verified against the sheet.

**Fix:** `authorizedFetch()` now checks `response.ok` and throws a descriptive error (including the parsed Google API error message when available) on failure. This is a single fix point covering all three functions. The underlying reason the actual POST was failing is still unknown — this fix makes it visible (surfaces in the existing error UI) rather than fixing a specific cause, since the real error message wasn't observable before. Developer needs to retry and report what error (if any) now shows.

**Second gap: raw vs. cooked matters a lot and wasn't represented.** Developer pointed out the ingredient database doesn't distinguish preparation state, and it matters significantly — e.g. raw buckwheat is ~71g carbs/100g vs. ~20g/100g cooked (water absorption), a >3x difference that would badly skew carb counting for a diabetes app.

**Fix:** `src/data/starter-foods.ts` — Ukrainian names now always state the prep qualifier explicitly (варена/сира/etc.) instead of leaving it implicit (e.g. `Гречка` → `Гречка варена`, plus added a `Гречка суха (сира крупа)` raw entry to show the pattern). `findInStarterData()` in `src/lib/nutrition.ts` was exact-match only, which would have broken lookups for anyone typing the old bare names — added a substring fallback so "гречка" still finds "Гречка варена" without requiring the full phrase. Also added a hint under the add-food name field nudging toward specifying preparation when it matters — the deeper issue (auto-detecting intended prep state for USDA/translation-sourced foods) isn't solvable automatically, so this is a mitigation, not a full fix; documented as a known limitation.

**Verified:** `npm run test` (27/27 pass), `npm run build` clean.

**Next steps:**

- Developer retries adding a food and reports the actual Sheets API error now surfaced, so the real write failure can be root-caused
- Once writes are confirmed working: re-verify Settings save actually persisted, re-verify a food add persists across a refresh
- Build Today screen
- Build the Dishes half of the Foods screen
- Build Blood Sugar screen
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Built Dishes: cooked/prepared foods no longer live in Ingredients

**Developer's insight:** yesterday's raw-vs-cooked fix (stating prep state explicitly in Ukrainian names) was a patch, not the right home — it correctly pointed out that `docs/project-brief.md` already defined Ingredients as *raw* foods and Dishes as things *auto-calculated from* ingredients. Cooked buckwheat is a preparation, not a raw ingredient, so it belonged in Dishes all along.

**Schema change:** Dishes gains a `YieldGrams` column (total finished weight from the listed raw ingredients) and drops `Servings` — nutrient columns are now per 100g of the *finished* product, matching Ingredients' per-100g convention exactly, so mom logs a dish by portion grams just like an ingredient (no separate "servings" concept to reconcile). GI is computed as a carb-contribution-weighted average across ingredients (an approximation — true GI isn't additive — but the standard practical simplification; reduces to the single ingredient's own GI for a one-ingredient dish). Documented in `docs/technical-spec.md`.

**`src/lib/dishes.ts`** (new): `computeDishNutrition()` — pure, takes ingredient refs + yield weight + a lookup function, returns per-100g totals. `Dish` type, row↔object mapping (ingredients round-trip through the `IngredientsJson` column), `listDishes()`/`addDish()`.

**Scope boundary, deliberately drawn:** applied the raw/Dish split fully to **grains and legumes**, where cooking changes carb density 2-5x (dry buckwheat 71.5g→19.9g carbs/100g cooked; dry beans/lentils/chickpeas roughly triple in weight). **Left as directly-labeled cooked Ingredients rows:** meat/fish/eggs (~0 carbs regardless of cooking, the primary metric this app cares about) and lightly-boiled vegetables — potato, beet, pumpkin, corn (carb content barely changes when boiled). Extending the Dish model to those later is possible but wasn't worth the added entries for the accuracy gained. `src/data/starter-foods.ts` now has raw counterparts for every grain/legume moved out (e.g. `Гречка суха`, `Квасоля суха`), each with a code comment explaining the scope boundary.

**`src/data/starter-dishes.ts`** (new): the 12 moved items (buckwheat, both rices, oats, millet, pearl barley, semolina, cornmeal, pasta, 3 legumes), computed via `computeDishNutrition` at module load — never hand-typed nutrient values, true to "auto-calculated from ingredients." `YieldGrams` for each was derived from independently-sourced raw/cooked reference pairs (e.g. buckwheat's raw-343kcal and cooked-92kcal figures — both real USDA values fetched earlier this session — imply ~360g cooked yield per 100g dry). Sanity-checked in `src/data/starter-dishes.test.ts`: computed buckwheat and rice land within rounding of the real published cooked-form figures.

**`gi-table.ts`:** moving grains out of Ingredients broke GI matching for USDA queries phrased with "cooked" (the derived table only had "raw"-phrased keys after the move) — added explicit base-word entries (`"buckwheat": 54`, etc.) so lookups resolve regardless of exact phrasing.

**`FoodsScreen.tsx`:** added a Продукти/Страви sub-tab. Dishes browsing is intentionally minimal — search the precomputed starter bundle, add one as-is to the sheet. Composing a custom multi-ingredient recipe (picking several ingredients, entering grams and a yield weight) is a bigger form-building task, deferred to its own pass, same as Ingredients-only was deferred from the original Foods screen build.

**Verified:** `npm run test` (38/38 pass, including new `dishes.test.ts` and `starter-dishes.test.ts`), `npm run build` clean. Not yet live-tested with real sign-in (same constraint as always — that requires the developer).

**Needs a manual edit to the real spreadsheet** (small, not doing this via automation again after the earlier incident): rename the Dishes tab's `Servings` header (column C) to `YieldGrams`, and add `DateAdded` as a new column L.

**Next steps:**

- Developer renames the Dishes sheet header and adds the DateAdded column
- Developer retries the Ingredients write-failure repro from the previous entry now that it's fixed, and tests adding a starter dish
- Build Today screen
- Build Blood Sugar screen
- Custom multi-ingredient dish composition (the deferred "real" Dishes feature)
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Root cause found (Office-format file); two UX fixes

**Root cause of every silent-write failure, finally:** with error surfacing now in place (previous entry), the real message came through: `"Sheets API request failed: 400 — This operation is not supported for this document. The document must not be an Office file."` The spreadsheet was still an Office file (the uploaded `.xlsx`, edited via Google's Office-compatibility mode) — the Sheets API doesn't support write operations on files in that state, even though the Sheets website lets you edit them interactively. This explains both the original "food doesn't persist" report and (retroactively) why the earlier Settings-save "confirmation" didn't actually land either — same failure, silently swallowed until the previous entry's fix.

**Fix:** developer converted it via File → Save as Google Sheets, producing a true native file. Confirmed by checking the new file directly: no more `.xlsx` badge in the title bar, all 5 tabs and headers carried over correctly (including the two manual Dishes-tab edits from the last entry, already present). `VITE_SPREADSHEET_ID` updated to the new file's ID. Sign-in, Settings save, and adding an Ingredient/Dish all confirmed working end-to-end by the developer for the first time this session.

**UX fix 1 — added items appeared to vanish until switching tabs:** real bug, not perception. `FoodsScreen`'s search box is shared across the Ingredients/Dishes sub-tabs but was never cleared after a successful save — if any text was in the search box when a food was added (e.g. from checking whether it already existed), the new item was silently filtered out of view by that leftover query. Switching sub-tabs happened to "fix" it only because `switchSubTab` clears search as a side effect. Now both save handlers clear `search` directly.

**UX fix 2 — browsable/narrowing suggestion list, requested by developer:** they liked that Dishes' add form shows the full starter bundle up front and narrows as you type, and asked for the same on Ingredients (which previously required typing a full name and clicking "Знайти" with no visual browsing). `AddFoodForm` now shows a live-filtered list of `STARTER_FOODS` below the name field before a lookup is attempted; clicking an entry populates all fields immediately (no network round-trip needed, the full entry is already in hand client-side) via a new shared `applyEstimate()` helper (also used by the async `handleLookup` path, removing duplication). "Знайти" remains for anything not visible in the bundle list (triggers the USDA/translation fallback as before).

**Verified:** `npm run test` (38/38 pass), `npm run build` clean.

**Next steps:**

- Build Today screen
- Build Blood Sugar screen
- Custom multi-ingredient dish composition (the deferred "real" Dishes feature)
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Another instance of the same naming gap: dairy fat %

**Live testing paid off again:** developer noticed the browsable suggestion list also surfaced a pre-existing bug fixed for free — `findInStarterData` used to return only the first match, so multiple rice/etc. variants were invisible; the new list shows all of them. Then spotted a real data-accuracy gap: "Молоко" doesn't say it's 2.5% fat milk — that detail only lived in `nameEn` ("milk, 2.5%"), invisible to mom since she never sees English. Same class of bug as the raw-vs-cooked one fixed earlier today: any detail the nutrient values depend on must be stated in `nameUk`, not just carried in `nameEn`.

**Audited the whole bundle for the same pattern, found 3 more:** `Кефір` → `Кефір знежирений` (low-fat), `Йогурт натуральний` → `Йогурт натуральний знежирений` (low-fat), `Яловичина (варена)` → `Яловичина пісна (варена)` (lean) — all had a fat-content/cut qualifier in `nameEn` not reflected in `nameUk`. Added a comment above the dairy section flagging this as a pattern to keep checking for as the bundle grows.

**Verified:** `npm run test` (38/38 pass, updated `nutrition.test.ts` assertions for the renamed kefir entry), `npm run build` clean.

**Next steps:**

- Build Today screen
- Build Blood Sugar screen
- Custom multi-ingredient dish composition (the deferred "real" Dishes feature)
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Bring NameEn back, as a subtle fallback label

Rather than keep chasing every instance of the "detail only in nameEn" bug one at a time (dairy fat %, cooking state before that), developer suggested showing NameEn again — not for mom to read, but as a quiet secondary label wherever a food is listed, so any detail that didn't make it into the Ukrainian name is still visible to whoever's reviewing (the developer, later a translator) instead of silently missing.

Added `.food-name-en` (small, muted gray) next to the Ukrainian name in: the Ingredients list, the add-food suggestion list, and the post-lookup review line in `FoodsScreen.tsx`. Updated `docs/project-brief.md` and `docs/technical-spec.md`'s "never shown to mom" language — the constraint was always "never asked to *supply* or *read* English," not "never displayed anywhere."

**Verified:** `npm run test` (38/38 pass), `npm run build` clean.

**Next steps:**

- Build Today screen
- Build Blood Sugar screen
- Custom multi-ingredient dish composition (the deferred "real" Dishes feature)
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Made Dish schema consistent with Ingredient

Developer asked for the NameEn treatment on Dishes too, and pointed out the schemas should be consistent generally — a fair catch: `Dish` used `dishName` instead of `nameUk`, had no `nameEn` at all (dropped when grains/legumes moved out of Ingredients earlier today), and no `source` field.

**`src/lib/dishes.ts`:** `Dish.dishName` → `nameUk`; added `nameEn: string` and `source: "starter" | "manual"`. Column layout now mirrors Ingredients at both ends — `NameUk`/`NameEn` first, `Source`/`DateAdded` last, identical nutrient column names in between — with the two Dish-only fields (`IngredientsJson`, `YieldGrams`) inserted in the middle rather than tacked on wherever was convenient.

**`src/data/starter-dishes.ts`:** restored the `nameEn` values that existed before the raw/Dish split (`"buckwheat, cooked"`, `"white rice, cooked"`, etc. — these were simply dropped, not researched fresh) and added `source: "starter"` to each computed entry.

Since the real Dishes tab was still empty (safe to restructure losslessly), redid the column layout to match rather than just append the two new columns at the end — cheaper to do now than migrate later. **Needs the developer to replace the Dishes tab's header row** with, in order: `NameUk, NameEn, IngredientsJson, YieldGrams, Carbs_g, GI, Fiber_g, Sugars_g, Protein_g, Fat_g, Calories_kcal, Sodium_mg, Source, DateAdded`.

**Verified:** `npm run test` (39/39 pass), `npm run build` clean.

**Next steps:**

- Developer replaces the Dishes tab header row
- Build Today screen
- Build Blood Sugar screen
- Custom multi-ingredient dish composition (the deferred "real" Dishes feature)
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Session wrap-up (context handoff)

Developer's context was at 83% — recording a clean snapshot here so a fresh session can pick up without re-reading the whole chronological log above. (`README.md`'s Status section now has the same summary, kept short, for a faster first read than this log.)

**Confirmed working end-to-end, live, by the developer** (not just unit-tested): Google sign-in; adding an Ingredient (bundle match, USDA+translation fallback, and manual entry all reachable); adding a starter Dish; editing and saving Settings; the real Dishes tab header row was manually updated to match the new 14-column schema and independently verified by re-reading it back from the sheet.

**Repo state:** working tree clean, all commits pushed, `main` at `1becc51`. Local `.env` has all three credentials filled in and working (`VITE_GOOGLE_CLIENT_ID`, `VITE_SPREADSHEET_ID`, `VITE_USDA_API_KEY` — not committed, as expected).

**Architecture, settled this session (see docs/technical-spec.md and docs/project-brief.md for the full current versions, these are just pointers):**
- PWA, one codebase for mobile + Windows desktop, Google Sheets as both database and cross-device sync layer
- Nutrition lookup: bundled starter data (`src/data/starter-foods.ts` = raw only, `src/data/starter-dishes.ts` = cooked/prepared, computed via `src/lib/dishes.ts`'s `computeDishNutrition`) → USDA FoodData Central fallback, translated from Ukrainian automatically (`translateUkToEn` in `src/lib/nutrition.ts`, MyMemory API) — mom never types or reads English to use the app, though NameEn is shown as a subtle secondary label as a fallback cross-check
- Ingredients and Dishes schemas are deliberately field-consistent (NameUk/NameEn first, Source/DateAdded last, same nutrient column names)
- `src/lib/sheets.ts`'s `authorizedFetch` checks `response.ok` and throws with the parsed API error — this was a real bug (silent failures) until fixed mid-session, worth knowing if anything seems to "not save" again

**Immediate next steps, roughly in order of what unblocks the most:**
1. Build Сьогодні (Today) screen — daily log, quick-add meal, progress vs. Settings targets, meal-gap warning using the already-built `src/lib/health.ts`
2. Build Цукор (Blood Sugar) screen
3. Custom multi-ingredient dish composition (Dishes currently only supports adding pre-computed starter dishes as-is)
4. Run the interview with mom (trigger phrase in `CLAUDE.md`) — the architecture doesn't depend on her answers, but exact targets/food lists do

**Known rough edges, not yet addressed:**
- No offline support beyond the PWA app-shell cache (data reads/writes need connectivity)
- Dishes' GI is a carb-weighted approximation, not lab-measured — documented, not a bug
- Starter bundle is a first pass (~50 ingredients, 12 dishes) — expected to grow as real usage surfaces gaps, per the "mom reviews before saving" design

## 2026-08-13 — Built the Today screen

**Why now:** unblocks the most per the standing next-steps list above — it's the app's main daily-use screen, and everything it depends on (Settings, Ingredients, Dishes) was already built.

**`src/lib/dailyLog.ts`** (new): typed data-access layer over the DailyLog tab, following the same column-order/row-mapper pattern as `ingredients.ts`/`dishes.ts`. Column order: `Timestamp, MealType, ItemName, PortionGrams, Carbs_g, GI, Fiber_g, Sugars_g, Protein_g, Fat_g, Calories_kcal, Sodium_mg, GL, Notes` (A–N), matching `docs/technical-spec.md`. Key pure functions (unit-tested in `dailyLog.test.ts`, 12 tests, no network mocking needed):
- `computePortionNutrition` — scales an item's per-100g values to a logged portion; GI itself doesn't scale.
- `buildLogEntry` — builds a full entry including GL (`calcGlycemicLoad` from `health.ts`), reusing the existing `IngredientNutrition` shape from `dishes.ts` so Ingredients and Dishes are both directly loggable without a translation layer.
- `suggestMealType(now)` — defaults the quick-add form's meal type from time of day (morning→Сніданок, midday→Обід, evening→Вечеря, else→Перекус); UI convenience, not health logic.
- `isSameLocalDate`/`localDateKey` — local-calendar-date filtering for "today", since `Timestamp` is stored as ISO/UTC.

**`src/screens/TodayScreen.tsx`** (new): sign-in gate (same pattern as Foods/Settings) → fetches Settings, Ingredients, Dishes, and the full DailyLog on sign-in. Renders:
- Two progress bars (carbs, calories) — today's totals vs. `Settings` targets, red fill past 100%.
- Meal-gap warning (`mealGapWarning` from `health.ts`, against the most recent log entry overall, not just today's — a late-night entry should still count against tomorrow morning's gap) and a per-meal-type fat warning (`checkFatLimit`, since the no-gallbladder constraint is per-meal, not daily) — both shown only when triggered.
- Quick-add form: meal-type dropdown, a live-narrowing combined Ingredients+Dishes search reusing the same "browsable list, click to pick" pattern from `FoodsScreen`'s `AddFoodForm`, a portion-grams field with a live preview (carbs/calories/GL) before saving, optional notes.
- Today's entries grouped under meal-type headers.

**Scope cut, deliberate:** the tech spec's "most recent blood sugar reading vs. target range" for the Today summary is deferred until the Blood Sugar screen/data-access layer exists (next on the list) — nothing to read yet.

**`.claude/launch.json`** added (new) so the dev server can be previewed via the browser tool going forward — didn't exist before this session.

**Verified:** `npm run test` (51/51 pass), `npm run build` clean, not-signed-in state confirmed in a live browser session (Today screen renders the sign-in gate correctly; Foods screen re-checked too since this touched the shared `uk.ts`/`index.css` files, no regression).

**Needs the developer to check:** the real spreadsheet's DailyLog tab header row should already match the column order above (it was part of the same original template built from this technical-spec.md column list, unlike Dishes which needed a later migration) — not independently re-verified against the live sheet this session, worth a quick check before the first real add.

**Next steps:**

- Developer signs in for real and adds a log entry; confirms it persists in the DailyLog tab and the progress bars/warnings react correctly
- Build Blood Sugar screen; once built, wire its most-recent-reading into the Today screen's summary
- Custom multi-ingredient dish composition (the deferred "real" Dishes feature)
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Built the Blood Sugar screen; wired it into Today

**Why now:** last of the four tabs to get built, and it unblocked the Today screen's deferred "most recent blood sugar reading vs. target range" summary line from the tech spec.

**`src/lib/health.ts`:** added `checkBloodSugarRange(valueMmolL, min, max)` — pure, returns `{tooLow, tooHigh, inRange}`, boundary values count as in range. Unit-tested in `health.test.ts` (4 new tests, 10 total).

**`src/lib/bloodSugar.ts`** (new): typed data-access layer over the BloodSugar tab, same pattern as the other tabs. Column order: `Timestamp, ValueMmolL, Context, Notes` (A–D), matching `docs/technical-spec.md`. `Context` stores English keys (`fasting`/`after-meal`/`other`), mapped to Ukrainian labels via `uk.ts` — same convention as `Ingredient.source`, not the "store the Ukrainian text directly" convention `MealType` uses, since Context reads more like an internal category than freeform-ish UI text. `latestBloodSugarEntry()` picks the most recent by timestamp. Tested in `bloodSugar.test.ts` (5 tests, no network mocking).

**`src/screens/BloodSugarScreen.tsx`** (new): same sign-in-gate/fetch-on-signin pattern as the other three screens. Shows the latest reading with an in-range/out-of-range status line, a quick-add form (value, context dropdown, optional notes), and full history newest-first with an inline flag on any out-of-range past reading.

**`src/screens/TodayScreen.tsx`:** now also fetches `listBloodSugarEntries()` and shows the latest reading + status next to the progress bars, using `uk.today.latestBloodSugar()` — fulfills the tech spec's Today-summary requirement that was deferred in the previous entry pending this screen existing.

**`App.tsx`:** wired in `BloodSugarScreen`, replacing the last placeholder; removed the now-unused `ScreenPlaceholder` helper since nothing renders through it anymore.

**Verified:** `npm run test` (60/60 pass), `npm run build` clean, live browser check of both Today and Blood Sugar in the not-signed-in state (correct sign-in gates, no console/network errors on either — the app's dev-server module graph loads cleanly with the new files included).

**Needs the developer to check:** the real spreadsheet's BloodSugar tab header row should match `Timestamp, ValueMmolL, Context, Notes` — from the same original template as DailyLog, not independently re-verified against the live sheet this session.

**Status:** all four tabs (Сьогодні, Продукти, Цукор, Налаштування) are now built. Remaining work is real-world verification of the two newest screens, the deferred custom-dish-composition feature, and mom's interview.

**Next steps:**

- Developer signs in for real; adds a blood sugar reading and a log entry, confirms both persist and the Today screen's summary (progress bars, blood sugar line, warnings) reacts correctly
- Custom multi-ingredient dish composition (the deferred "real" Dishes feature — still the only major feature gap now that all four tabs exist)
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Custom multi-ingredient dish composition

**Why now:** the last major feature gap flagged since the Foods screen was first built — Dishes could only add pre-computed starter dishes as-is, not a real recipe (e.g. borscht) composed from whatever's in Ingredients.

**`src/screens/FoodsScreen.tsx`:** added `ComposeDishForm`, alongside the existing starter-bundle `AddDishForm` behind a new mode toggle ("З бази" / "Власний рецепт") in the Dishes add flow. `ComposeDishForm`:
- Dish name field, plus a repeatable ingredient row (name + raw grams) — "Додати інгредієнт" appends a row, each row past the first can be removed.
- Each row's name field must resolve to an *existing* Ingredients-tab entry (exact match, case/whitespace-insensitive) — reuses the same browsable-suggestions-while-typing pattern as `AddFoodForm`/`AddLogEntryForm`. An unresolved name that doesn't match anything shows a hint pointing back to the Ingredients tab, rather than silently allowing a recipe that references a nonexistent food.
- A yield-grams field (total finished weight) with the same water-dilution explanation used elsewhere in the app.
- Live preview (per-100g carbs/calories/GI) once every filled row resolves and has valid grams and yield is set — computed via the existing `computeDishNutrition` (`dishes.ts`, already pure and unit-tested), never hand-typed, same principle as the starter dishes.
- On save: resolves `nameEn` via the already-built `translateUkToEn` (`nutrition.ts`) so mom never has to supply an English name for her own recipes either, consistent with the rest of the app; falls back to `""` if translation is unavailable rather than blocking the save. `Source = "manual"`.

No new data-access-layer code needed — `computeDishNutrition`, `addDish`, and `translateUkToEn` all already existed and are reused as-is; this was purely a UI-composition task on top of them.

**Verified:** `npm run test` (60/60 pass, unchanged — the new logic is UI state built entirely on already-tested pure functions, so no new unit tests were needed), `npm run build` clean, live browser check confirmed no regressions on the Foods tab's not-signed-in state (the compose form itself is gated behind sign-in like the rest of Foods, so its actual rendering — not just the toggle — still needs the developer's live sign-in to verify, same limitation as every other form in this app).

**Status:** all four tabs are built, including the previously-deferred custom-Dish feature. The only remaining planned work is real-world verification of the newer screens/forms and mom's interview.

**Next steps:**

- Developer signs in for real; tries composing a custom dish (e.g. a simple 2-3 ingredient recipe), confirms it saves correctly and the computed per-100g values look right, and re-confirms the blood sugar + daily log flows from the last two entries
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — UX fix: browse-first ingredient picking, plus favorites

**The flaw, as reported:** when composing a custom dish, each ingredient row required typing something before any suggestions appeared at all — you had to already half-know the name to find it, for a picker whose entire job is picking from an existing list. Developer's framing: "I do not see the point of hiding them — they are needed for composing dishes." Distinct from `AddFoodForm`'s bundle-suggestion list (a nutrition-lookup helper for creating a *new* Ingredients row from a template), which was correctly left alone — the fix is scoped to *picking an already-saved ingredient*, not to the add-new flow.

**`src/screens/FoodsScreen.tsx` — `ComposeDishForm`:** the ingredient-row picker now shows the full Ingredients list by default (empty search matches everything, same pattern already used by `TodayScreen`'s meal-item picker), narrowing as you type, and hides again once the row already matches a picked item — so the list doesn't linger under a finished selection. Wrapped in a `max-height`/`overflow-y: auto` container (`.compose-suggestions` in `index.css`) since the full list can now be 50+ items.

**Favorites, to make the now-always-visible list actually useful for a full bundle:** added `favorite: boolean` to `Ingredient` (`src/lib/ingredients.ts`), as a new trailing `Favorite` column (M) on the Ingredients tab — appended rather than inserted mid-schema, so no existing column shifts and no data migration, just a new header cell. `TRUE`/`FALSE`-style boolean parsing (`toBoolean`), defaults to `false` for any pre-existing row missing the column. New `setIngredientFavorite(nameUk, favorite)` updates a single cell in place via the existing `batchUpdateRanges` (same mechanism `settings.ts` uses), found by exact-match row lookup. New `sortFavoritesFirst()` — pure, stable, favorites-first — unit-tested in `ingredients.test.ts` (2 new tests; 5 total for the file, up from 3, including a `rowToIngredient`/`ingredientToRow` round-trip update for the new column).

Applied `sortFavoritesFirst` in both places ingredients are browsed: the main Ingredients list in `FoodsScreen` (now with a ★/☆ toggle button per row — optimistic update, reverts and surfaces the Sheets error if the write fails, same pattern as everywhere else `authorizedFetch` can throw) and `ComposeDishForm`'s row picker (favorited items marked with a ★ prefix in the suggestion list, so they're recognizable while browsing, not just sorted to the top).

**`addIngredient()` signature changed:** now takes `Omit<Ingredient, "dateAdded" | "favorite">` — new ingredients always start unfavorited (`false`); marking one favorite is a deliberate action from the main list afterward, not a decision forced at creation time.

**Deliberately left alone (per the developer's "add-ingredient will be a genuine add-new" framing):** `AddFoodForm`'s bundle-suggestion list is a different thing — a template for filling in a *new* row's nutrition values, not a picker over already-saved ingredients — so it keeps its own "type first, then match" behavior. No change there.

**Verified:** `npm run test` (62/62 pass), `npm run build` clean, live browser check confirmed no regressions on the not-signed-in state across all screens (the changed forms are gated behind sign-in, so the actual browsing/favoriting UX still needs the developer's live sign-in to see, same limitation as every form in this app).

**Needs a manual edit to the real spreadsheet** (small, single header cell — same category of change as the Dishes header migration earlier): add `Favorite` as the header in the Ingredients tab's column M1. Existing rows don't need anything filled in — a blank cell reads as `false` (not favorited) automatically.

**Next steps:**

- Developer adds the `Favorite` header cell to the Ingredients tab, then signs in for real and confirms: the full ingredient list appears immediately when composing a dish, favoriting an ingredient from the main list persists and sorts it to the top, and composing/saving a dish still works end-to-end
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-13 — Correction: the actual ask was bundle availability, not a picker-UI tweak

The previous entry's fix (browse-first `ComposeDishForm` picker) was a real improvement but missed the developer's actual point, confirmed after they had to restate it a second time: **"the main ingredients tab should just include the whole list of available ingredients by default — not require [adding] them to the personal list to make them available for dish composing or choosing for a meal."**

This traces back to the original design intent in `docs/project-brief.md` ("a curated starter set... ships in the Ingredients tab from day one") — somewhere during implementation, the bundle became client-side reference data that had to be individually searched-and-saved into the real Ingredients sheet via `AddFoodForm` before it was usable anywhere else (dish composition, meal logging). That per-item save step was the actual friction, not the picker's search-vs-browse framing — that earlier fix only made the *typing* unnecessary, not the *saving*.

**The real fix — `mergeWithStarterFoods()` (`src/lib/ingredients.ts`) and `mergeWithStarterDishes()` (`src/data/starter-dishes.ts`, kept out of `lib/dishes.ts` to avoid a circular import since `starter-dishes.ts` already depends on it):** both merge the bundle with the personal sheet at read time, keyed by name, sheet rows winning ties (so an edit or a favorite always overrides the bundle default). Wired into every place ingredients/dishes are browsed or picked:
- `FoodsScreen`'s main Продукти/Страви lists — now show the full bundle immediately, merged with whatever's actually saved, not just saved rows
- `ComposeDishForm`'s ingredient picker — same merged list (previous entry's browse-first UI fix stays, now operating on the right data)
- `TodayScreen`'s meal-logging picker — same merge applied to both Ingredients and Dishes, so a bundle item is loggable for a meal without ever being saved (a `DailyLog` row stores its own scaled nutrition values directly, so nothing downstream needs the ingredient to exist as a sheet row)

**Favorites now double as the save mechanism for bundle items:** since a bare bundle entry has no sheet row for `setIngredientFavorite` to update, `FoodsScreen`'s `handleToggleFavorite` now branches — an already-saved ingredient gets its Favorite cell updated in place as before; a bundle-only one gets `addIngredient(..., favorite: true)` in a single write, which both saves and favorites it in one action. This is now the *only* implicit "add" the app performs, and only as a direct consequence of the developer/mom explicitly starring something — never silent, never automatic otherwise. Lines up with the developer's original phrasing: "add-ingredient will be a genuine add-new" (reserved for real new foods) + "I would only have an option to save favorite ingredients."

**Dish composition accepts referencing a bundle-only ingredient** (its `IngredientsJson` name won't resolve to an actual Ingredients row if read back later) — harmless, since a Dish's nutrition is computed once at save time and stored as static columns, never re-resolved. Documented as an accepted gap in `docs/technical-spec.md`'s new "Ingredient & Dish availability" section, along with the merge/favorites mechanics.

**`docs/project-brief.md` and `docs/technical-spec.md` updated** to describe the merge-at-read-time model (not "ships pre-populated in the sheet," which was the original but impractical framing — updating ~60+ rows in the live spreadsheet every time the bundle changes would be exactly the kind of manual Sheets busywork this app is supposed to spare mom from; merging client-side ships bundle updates via ordinary code deploys instead).

**Verified:** `npm run test` (68/68 pass — 6 new tests for `mergeWithStarterFoods`/`mergeWithStarterDishes`), `npm run build` clean, live browser check confirmed no regressions on the not-signed-in state (bundle browsing itself is still gated behind sign-in like everything else in Foods/Today, since favoriting and meal-logging both need to write to the sheet regardless — so the merged-list UX still needs the developer's live sign-in to see for real).

**Next steps:**

- Developer adds the `Favorite` header cell to the Ingredients tab (still pending from the previous entry), signs in for real, and confirms: the full bundle (not just previously-saved items) appears immediately in the Foods lists, the dish composer, and the Today meal picker; favoriting a never-saved bundle ingredient saves it in one step; composing a dish from an unsaved bundle ingredient still saves correctly
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-14 — UX fix: custom-recipe ingredients no longer a peer tab to browsing dishes

**The flaw, as reported:** "The dishes tab right now equally displays dishes and ingredients. Ingredients should not be there — they should be available when creating custom dish." Confirmed via a clarifying question: not a bug in the plain browse list (that already only ever showed dishes), but the add-dish flow's "З бази" / "Власний рецепт" toggle — styled with the exact same `food-subtabs` classes as the top-level Продукти/Страви switcher — made "compose a custom recipe from ingredients" look like a co-equal browsing mode sitting next to "browse starter dishes," when it should read as something you deliberately step into.

**`src/screens/FoodsScreen.tsx`:** replaced the tab-style toggle with a linear flow — opening "Додати страву" goes straight into `AddDishForm` (browse/add from the bundle), with a subordinate text link below it ("Створити власний рецепт з кількох продуктів →") that switches to `ComposeDishForm`; a matching "← Назад до готових страв" link goes back. New `.link-button` style in `index.css` (underlined text, no button chrome) makes the visual hierarchy clear: one primary path, one clearly-secondary escape hatch — not two equal tabs.

**Verified:** `npm run test` (68/68 pass, no logic changed so no new tests needed), `npm run build` clean, live browser check confirmed no regressions on the not-signed-in state.

**Next steps:**

- Developer adds the `Favorite` header cell to the Ingredients tab (still pending), signs in for real, and confirms the restructured add-dish flow reads correctly and both paths (bundle add, custom compose) still save
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-14 — Fixed "Знайти" silently guessing among multiple bundle matches

**The bug, spotted live:** developer typed "рис" in the add-ingredient form and clicked "Знайти" — got back "Базова база (white rice, raw)" with no indication that "Рис бурий сирий" (brown rice) also matched. Root cause: `findInStarterData` (`src/lib/nutrition.ts`) does an exact-then-substring match and, on multiple substring candidates, silently returns the first one in array order — fine as an internal helper, but "Знайти" surfaced that arbitrary pick as if it were the only match, when the *browsable suggestion list* shown while typing (before clicking "Знайти") already lists every match and lets you pick the right one directly.

**Fix — `src/lib/nutrition.ts`:** removed `lookupFood()` (bundle-first, then translate+USDA) and its private `toEstimate()` helper, replacing both call sites with a new `lookupExternal()` that only translates + queries USDA, never touches the bundle. `findInStarterData()` was also removed — it existed solely to support `lookupFood()`, and had no other caller once that was gone (confirmed via search before deleting, not just assumed). `AddFoodForm`'s "Знайти" button (`src/screens/FoodsScreen.tsx`) now calls `lookupExternal`, so a bundle name with multiple candidates is *only* ever resolved by picking from the visible list — "Знайти" can no longer silently guess.

**Verified:** `npm run test` (63/63 pass — 5 fewer than before, from deleting the now-pointless `findInStarterData` tests rather than keeping dead-code coverage), `npm run build` clean, live browser check confirmed no regressions on the not-signed-in state.

**Next steps:**

- Developer adds the `Favorite` header cell to the Ingredients tab (still pending), signs in for real, and tries "Знайти" on an ambiguous bundle name (e.g. "рис") to confirm it now goes to USDA instead of guessing
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-14 — USDA-side ambiguity: "next match" cycling

**Still guessing, just now on the USDA side:** the previous entry stopped "Знайти" from silently picking one of several *bundle* matches, but live testing (screenshots: "червона квасоля" → a red-beans-shaped USDA hit with 0g carbs; bare "квасоля" → a 2.8g-carb "bean" match, clearly the wrong item for dry/cooked beans) showed the same problem still happens on the USDA side — `lookupUsda` requested `pageSize: "1"`, so it always silently committed to USDA's single top-ranked result.

**Correction to something I said:** this was framed as a USDA API limitation in the prior response — it isn't. USDA's search endpoint already returns multiple ranked matches per query; `pageSize: "1"` was our own code choosing to only ask for one.

**Fix — `src/lib/nutrition.ts`:** `lookupUsda()` (single result) replaced with `searchUsda()`, requesting `USDA_CANDIDATE_COUNT = 5` results in one request and returning all of them as `NutritionEstimate[]`. `lookupExternal()` → `lookupExternalCandidates()`, same shape (translate, then delegate to `searchUsda`), also now returning an array (`[]` instead of `null` when nothing turns up). Each candidate's `nameEn` is now USDA's own `description` field (e.g. "Beans, kidney, red, mature seeds, canned") rather than the translated query — the query text is identical across all candidates and can't distinguish them, but each item's own description can, and it's also just a more specific/useful record than before. GI lookup tries the original query first, then falls back to the candidate's description — USDA's comma-led phrasing ("Beans, kidney, ...") doesn't substring-match the GI table's "kidney beans"-style keys as reliably as the plain translated query does, so trying the query first avoids losing GI matches that used to work.

**`src/screens/FoodsScreen.tsx` — `AddFoodForm`:** "Знайти" now fetches and stores all candidates (one request), applies the first, and shows "Інший варіант" ("Variant N of M") whenever there's more than one — clicking it cycles through the already-fetched list with no extra network call. Candidates are cleared whenever the name field is edited, so a stale cycle-through doesn't linger after the query changes.

**Verified:** `npm run test` (64/64 pass — `nutrition.test.ts` rewritten around `searchUsda`/`lookupExternalCandidates`, including a new case confirming the GI query-then-description fallback), `npm run build` clean, live browser check confirmed no regressions on the not-signed-in state.

**Next steps:**

- Developer adds the `Favorite` header cell to the Ingredients tab (still pending across a few entries now), signs in for real, and retries "червона квасоля"/"квасоля" to confirm "Інший варіант" surfaces a better match than the first guess
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-14 — Removed a real bug from the previous entry: GI borrowed from the query, not the actual match

**Spotted live, immediately:** searching "рис" (rice) surfaced "Rice crackers" as a USDA candidate — a completely different, processed product — with GI 73 pre-filled, as if that were a verified value for rice crackers specifically.

**Root cause:** the query-based GI fallback added in the previous entry (`lookupGI(queryNameEn) ?? lookupGI(food.description)`) was too permissive. "рис" translates to "rice," which substring-matches "white rice" in the GI table — and that value then got applied to *whichever* USDA candidate the query happened to surface, including ones with no real relationship to plain rice. The fallback was added to handle USDA's comma-led phrasing (e.g. "Beans, kidney, red, ...") not matching table keys like "kidney beans," but it couldn't distinguish "this candidate is actually the food the query implies" from "this candidate merely came up in a search for that query" — those aren't the same thing.

**Fix — `src/lib/nutrition.ts`:** `usdaFoodToEstimate()` now looks up GI *only* against the candidate's own `description`, never the original query. Traded off deliberately: a few more legitimate matches (like comma-phrased USDA beans entries) will now show a blank GI requiring manual entry, instead of a plausible-looking but unverified guess. For a diabetes-tracking app, a blank field that visibly demands attention is safer than a wrong one that looks authoritative and might get missed during review — same reasoning as why the app has never auto-defaulted GI to 0 or skipped validation on it.

**Verified:** `npm run test` (65/65 pass — the `searchUsda` GI test updated to expect `null` for the comma-phrased case, plus a new regression test reproducing the exact "рис" → "Rice crackers" scenario), `npm run build` clean, live browser check confirmed no regressions on the not-signed-in state.

**Next steps:**

- Developer adds the `Favorite` header cell to the Ingredients tab (still pending across several entries now), signs in for real, and confirms GI now comes back blank rather than wrong for USDA matches unrelated to the search term
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-14 — USDA candidates as a browsable list; a validation bug found along the way

**UX change requested:** the previous entries' "Інший варіант" one-at-a-time cycling through USDA candidates was itself an inconsistency — everywhere else in the app (bundle suggestions, dish-composer ingredient picker) already shows a full browsable list up front rather than paging through hidden options one at a time. Developer asked for the same treatment here, plus asked whether more than 5 candidates could be pulled.

**Clarification given:** USDA's search API isn't capped at 5 — that was our own `pageSize` choice. Literally "all" isn't practical or useful though (a generic query can have hundreds of low-relevance hits); settled on a larger fixed batch instead.

**`src/lib/nutrition.ts`:** `USDA_CANDIDATE_COUNT` raised from 5 to 20.

**`src/screens/FoodsScreen.tsx` — `AddFoodForm`:** removed `candidateIndex`/`handleNextCandidate` cycling. "Знайти" now fetches all candidates and lists them directly (`food-list food-list-scroll`, same scrollable-list pattern as the dish composer's ingredient picker — the `.compose-suggestions` CSS class was renamed to `.food-list-scroll` since it's now shared by both), each with an "Обрати" button. Nothing is auto-applied anymore; a result is only ever shown once explicitly picked — same "browse, don't guess" principle behind every other list in this app. The "Джерело" confirmation line now only appears once something's actually been picked (or once a search comes back with zero candidates, prompting manual entry) — showing it before a pick would have misleadingly read "Вручну — Не знайдено" while matches were sitting right there unpicked.

**Bug found while touching this code, unrelated to the ask:** `AddFoodForm`'s save validation (`NUMERIC_FIELDS.every((field) => Number.isFinite(parsed[field]) && parsed[field] >= 0)`) doesn't actually require a field to be filled — `Number("")` evaluates to `0` in JS, not `NaN`, so a blank field (e.g. an intentionally-left-blank GI, per the last two entries' whole point) would silently pass validation as a real `0` instead of blocking the save. This directly undermined the safety reasoning from the last two entries — a blank GI was supposed to force a deliberate manual entry, but the validation never actually enforced that. Fixed by checking `values[field].trim() !== ""` before the numeric checks. Audited for the same pattern elsewhere per the project's "fix the whole class of issue, not just the reported instance" precedent: found and fixed the identical bug in `SettingsScreen.tsx`'s save validation (`FIELDS.every((field) => Number.isFinite(parsed[field]))`, missing the same blank check) — a blank Settings field (e.g. `BloodSugarMin`) would have silently saved as `0` instead of being rejected.

**Verified:** `npm run test` (65/65 pass, unchanged — both validation fixes are UI-layer logic with no corresponding pure-function tests to update), `npm run build` clean, live browser check confirmed no regressions on the not-signed-in state.

**Next steps:**

- Developer adds the `Favorite` header cell to the Ingredients tab (still pending across several entries now), signs in for real, and confirms: the USDA candidate list shows all ~20 results for a query like "квасоля," picking one still works, and leaving a numeric field blank now correctly blocks saving in both the add-ingredient form and Settings
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-14 — Nudge toward more specific search terms

**Follow-up to the previous entry's noisy-results problem** (e.g. "квасоля" surfacing bean cooking liquid or "рис" surfacing rice crackers): discussed a few options (better hint text, clickable qualifier chips, real autocomplete) — went with the cheapest one, since a more specific *Ukrainian* query is what actually narrows USDA's own search results, and the browsable candidate list from the previous entry already covers picking the right one once results come back.

**`src/i18n/uk.ts`:** `foods.form.nameUkHint` (shown under the add-ingredient name field) now also suggests a type/variety qualifier (сухий, консервований, свіжий, морожений), not just preparation method as before — e.g. "квасоля суха" instead of bare "квасоля" both feeds a more specific USDA query and matches the bundle's own naming convention (which already qualifies by prep state, per the 2026-08-13 raw-vs-cooked entry).

**Verified:** `npm run test` (65/65 pass, text-only change), `npm run build` clean, live browser check confirmed no regressions on the not-signed-in state (the hint itself is behind sign-in like the rest of the add-ingredient form, so its actual wording still needs the developer's live sign-in to see rendered).

**Next steps:**

- Developer adds the `Favorite` header cell to the Ingredients tab (still pending across several entries), signs in for real, and works through the outstanding verification list from the last several entries: USDA candidate list, favorites, custom dish composition, blank-field validation
- Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults

## 2026-08-14 — Session wrap-up

**Repo state:** working tree has substantial uncommitted changes from today (see `git status`) — nothing from this session has been committed yet, last commit is still `ae40f48` from 2026-08-13. Every change today passed `npm run test` and `npm run build` at the time it was made; not re-verified as one combined diff.

**Built today, all four tabs now complete:**
- Цукор (Blood Sugar) screen — log a reading, latest-reading status, history with out-of-range flags — and wired its latest reading into Today's summary
- Custom multi-ingredient dish composition (`ComposeDishForm`) — the last major feature gap from `docs/technical-spec.md`
- Bundle availability fix: the starter bundle (Ingredients + Dishes) is now merged with the personal sheet at read time (`mergeWithStarterFoods`/`mergeWithStarterDishes`) and usable everywhere — Foods lists, dish composition, meal logging — without first being individually saved; favoriting a bundle-only item saves it as a side effect (the only implicit save left in the app)
- Add-dish flow restructured so composing a custom recipe reads as a deliberate secondary path, not a peer tab to browsing the starter bundle
- USDA lookup reworked twice today after live testing caught real problems: "Знайти" no longer re-guesses among bundle matches (skips straight to USDA); GI is only trusted from a candidate's own USDA description, never borrowed from the search query (was silently misapplying rice's GI to "Rice crackers"); results now list up to 20 candidates for direct picking instead of cycling one at a time
- Found and fixed a real validation bug (not from a bug report — surfaced while touching adjacent code): `Number("")` is `0` in JS, so blank numeric fields were silently passing validation as real zeros in both the add-ingredient form and Settings; fixed in both places
- Nudged the add-ingredient hint text toward more specific search terms, to reduce USDA result noise at the source

**Needs a manual spreadsheet edit, still pending:** add `Favorite` as the header in the Ingredients tab's column M1 (blank existing rows are fine, default to not-favorited).

**Nothing from today has been live-tested with a real sign-in yet** — everything above is unit-tested and build-clean, but the actual Sheets read/write round-trip for each new/changed flow (Blood Sugar, custom dish composition, favorites, the reworked USDA lookup, both validation fixes) still needs the developer's confirmation, same limitation as every session before this one.

**Immediate next steps:**
1. Add the `Favorite` header cell, then sign in for real and work through today's changes end-to-end
2. Decide whether to commit today's work (nothing committed yet — ask before committing, per standing instructions)
3. Run the interview with mom, fill in `docs/requirements-open-questions.md` and tune Settings defaults
4. No other known feature gaps remain — everything in `docs/technical-spec.md` is now built

## 2026-09-07 — Ran the interview with mom; health-context corrections and new feature requests

**Interview completed**, conducted live in Ukrainian per `CLAUDE.md`'s Interview Mode. Full structured answers (bilingual) are in `docs/requirements-open-questions.md` → Mom's Answers; checklist items there are now marked off against her actual answers.

**Health context corrected** — her answers surfaced a real discrepancy and two undocumented conditions:
- Gastritis is **Stage 2**, not Stage 3 as `CLAUDE.md`/`docs/project-brief.md`/`README.md` had said since the project's start — corrected in all three.
- She also has **fatty liver (hepatic steatosis)** and **elevated cholesterol**, not previously recorded anywhere. Added to `docs/project-brief.md`'s health-context table — both reinforce the existing fat-avoidance guidance (gallbladder) rather than introducing a new numeric constraint; no separate target was given for either.

**Settings defaults updated to match her stated targets:** `DEFAULT_SETTINGS` in `src/lib/settings.ts` — `dailyCaloriesTarget` 1500 → 1800, `mealsPerDay` 5 → 6 (she said minimum 6: 3 main + 3 snacks). These are only the fallback used when a key is missing from the sheet — the live spreadsheet already has all 7 Settings keys filled from the original template, so **the developer still needs to manually update the real Settings tab** (DailyCaloriesTarget → 1800, MealsPerDay → 6) for the change to actually show up in the app. `npm run test` (65/65) and `npm run build` still clean after the change.

**New wishes captured, not yet built:**
- Body-weight-over-time tracking (no `Weight` tab/schema exists yet)
- Blood-sugar-over-time statistics (current Blood Sugar screen only shows a plain history list, not a trend view)
- Longer-term: correlate blood sugar readings against what she ate, to identify specific foods to avoid. She independently proposed logging fasting *and* post-meal readings to support this — the `BloodSugar` sheet's existing `Context` field (fasting/after-meal/other) already models exactly that distinction, so the data model doesn't need to change; the actual correlation/analysis view is new work and not scoped yet. Treating as a future milestone, not immediate scope — logged in `docs/requirements-open-questions.md` → Open Questions.

**Unrelated but worth recording: Node.js is now installed on this dev machine.** `npm install`/`npm run test`/`npm run build` all ran successfully for the first time locally in this session (464 packages, 65/65 tests, clean build) — this had been a standing blocker noted all the way back in the 2026-08-12 entry ("Node.js isn't installed on the dev machine"). Worth re-verifying `npm run dev` too, since it's never been run on this machine either.

**Next steps:**
- Developer updates the live Settings sheet (1800 kcal, 6 meals/day) to match the new code defaults
- Add the `Favorite` header cell to the Ingredients tab (still pending from 2026-08-14) and work through that session's end-to-end verification backlog
- Scope weight tracking and blood-sugar statistics as small, well-defined features; treat food/blood-sugar correlation as a separate, larger future milestone
- Review mom's previously-shared Google Sheet (link in `docs/requirements-open-questions.md`) for real food/dish data to expand the starter bundle
- A few interview items are still open (see `docs/requirements-open-questions.md` → Open Questions): home-screen install preference, medication-logging scope, a full 10–20-item common-foods list

## 2026-09-07 — Local env verified working; designed (not yet built) the food/blood-sugar review feature

**`npm run dev` confirmed working on this machine, end to end.** This dev machine had no `.env` (only `.env.example` — `.env` is gitignored by design, so it never travels with the repo). Developer provided their existing Google OAuth Client ID, Spreadsheet ID, and USDA API key; wrote them to a local `.env` (not committed). After restarting the dev server, `initGoogleAuth` succeeded (no more "VITE_GOOGLE_CLIENT_ID is not set") and the OAuth request built correctly — the sign-in *popup* itself can't be completed by the automated browser tool (Google blocks popups opened by non-user-gesture automation, not an app bug), so the developer signed in manually in their own browser against the already-running dev server. **Developer confirmed live**: Settings, Foods (bundle + favorites), custom dish composition, Blood Sugar, and Today's log entry all work correctly signed in for real.

**Design session (scoping the "food ↔ blood-sugar correlation" wish from the interview) — fully designed and agreed, not yet implemented.** Went through several rounds with the developer to deliberately scope this down from a real analytics feature to something mom can do by eye, per her own suggestion. Final agreed design:

1. **"Meals before this reading" review** (on the Blood Sugar screen): each history entry gets an expandable list showing the last 6 `DailyLog` entries at or before that reading's timestamp, most-recent-first, with time-before-reading shown per item. Pure timestamp filter/sort — ISO strings already sort correctly lexically, so no date-parsing logic needed. No new schema (`DailyLog.Timestamp` and `BloodSugar.Timestamp` already exist). No correlation/statistics — mom reviews it herself.

2. **Watch/avoid flag, on both `Ingredient` and `Dish` independently**: new `glycemicFlag: "none" | "watch" | "avoid"` field, one new appended column on each sheet (same low-risk pattern as the `Favorite` column addition on 2026-08-14 — additive, blank reads as "none", no migration). Shown as a small cycling badge (like the existing ★/☆ favorite toggle) wherever ingredients/dishes are listed. Flagging a bundle-only (never-saved) item implicitly saves it first, reusing the existing favorite-driven save mechanism — same "the only implicit save is a direct consequence of an explicit user action" principle already established.
   - **No automatic flag propagation in either direction** — each item's flag is independently, manually set.
   - **Ingredient → Dish is a derived, non-persisted hint only**: a dish computes (at read time, from its already-stored `IngredientsJson` cross-referenced against current ingredient flags) whether it *contains* a flagged ingredient, and shows that as a distinct, separate note — it does **not** overwrite or force the dish's own explicit flag. Rationale (developer's, and correct): other ingredients in a dish can compensate/negate one problematic ingredient, and sometimes the *combination* or *cooking method* is the actual problem even when every ingredient is individually fine — so the dish's own flag must stay independently settable regardless of what its ingredients show.
   - **Dish → Ingredient is a manual suggestion, not automatic**: flagging a dish (watch/avoid) shows its ingredient list right there and lets mom optionally also flag specific ingredients — her choice, nothing forced.
   - Explicitly rejected along the way: automatic dish-flagging whenever an ingredient is flagged, automatic ingredient-watchlisting whenever a dish is flagged, and a separate "confirmed safe" tracking system to opt out of auto-suggestions — dropped once the design didn't need an auto-suggestion loop to escape from in the first place.

**Needs a manual spreadsheet edit once this gets built:** append `GlycemicFlag` as a new header — column N on Ingredients (after `Favorite`, M), column O on Dishes (after `DateAdded`, N). Same category of change as the two prior header-cell additions.

**Not yet built — this was a design-only session**, deliberately paused before writing code so the next session can implement against an already-agreed design instead of re-deriving it.

**Next steps (handoff to a fresh session):**
1. Implement the food/blood-sugar review feature exactly as designed above (schema, badge UI, derived dish indicator, dish→ingredient flagging prompt, meals-before-reading review) — no further design decisions should be needed, only implementation choices
2. After that: design the **meal-time reminder/notification mechanics** — mom confirmed during the interview she wants to be reminded when it's time to eat, but this is unscoped. Open question going in: does "reminder" mean a real OS-level push notification (the app currently has no backend/server component at all — Web Push needs one), or a lighter in-app signal (e.g., surfacing the existing `mealGapWarning` more prominently, or a browser-local scheduled notification while the PWA is open/installed)? Needs a scoping conversation before any implementation, same as the correlation feature got this session.
3. Everything else from the previous entry's next-steps still stands: live Settings sheet needs the 1800/6 update, `Favorite` header cell needs adding, mom's old Google Sheet hasn't been reviewed for bundle expansion, and weight tracking / blood-sugar trend charts are still unscoped small features waiting behind the two items above.

## 2026-09-07 — Built the food/blood-sugar review feature designed in the previous session

Implemented exactly as designed (no new design decisions needed):

- **`src/lib/glycemicFlag.ts` (new)**: shared `GlycemicFlag = "none" | "watch" | "avoid"` type, `toGlycemicFlag()` parser, `cycleGlycemicFlag()` (none → watch → avoid → none), and the `GLYCEMIC_FLAG_SYMBOL` badge glyphs (○/△/✕). Unit-tested in `glycemicFlag.test.ts`.
- **Schema**: `Ingredient.glycemicFlag` (Ingredients column N, appended after Favorite) and `Dish.glycemicFlag` (Dishes column O, appended after DateAdded) — same additive, no-migration pattern as the Favorite column. `addIngredient()`/`addDish()` take an optional `glycemicFlag` param (default `"none"`); new `setIngredientGlycemicFlag()`/`setDishGlycemicFlag()` mirror the existing favorite-setters. Bundle defaults (`starter-foods.ts` via `starterFoodToIngredient`, `starter-dishes.ts`) default to `"none"`.
- **Derived hint**: `dishContainsFlaggedIngredient()` in `src/lib/dishes.ts` — pure, cross-references a dish's stored `IngredientsJson` against current ingredient flags at read time. Confirmed by test that it's independent of the dish's own `glycemicFlag` in both directions.
- **`mealsBeforeTimestamp()`** in `src/lib/dailyLog.ts` — pure timestamp filter/sort (last 6 `DailyLog` entries at or before a given ISO timestamp, most-recent-first). No date-parsing needed since ISO strings sort lexically.
- **UI**: FoodsScreen's Ingredients and Dishes lists each got a cycling glycemic-flag badge (same one-click interaction as the ★/☆ favorite toggle, including the implicit-save-on-first-flag behavior for bundle-only items). A flagged dish (own flag ≠ none) shows its ingredient list inline with per-ingredient flag badges — optional, nothing forced. A dish containing a flagged ingredient (regardless of its own flag) shows a separate, clearly distinct hint. The ComposeDishForm ingredient picker and TodayScreen's meal-logging picker both show a small read-only flag glyph next to already-favorited items, for at-a-glance awareness while composing/logging. BloodSugarScreen: each reading has an expandable "meals before this reading" section showing the last 6 DailyLog entries with time-before-reading, no correlation math.
- All new pure logic is unit-tested; `npm run test` (76/76) and `npm run build` both clean.

**Not yet manually verified end-to-end signed-in** — same automation limitation as the previous session (Google's sign-in popup can't be completed by the browser tool), and this session's dev server port was already occupied by another session. Developer should do a quick manual pass: cycle flags on an ingredient and a dish, confirm the derived hint and the dish→ingredient prompt appear/disappear correctly, and expand a Blood Sugar entry's meals-before list.

**Needs a manual spreadsheet edit** (still pending, same as flagged last session): add `GlycemicFlag` as a header cell — column N on Ingredients, column O on Dishes. The app works without it (blank reads as `"none"`), but the header makes the sheet legible if mom or the developer opens it directly.

**Next steps:** design the meal-time reminder/notification mechanics (per the previous entry's open question — OS-level push vs. lighter in-app signal), then the still-pending items: live Settings sheet 1800/6 update, `Favorite` header cell on Ingredients, reviewing mom's old Google Sheet for bundle expansion, and weight tracking / blood-sugar trend charts.

## 2026-09-09 — Scoped the meal-time reminder/notification mechanics (design-only)

Resolved the open question from the previous entry (real push vs. lighter in-app signal) after walking through the actual options with the developer. **Agreed design, not yet built:**

**Phase 1 (next to build):**
- Wrap the existing React/Vite codebase in **Capacitor** as an Android build, additive to — not replacing — the current browser/PWA path (Windows/browser keep working exactly as today). Justified by mom being confirmed Android-only (`docs/requirements-open-questions.md` → Tech Comfort), which avoids all iOS/Apple-developer-account complexity.
- Reminders fire via Capacitor's **Local Notifications** plugin, scheduled from a locally cached last-meal timestamp — not a live Sheets check. Whenever a `DailyLog` entry is added, the app caches that timestamp on-device and (re)schedules a single local notification for `lastMealTime + maxGapHours`, cancelling any previously scheduled one. The notification fires entirely on-device even if the app is closed and offline — no backend, no push service, no Sheets access needed at fire time.
- **Cross-device staleness, resolved as a cheap fix rather than deferred**: the cached timestamp also refreshes (and the pending notification reschedules) whenever the phone app is opened/foregrounded, reusing the same `listLogEntries()` Sheets read already used by `TodayScreen`/`BloodSugarScreen` — no new mechanism. Accepted gap: if a meal is logged elsewhere (e.g. the computer) and the phone app stays fully closed until after the reminder should have fired, it can still fire once based on stale data — judged low-cost/low-annoyance and not worth a persistent background sync (which would need a refreshable auth token, a real departure from the current "token in memory only" model). Revisit only if this proves annoying in practice.
- **Quiet hours, new**: two new `Settings` keys, `WakeTime`/`SleepTime` (e.g. `"06:30"`/`"00:00"`, defaulting to mom's actual stated schedule), same key/value pattern as existing Settings. The scheduler simply never schedules a notification for a time inside that window — no catch-up ping at wake; normal gap-tracking just resumes from whenever she next logs (her fixed 9:00 breakfast makes this a non-issue in practice).
- The notification should be lock-screen-visible (public/high-priority, not swallowed by a notification stack) — folded into this same phase since it's just a visibility/importance setting on the same mechanism, not new infrastructure. Single, non-repeating notification per overdue gap (no escalating nags) for v1; tapping it deep-links into the "add meal" quick-log form.
- Distribution: a signed APK sideloaded directly onto her one phone ("install from unknown sources"); no Play Store listing needed for now. Same path for future updates.
- **Signing**: a real release keystore, generated once and reused for every build starting with the very first sideloaded APK (not a throwaway debug key) — kept backed up outside the one dev machine. Chosen specifically because the developer wants the option to publish publicly later if it works well; a consistent signing identity from build #1 avoids ever forcing a reinstall (which would lose on-device state) and carries forward cleanly into Play App Signing if that day comes.
- **App identity**: renamed away from "Трекер Діабету"/"Diabetes Tracker" — a name implying medical scope/liability that doesn't fit a utility app whose users are responsible for their own use, not a medical device. New name: **Трекер харчування** ("Track My Meals" in English) — a natural adaptation, not a literal translation, keeping the same "Трекер + noun" pattern already used in the app. Already applied to the current codebase (`src/i18n/uk.ts` `appName`, `index.html` `<title>`, `vite.config.ts` PWA manifest `name`) — not just reserved for a future Android build, since the same liability reasoning applies to what's live today. Android package ID: **`ca.roncreator.trackmymeals`**, rooted in a domain the developer owns (`roncreator.ca`) so it scales cleanly for future apps under the same `ca.roncreator.*` namespace, rather than a placeholder — no functional effect on the app itself, but avoids collision risk and keeps app-store/App-Links options open if published later.
- Known caveat to handle during implementation: Android 12+ restricts exact-alarm scheduling for battery reasons — reliable on-time delivery will likely need her to grant the exact-alarm permission and exclude the app from battery optimization once, during setup.

**Phase 2 (explicit follow-up, after seeing how she actually uses Phase 1 in practice):**
- A **home-screen widget** (native Android `AppWidgetProvider`/RemoteViews) showing an at-a-glance overdue/OK status — real native Android surface outside Capacitor's normal JS plugin bridge, not a small add-on.
- A **dynamic app-icon swap** (multiple `activity-alias` manifest entries, toggled based on reminder state) so the pinned home-screen icon itself changes color/artwork when a meal is due — same native-manifest category of work as the widget, though cheaper (no custom widget UI, just toggling between two pre-made icon assets). Caveat: icon-refresh timing is launcher-dependent (some OEM launchers cache and delay the swap), needs testing on her actual device before treating it as instant.
- Bundled together and deliberately deferred: both require writing native Android code beyond what wrapping the existing app needs, so it's worth trying the plain notification first and deciding whether the extra visibility is worth the extra native-maintenance surface.

**Rejected alternatives, and why:**
- *Pure PWA + Periodic Background Sync API* (no native wrapper): would avoid a second build target entirely, but Chrome gates it behind a site-engagement score and doesn't guarantee anything close to the ~2.5–3hr interval `maxGapHours` needs — too unreliable for a health reminder.
- *Small backend + real Web Push*: would work even with the app never opened, but reopens the deliberate no-backend architecture decision (`docs/technical-spec.md`) for a single-user, single-device case that doesn't need what a backend buys (cross-device delivery, offline-for-days reliability) — not worth the new hosting/security surface (server-side Sheets credentials) here.
- *In-app-only nudge / icon badge count, no real notification*: zero new infrastructure, but purely passive — only helps if she happens to glance at the phone, which under-delivers on what she actually asked for.

**Not yet built — design-only session**, same pattern as the previous scoping session: paused before writing code so implementation can proceed straight from this design. All open sub-decisions (cross-device sync, quiet hours, signing, app identity, package ID) were resolved in follow-up review before closing out this entry — Phase 1 should need no further design decisions, only implementation choices.

**Next steps:**
1. Implement Phase 1 (Capacitor Android wrapper at `ca.roncreator.trackmymeals`, cached-timestamp Local Notifications with quiet-hours suppression and lock-screen visibility, release-keystore signing from build #1)
2. After trying it in practice: revisit Phase 2 (widget + icon swap) as a single follow-up decision
3. Everything else still pending from earlier entries stands: live Settings sheet 1800/6 update, `Favorite` header cell on Ingredients, `GlycemicFlag` header cells on Ingredients/Dishes, reviewing mom's old Google Sheet for bundle expansion, and weight tracking / blood-sugar trend charts

## 2026-09-09 — Session wrap-up (context handoff)

Recording a clean snapshot so a fresh session can pick up without re-reading the two entries directly above — those two (the built glycemic-flag/blood-sugar feature, then the reminder-mechanics scoping) already have the full detail; this is just pointers plus current state. (`README.md`'s Status section has the same summary, kept short.)

**This session covered two things, in order:**
1. Built the food/blood-sugar review feature that was designed in the prior session (`glycemicFlag`, derived dish hint, meals-before-reading review) — see the 2026-09-07 "Built..." entry above.
2. Scoped the meal-time reminder end-to-end, including a real back-and-forth on alternatives (native wrapper vs. push backend vs. pure-PWA background sync), then resolved every remaining sub-decision (cross-device staleness, quiet hours, signing, app renaming, package ID) rather than leaving them for the build session — see the 2026-09-09 "Scoped..." entry above.

Also created **`docs/automation-candidates.md`** (linked from `CLAUDE.md`) — a running list of mechanics/workflows from this project flagged as candidates for future Claude Code skills/agents/plugins, per the developer's stated plan to build more apps systematically. Worth checking before starting a new project from scratch, and worth adding to whenever a session notices another repeatable pattern.

**Repo state:** working tree has real changes, **nothing from this session committed yet** — last commit is `24239be`. `npm run test` (76/76) and `npm run build` are both clean as of this snapshot. Modified: `CLAUDE.md`, `README.md`, `docs/build-log.md`, `docs/technical-spec.md`, `index.html`, `vite.config.ts`, `src/i18n/uk.ts`, `src/index.css`, `src/data/starter-dishes.{ts,test.ts}`, `src/lib/{dailyLog,dishes,ingredients}.{ts,test.ts}`, `src/screens/{BloodSugarScreen,FoodsScreen,TodayScreen}.tsx`. New: `docs/automation-candidates.md`, `src/lib/glycemicFlag.ts`, `src/lib/glycemicFlag.test.ts`. Whether to commit this as one change or split it (feature vs. docs/rename) wasn't decided this session — ask the developer before committing anything.

**Immediate next steps, in order:**
1. Manually verify the glycemic-flag/blood-sugar feature signed in (checklist in the 2026-09-07 entry) — the one thing standing between "built" and "confirmed working"
2. Decide on committing the current working tree (as-is or split), if the developer wants that done before moving on
3. Implement the reminder Phase 1 exactly as scoped in the 2026-09-09 entry — no further design decisions expected
4. Everything else pending across sessions: live Settings sheet 1800/6 update, `Favorite`/`GlycemicFlag` header cells on the live sheet, reviewing mom's old Google Sheet for bundle expansion, weight tracking, blood-sugar trend charts, and Phase 2 of the reminder (widget + icon swap) once Phase 1 has real usage behind it
