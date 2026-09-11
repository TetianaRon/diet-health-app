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

## 2026-09-10 — Built reminder Phase 1 (Capacitor/Android scaffold + scheduling logic)

Implemented Phase 1 exactly as scoped in the 2026-09-09 entry — no new design decisions, only implementation. **Important limitation found immediately: this dev machine has Node but no JDK/Android SDK**, so everything Node-only was completed and verified, but nothing requiring Gradle/Android Studio could be (see below).

**Capacitor scaffold**: installed `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/app`, `@capacitor/local-notifications`, `@capacitor/preferences`. `npx cap init` (`ca.roncreator.trackmymeals`, web dir `dist`) and `npx cap add android` both completed cleanly without needing a JDK — these are pure Node/template-copy operations. `android/` is now in the repo; `npx cap sync android` re-run after the TS changes below to pick them up.

**`src/lib/reminders.ts`** (new, pure, unit-tested in `reminders.test.ts`): `isWithinQuietHours()` (handles both a plain and a midnight-wrapping quiet window), `computeReminderTime()` (lastMealTime + maxGapHours), `shouldScheduleReminder()`. No Capacitor dependency, so testable like the rest of `src/lib`.

**`src/lib/reminderScheduler.ts`** (new, thin platform wrapper, not unit-tested — same convention as `sheets.ts`'s `authorizedFetch`): `initMealReminders()` (requests notification permission, creates a high-importance/lock-screen-visible channel) and `scheduleMealReminder(lastMealTime, settings)` via `@capacitor/local-notifications`. Both no-op via `Capacitor.isNativePlatform()` outside the Android build, so they're safe to call unconditionally from the shared React code — no `if (native)` branching needed at call sites. An already-overdue gap fires almost immediately instead of being silently dropped, but still checked against quiet hours using "now," not the missed past time (so it doesn't sneak a notification through by padding the fire time forward).

**Settings schema**: added `wakeTime`/`sleepTime` (`"HH:MM"` strings) to `src/lib/settings.ts`'s `Settings` type — the first non-numeric Settings fields, so `parseSettingsRows`/`computeSettingsUpdates` were generalized to handle a mixed numeric/string map instead of assuming everything is numeric. Defaults (`06:30`/`00:00`) match mom's actual stated schedule. `SettingsScreen.tsx` renders these two as `<input type="time">` with `HH:MM` format validation, separate from the existing blank-check numeric validation (same blank-field safety principle, applied to the new field type).

**Wiring**: `TodayScreen` now (re)schedules the reminder in a `useEffect` keyed on its most-recent `DailyLog` entry + `Settings` — this single effect covers both "just logged a meal" (saving an entry updates `entries` state) and "reopened the app" (a new `@capacitor/app` `resume` listener re-runs the same Sheets fetch that already populated the screen, which also updates `entries`), matching the design's "reuse the existing `listLogEntries()` read, no new mechanism" intent. `App.tsx` calls `initMealReminders()` once on mount and listens for `localNotificationActionPerformed` to deep-link a notification tap into Today's quick-add form (`autoOpenAddForm` prop, consumed once).

**Android manifest** (`android/app/src/main/AndroidManifest.xml`): added `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`.

**Release signing, prepared but not generated**: `android/app/build.gradle`'s `release` build type now reads `android/keystore.properties` (gitignored) if present, falling back to debug signing otherwise — so the project builds either way. `android/keystore.properties.example` documents the one-time `keytool -genkeypair` command and the "generate once, never again, back it up outside this machine" reasoning from the design session. Uncommented the `*.jks`/`*.keystore` lines in `android/.gitignore` (were commented out in Capacitor's template) and added `keystore.properties` to it. **Not generated this session** — `keytool` needs a JDK, which isn't on this machine.

**Verified**: `npm run test` (83/83, up from 76 — 6 new `reminders.test.ts` cases + 1 new `settings.test.ts` case), `npm run build` clean, live browser check of the not-signed-in state across all four tabs (no console errors; Settings screen correctly still gates the new time fields behind sign-in).

**Not verified — needs a machine with Android Studio (JDK + Android SDK), which this one doesn't have**: `./gradlew assembleRelease` or any native build, the actual notification firing/quiet-hours/lock-screen behavior on a real device, the exact-alarm and battery-optimization permission prompts, and generating the release keystore. Also not verified: any signed-in flow (same standing limitation as every session — Google's sign-in popup can't be completed by the automated browser tool).

**Needs manual spreadsheet edit, new**: add `WakeTime`/`SleepTime` as new Key/Value rows on the Settings tab (`06:30`/`00:00` to match the code defaults) — unlike the header-cell additions for Favorite/GlycemicFlag, these are new *rows* since Settings is key/value-shaped, not columnar. Without them the app just uses the in-code defaults, same fallback behavior as every other Settings key.

**Next steps:**
1. Get access to a machine with Android Studio (JDK + Android SDK) to: run `./gradlew assembleRelease` for the first time, generate the release keystore per `android/keystore.properties.example`, and test real notification delivery/quiet-hours/lock-screen behavior on mom's actual phone
2. Add the `WakeTime`/`SleepTime` rows to the live Settings sheet
3. Everything else still pending: live Settings sheet 1800/6 update, `Favorite`/`GlycemicFlag` header cells on Ingredients/Dishes, reviewing mom's old Google Sheet for bundle expansion, weight tracking, blood-sugar trend charts, and reminder Phase 2 (widget + icon swap) once Phase 1 has real usage behind it

## 2026-09-10 — Fixed Google sign-in on Android (system browser + PKCE)

**Turned out access to Android Studio arrived same-day.** Developer got a JDK+SDK machine working, opened `android/` in Android Studio, fixed a Gradle/JVM mismatch (project's Gradle 8.14.3 needs JVM ≤24; Studio's bundled JDK was 25 — picked "Use JVM 21" from Studio's own prompt, no project changes needed), and got a debug APK building and installing on a real phone. **First real find**: tapping sign-in produced Google's "Error 400."

**Root cause**: not a bug — Google deliberately blocks OAuth sign-in from inside an embedded WebView (anti-phishing policy, applies to every app). A default Capacitor app's `MainActivity` renders in exactly that kind of WebView, so the existing GIS token-client flow (built for a real browser tab, per the 2026-08-13 auth entry) can never complete there. The web/PWA sign-in is completely unaffected — Android-only problem.

**Decision — system browser + Authorization Code + PKCE, not native Google Sign-In**: walked through both real options with the developer before writing code (matches this project's established "agree the design, then build" pattern):
- **Chosen**: `@capacitor/browser` opens Google's real auth page in Chrome Custom Tabs (a real browser context Google will authorize), using RFC 8252's Authorization Code + PKCE flow — Google's own recommended pattern for installed apps. Redirect comes back via a custom-scheme intent-filter + `@capacitor/app`'s `appUrlOpen` event. Token exchange is a plain `fetch()`, no new library, consistent with everything else in `sheets.ts`.
- **Rejected**: native Google Sign-In via a Capacitor plugin. Feels more "native," but pulls in a third-party plugin dependency and ties sign-in to the exact SHA-1 fingerprint of whichever keystore signed the build — debug and release are different keystores, so it needs registering twice, and a missed release-key registration would silently break sign-in only once on the real signed build. The chosen approach also generalizes better if this ever targets another platform (same OAuth logic, just a different redirect URI), where native Sign-In would mean a different SDK per platform.

**New OAuth client, Android-only**: a **"Desktop app"** type client (not "Android" type — that's what native Google Sign-In would need) was required since the existing Web application client can't accept a custom-scheme redirect URI. One nuance surfaced and explained to the developer: Google's Desktop app client type does issue a client secret the token exchange must send, but Google's own docs say not to treat it as confidential for this client type (expected to ship in a binary) — different from the web flow's genuinely secret-free design, but not a real security gap. New env vars `VITE_GOOGLE_DESKTOP_CLIENT_ID`/`VITE_GOOGLE_DESKTOP_CLIENT_SECRET` (`.env`, `.env.example`).

**`src/lib/sheets.ts`**: `initGoogleAuth()`/`signIn()` now branch on `Capacitor.isNativePlatform()`. Native path: PKCE verifier/challenge generation (Web Crypto, no library), `Browser.open()` for the auth request, `App.addListener("appUrlOpen", ...)` to catch the redirect, direct `fetch()` token exchange. Web path unchanged. `AuthContext.tsx` and every screen that calls `useAuth()` needed zero changes — the branching is fully contained inside `sheets.ts`.

**`android/app/src/main/AndroidManifest.xml`**: added a second intent-filter on `MainActivity` for `ca.roncreator.trackmymeals://oauth2redirect` (reuses the `custom_url_scheme` Capacitor already declared in `strings.xml`), alongside the existing launcher one.

**Verified**: `npm run test` (83/83, unchanged — this is IO/platform glue with no new pure logic, same as `reminderScheduler.ts`), `npm run build` clean, `npx cap sync android` picked up the new `@capacitor/browser` plugin, live browser check of the web build's not-signed-in state (no regressions — Capacitor's web fallbacks for `App`/`Browser`/`Capacitor.isNativePlatform()` are no-ops there, exactly as intended).

**Not yet verified**: the actual Android sign-in flow end-to-end (browser opens → Google login → redirect lands back in the app → Sheets calls succeed) — needs a real device test, which is the developer's next step now that they're back at the Android Studio machine.

**Next steps:**
1. Rebuild and reinstall the debug APK, retry sign-in — confirm the system browser opens, Google's page loads (no more Error 400), and the app receives control back with a working session
2. If that works: resume the original Phase 1 checklist — generate the release keystore, run `./gradlew assembleRelease`, test real notification delivery on mom's phone
3. Everything else still pending: `WakeTime`/`SleepTime` and the 1800/6 update on the live Settings sheet, `Favorite`/`GlycemicFlag` header cells, reviewing mom's old Google Sheet for bundle expansion, weight tracking, blood-sugar trend charts, reminder Phase 2

## 2026-09-10 — Corrected the Android OAuth client: "Desktop app" type doesn't work, needed "Android" type

**Live testing immediately caught a second, different Error 400** after the browser-opening fix landed — this time in the real Chrome Custom Tab, not the embedded WebView. Decoding the error page's technical detail link pointed at Google's "secure response handling" OAuth policy: **custom URI scheme redirects are only permitted for "Android" or "iOS" type OAuth clients**, because only those types let Google verify which app actually owns that scheme (via package name + signing certificate). The "Desktop app" client created earlier this session has no such binding, so Google refuses the redirect outright — anyone could otherwise register the same custom scheme and intercept it. This wasn't a config mistake so much as an incomplete understanding of Google's client-type rules going in — worth recording plainly since the previous entry confidently explained why "Desktop app" was chosen over "Android" type, and that reasoning turned out to be wrong on this specific point.

**Fix**: created a proper **"Android" type** OAuth client instead, registered with package name `ca.roncreator.trackmymeals` and the SHA-1 fingerprint of the debug signing certificate. Getting that fingerprint needed `./gradlew signingReport` from Android Studio's Terminal tab, which itself needed `JAVA_HOME` pointed at Android Studio's bundled JDK (`C:\Program Files\Android\Android Studio\jbr`) since a plain terminal window doesn't inherit the JDK the IDE itself uses. Result: `SHA1: 7E:6A:A2:CD:5A:2C:B1:D4:64:2D:05:FA:41:52:63:84:C8:35:3D:0C` (debug keystore).

**Net effect is actually better than the original plan, not just different**: "Android" type clients issue **no client secret at all** — verification happens via package+signature instead — so `exchangeCodeForToken()` in `src/lib/sheets.ts` now sends no `client_secret` param, and the app ended up fully secret-free on Android too, not just "the secret isn't really confidential" as the Desktop app approach required explaining. Same PKCE/browser/deep-link code as before; only the client type, client ID, and dropped secret changed. New env var `VITE_GOOGLE_ANDROID_CLIENT_ID` replaces `VITE_GOOGLE_DESKTOP_CLIENT_ID`/`_SECRET` (both removed from `.env`/`.env.example`).

**Known follow-up, not yet due**: this SHA-1 is from the *debug* keystore. Once the release keystore is generated (still pending — needs a JDK, per every earlier entry), its SHA-1 needs adding to the same Android OAuth client (Google Cloud Console supports multiple fingerprints per client via "+ Add fingerprint") — otherwise sign-in will work in debug builds but break specifically on the real signed release build, the same "easy to forget" trap flagged as a reason to avoid native Google Sign-In earlier, now unavoidable in a smaller form (one fingerprint to add later, not a whole SDK).

**The old "Desktop app" OAuth client is now dead weight** — not deleted yet, left for the developer to clean up in Google Cloud Console whenever convenient (no functional impact either way, an unused client is not a live credential).

**Verified**: `npm run test` (83/83, unchanged), `npm run build` clean, `npx cap sync android` picked up the rebuilt web assets.

**Not yet verified**: the actual sign-in flow with the new Android client — this is the very next thing to test on the device.

**Next steps:**
1. Rebuild/reinstall the debug APK, retry sign-in — this time expecting it to actually complete (browser opens → Google login → redirect → token exchange → signed in)
2. If that works: resume Phase 1 — generate the release keystore, add its SHA-1 to the Android OAuth client, `./gradlew assembleRelease`, test real notification delivery on mom's phone
3. Everything else still pending: `WakeTime`/`SleepTime` and the 1800/6 update on the live Settings sheet, `Favorite`/`GlycemicFlag` header cells, reviewing mom's old Google Sheet for bundle expansion, weight tracking, blood-sugar trend charts, reminder Phase 2

## 2026-09-10 — Android sign-in fully working; two more fixes along the way

**Two more rounds of live-testing-driven fixes before sign-in actually completed:**

1. **Redirect URI format**: same "secure response handling" Error 400 persisted even after switching to the Android-type client. Root cause: `ca.roncreator.trackmymeals://oauth2redirect` (double slash) parses as a URI with an *authority* component (`oauth2redirect` as a host) — Google's validator for this client type expects the single-slash opaque form instead, `ca.roncreator.trackmymeals:/oauth2redirect` (matches the convention Google's own AppAuth-Android library uses). Changed `NATIVE_REDIRECT_URI` in `sheets.ts` accordingly, and simplified the `AndroidManifest.xml` intent-filter to match on `android:scheme` alone (dropped `android:host`, since a host-less URI can't match a host-based filter).

2. **"Custom URI scheme is not enabled for your Android client"**: a much more specific error this time, pointing at an actual Console toggle — Google added an explicit opt-in for custom-scheme redirects on Android OAuth clients (they push Android App Links as the more-secure default now). Developer found and enabled it on the client's edit page in Google Cloud Console. No code change — pure Console setting.

**Sign-in confirmed working end-to-end on the real device** — browser opens, Google login completes, redirect lands back in the app, and (per the developer's live test right after) Settings/BloodSugar/DailyLog all loaded real data from the sheet, confirming the token from this new flow is valid for actual Sheets API calls, not just the OAuth handshake itself.

**Two more issues found in that same live test:**

- **A `503` on one of the five parallel Sheets reads** ("The service is currently unavailable") — Google's own transient server message, not something in our code; the other four reads succeeded in the same batch (real Settings values, a real blood sugar reading, a real 73-hour meal gap warning all rendered correctly). Logged as likely transient, not investigated further unless it recurs.
- **Real bug: bottom tab bar and top heading were both covered by Android's edge-to-edge system bars** (status bar over the top, gesture/nav bar over the bottom) — bad enough that the developer "couldn't navigate to other tabs." Root cause: Android 15+ renders apps edge-to-edge by default, and this app's CSS was never updated for that since it had only ever been tested as a browser tab (where there's no OS chrome to overlap). **Fix**: `src/index.css` — `.app-content` and `.tab-bar` now add `env(safe-area-inset-top)`/`env(safe-area-inset-bottom)` padding (0px everywhere else, so no effect on web/desktop — confirmed via a live browser check of the not-signed-in state after the change).

**Verified**: `npm run build` clean after both fixes, `npx cap sync android` picked up the changes, live browser check of the web build shows no regression. **Not yet re-verified**: whether the safe-area fix actually resolves the tab-bar overlap on the real device — that's the very next thing to confirm.

**Next steps:**
1. Rebuild/reinstall the debug APK, confirm the tab bar and heading are no longer covered by system UI, and retry the 503'd read (likely just works on retry)
2. Once confirmed: generate the release keystore, add its SHA-1 to the same Android OAuth client (alongside the debug one — Console supports multiple fingerprints per client), `./gradlew assembleRelease`, test real notification delivery on mom's phone
3. Everything else still pending: `WakeTime`/`SleepTime` and the 1800/6 update on the live Settings sheet, `Favorite`/`GlycemicFlag` header cells, reviewing mom's old Google Sheet for bundle expansion, weight tracking, blood-sugar trend charts, reminder Phase 2, and deleting the now-unused "Desktop app" OAuth client from Google Cloud Console whenever convenient

## 2026-09-10 — Status bar readability fix

**Reported**: after the safe-area fix made the status bar visible (rather than overlapped by content), its icons/text turned out to be white — invisible against this app's white background.

**Considered and deliberately declined fullscreen/immersive mode first** (hiding the status and nav bars entirely, instead of just fixing their color) — discussed with the developer: hiding the status bar removes the clock, which seems worth keeping in a meal-*timing* app, and hiding Android's nav bar replaces the back/home buttons mom already knows with an edge-swipe gesture, a real learning-curve cost for a user whose tech comfort isn't assumed to be high. Also just generally not what Google recommends as the default. Kept both system bars visible, fixed only the fix contrast.

**Fix**: `@capacitor/status-bar` (new dependency), `StatusBar.setStyle({ style: Style.Light })` called once on native platforms in `App.tsx`. Worth noting for next time: the plugin's naming is the reverse of what it sounds like — `Style.Light` means dark icons (for a light background), `Style.Dark` means light icons (for a dark background); checked the actual type definitions rather than trusting memory here, good thing, since the intuitive-sounding guess would have been backwards.

**Verified**: `npm run test` (83/83, unchanged), `npm run build` clean, `npx cap sync android` picked up the new plugin, live browser check of the web build (no-op there, as intended — no status bar in a browser tab).

**Not yet verified**: whether the icons are actually readable now on the real device.

**Next steps:**
1. Rebuild/reinstall, confirm status bar icons are now visible, tab bar is fully clickable, and retry the earlier 503
2. Once the layout/readability round is confirmed: decide whether to commit this whole batch of fixes (Android OAuth client correction × 3, safe-area layout, status bar contrast — all uncommitted so far this session)
3. Then resume Phase 1: release keystore, `./gradlew assembleRelease`, real notification test on mom's phone
4. Everything else still pending: `WakeTime`/`SleepTime` and 1800/6 on the live Settings sheet, `Favorite`/`GlycemicFlag` header cells, mom's old Google Sheet review, weight tracking, blood-sugar trend charts, reminder Phase 2, deleting the unused Desktop app OAuth client

## 2026-09-10 — Full device verification passed; two real UX gaps found in the add-ingredient flow

**All four tabs confirmed working on the real device** after the layout/status-bar fixes: no more 503, tab bar fully tappable, status bar readable. **Sign-out then sign-in again confirmed the previously-added dish and blood sugar reading both persisted** — meaningful because it's the first confirmation that *writes* (not just reads) work correctly through the new native PKCE auth path, and that the flow is repeatable, not a one-off fluke.

**Two real gaps found via live use, not yet fixed (developer flagged as "not necessarily right now"):**

1. **Name collision on save, silent**: `AddFoodForm`'s single name field doubles as both the USDA search query and the value saved as `nameUk`. Searching a broad/generic term (e.g. "кабачки") and picking different specific candidates from the results still saves every pick under the identical literal search string — and since ingredients are keyed by name everywhere they're merged/looked up (`mergeWithStarterFoods`, favorite/flag toggles), a second save under the same name silently shadows the first, with zero warning. Developer's proposed fix, which is the right shape: split "search" (query only) from "name to save" (a separate, editable field defaulting to something specific to the actual picked result, not the bare search term) — solves the collision and the "which pick is this" ambiguity together.
2. **No edit flow for a saved Ingredient/Dish**: the only way to change one today is re-adding under the same name — which, per #1, means an unwarned silent overwrite, not a real edit.

**Not implemented this session** — logged for a future pass, not urgent per the developer. Both are Foods-screen scoped; Today/BloodSugar/Settings weren't reported as affected.

**Next steps:**
1. Decide whether to commit today's whole batch (Android OAuth client corrections, safe-area layout, status bar fix) — device-verified and working now
2. Resume Phase 1: release keystore, `./gradlew assembleRelease`, real notification test on mom's phone
3. Whenever picked up: redesign `AddFoodForm` to separate search-query from save-name (defaulted from the picked result, editable), and add a real edit flow for saved Ingredients/Dishes with an explicit overwrite warning if a duplicate name is used deliberately
4. Everything else still pending: `WakeTime`/`SleepTime` and 1800/6 on the live Settings sheet, `Favorite`/`GlycemicFlag` header cells, mom's old Google Sheet review, weight tracking, blood-sugar trend charts, reminder Phase 2, deleting the unused Desktop app OAuth client

## 2026-09-10 — Release keystore generated; signed release build confirmed working end-to-end

**Release keystore generated** (`android/trackmymeals-release.jks`, alias `trackmymeals`, 10,000-day validity) via `keytool -genkeypair` — run directly (non-interactively, with a script-generated random password) since the Claude Code sandbox has file-system access but blocks the loopback socket Gradle needs, discovered when `./gradlew signingReport` failed with `Unable to establish loopback connection` when attempted from that environment (worked fine moments earlier from the developer's own Android Studio terminal — a sandbox limitation, not a project issue). `android/keystore.properties` written with matching credentials (gitignored, confirmed via `git check-ignore`). Password backed up to the developer's Google Password Manager (as a manually-entered non-URL entry, since it's not really a website credential) — developer still needs to separately back up the `.jks` file itself somewhere durable (a password alone doesn't help without it); not confirmed done yet.

**Correction to the Phase 1 design doc's assumption**: Google Cloud Console's Android OAuth client edit page has **one** SHA-1 fingerprint field, not a multi-fingerprint list with an "+ Add fingerprint" option as previously assumed (and written into `docs/technical-spec.md`). Resolved by simply **replacing** the debug SHA-1 with the release one on the same client, accepting that debug-build sign-in stops working from here on — a reasonable tradeoff since mom will only ever run the signed release build, and debug was only ever a testing vehicle.

**Release SHA-1**: `AC:5A:D7:9B:D7:00:21:0E:AB:10:99:A0:3F:A1:C5:81:16:F2:A2:FA` (from `./gradlew signingReport`'s `Variant: release` block, confirming the `build.gradle` signing config correctly picked up `keystore.properties` rather than falling back to debug signing).

**`./gradlew assembleRelease` succeeded** (1m 31s, 325 tasks) — `android/app/build/outputs/apk/release/app-release.apk` (3.3 MB).

**Sideload hit one snag, resolved**: phone blocked the install "for security reasons" even after "Install anyway" — root cause was the debug-signed build still being installed (Android refuses to install a differently-signed APK over an existing package, which can present as a security block rather than a clear signature-mismatch error). Fixed by uninstalling the debug build first.

**Confirmed working**: signed release APK installed, sign-in completed successfully against the release-registered OAuth client. This is the first time the *actual distributable artifact* — not a debug build — has been tested at all.

**Next steps:**
1. Test the actual meal-reminder notification end-to-end on the release build: log a meal with a short `MaxGapHours` (temporarily, via Settings) to see it fire without waiting hours, confirm it's suppressed during quiet hours, confirm tapping it deep-links into the add-meal form, and grant the Android 12+ exact-alarm/battery-optimization permissions manually if prompted
2. Developer backs up the `.jks` file itself (not just the password) somewhere durable outside this one machine
3. Update `docs/technical-spec.md`'s incorrect "Console supports multiple fingerprints per client" line to match what was actually found
4. Everything else still pending: the two Foods-screen UX gaps from the previous entry, `WakeTime`/`SleepTime` and 1800/6 on the live Settings sheet, `Favorite`/`GlycemicFlag` header cells, mom's old Google Sheet review, weight tracking, blood-sugar trend charts, reminder Phase 2, deleting the unused Desktop app OAuth client

## 2026-09-10 — Reminder confirmed firing; found the real spreadsheet-sharing gap; persistent login built under a deadline

**The reminder notification test passed** — it fired, and tapping it opened the add-meal form as designed. But testing surfaced something important: the notification only kept rescheduling itself while actively signed in, because sign-in never persisted — once the session's in-memory token was gone (app killed/backgrounded long enough), `TodayScreen`'s data fetch (which drives rescheduling) stopped running entirely. Not just a login-convenience issue — a functional gap in the reminder feature itself.

**Real-world testing kept surfacing gaps faster than expected**: the developer had already installed the app on mom's actual phone and she'd signed in — but with no spreadsheet override existing yet, her install was silently pointed at the developer's own dev/test spreadsheet (a single `VITE_SPREADSHEET_ID` baked into the build, shared by every install). Fixed properly this time, not just noted:

- **Today screen's meal picker fixed**: default (empty-search) list was `[...ingredients, ...dishes].slice(0, 20)` — with ~60 starter ingredients and 12 dishes, every dish fell past the cutoff and never showed without typing. Now dishes come first, with favorited ingredients sorted to the front of their segment (dishes have no favorite mechanism yet, so that part stays order-based).
- **Spreadsheet-per-device override, new**: `src/lib/sheets.ts` — `getSpreadsheetId()`/`setSpreadsheetId()`, backed by `localStorage` (works identically in a browser tab and the Capacitor WebView, no new dependency), override the env-var default. New Settings UI field (paste a full Sheets URL or bare ID, auto-parsed via `parseSpreadsheetId()`, unit-tested) — deliberately *not* gated behind sign-in, since which spreadsheet to use is a local setting independent of the Google account. `readRange`/`writeRange`/`batchUpdateRanges` all switched from the raw env var to this.
- **Fresh template spreadsheet generated**: all 5 tabs, full current schema (every incremental header addition across the project's history, finally captured in one file — Favorite, both GlycemicFlag columns, the reshuffled Dishes order, the still-pending WakeTime/SleepTime rows), correct Settings defaults, no test data. Sent to the developer as `track-my-meals-template.xlsx`; regenerated once more with bilingual headers (`"Carbs_g (Вуглеводи, г)"` etc.) per request — a pure cosmetic change needing zero app code, since headers are never parsed programmatically (every Sheets read/write uses a fixed positional range, never a header-name lookup).
- **Recommended ownership model**: developer owns the real spreadsheet (converted from the template, `File → Save as Google Sheets` — the exact step that bit this project once before with the "Office file" write-failure bug, flagged again here since it's an easy step to skip), shares Editor access with mom's account, she pastes the link into her phone's new Settings field. Keeps the developer's own direct edit access while giving mom full independent read/write through the app.

**Persistent login built under real time pressure**: developer and mom are on vacation together until Saturday, after which updates can only happen once Google Play verification completes (timeline uncertain) — so this was the last practical window to land a fix mom can't get help with once separated. Implemented Authorization Code + refresh token persistence, native-only (web's browser-tab-stays-open pattern was never the source of this friction, left unchanged):

- `signInNative()`'s auth URL now requests `access_type=offline` + `prompt=consent` — both required together, since Google only issues a refresh token on a user's very first-ever authorization of a given client+scope otherwise, silently omitting it on every sign-in after.
- `exchangeCodeForToken()` now also stores the returned refresh token in `localStorage`. New `refreshAccessToken()` silently exchanges it for a fresh access token with no browser/user interaction — used both at app launch (`initGoogleAuth()`, so a stored session restores itself automatically) and inside `authorizedFetch()` on a `401` (recovers from a mid-session expired access token, e.g. after sitting backgrounded over an hour, without forcing a full interactive re-sign-in).
- `signOut()` now also clears the stored refresh token, so an explicit sign-out doesn't silently sign back in on next launch.
- `AuthContext.tsx`: `initGoogleAuth()` may now silently complete a sign-in on its own — the effect now sets `signedIn` from `sheets.isSignedIn()` after it resolves, instead of leaving `signedIn` stuck at its initial `false` until an interactive `signIn()` call that might never come.

**Important caveat flagged to the developer, not solved today**: Google expires refresh tokens after 7 days while an OAuth consent screen remains in "Testing" publishing status (a real, documented Google policy — this app's consent screen is still Testing). So this converts "sign in every app open" into "sign in about once a week," not zero. Moving the consent screen to "In production" would lift that 7-day limit, but is a separate Google Cloud Console step from Play Store distribution and needs its own verification review — flagged as worth pursuing in parallel, not done this session.

**Verified**: `npm run test` (87/87 — 4 new for `parseSpreadsheetId`, up from 83), `npm run build` clean, `npx cap sync android` picked up the changes, live browser check confirmed the Settings screen's new spreadsheet field renders correctly with no console errors.

**Not yet verified**: the actual persistent-login behavior on a real device (kill the app, reopen, confirm no sign-in prompt) — needs a rebuild + reinstall first, same as every native change this session.

**Not yet committed** — all of today's work past the release keystore (Today-picker fix, spreadsheet override, persistent login) is still uncommitted as of this entry.

**Next steps:**
1. Rebuild the release APK (`npm run build && npx cap sync android`, then `./gradlew assembleRelease` on the Android Studio machine), reinstall on both phones, confirm: picker shows dishes by default, Settings' spreadsheet field works, and — critically — persistent login actually survives an app restart
2. Developer sets up mom's real spreadsheet (own it, share Editor access with her, paste the link into her phone) before Saturday
3. Decide on committing today's work
4. Everything else pending: the two Foods-screen UX gaps (name-collision on save, no edit flow) — explicitly deferred past this deadline-driven session, safer to ship once Play Store publishing makes remote updates easy again; `Favorite`/`GlycemicFlag` header cells on the live dev sheet; weight tracking; blood-sugar trend charts; reminder Phase 2; deleting the unused Desktop app OAuth client; eventually pursuing OAuth consent screen verification (removes the 7-day refresh token limit) and/or Play Store internal testing (removes manual sideloading entirely)

## 2026-09-10 — Two more pre-Saturday fixes: multi-item meals, configurable progress bars

**Multi-item meal logging**: not actually a data-model gap — `DailyLog` already stores one row per item and the Today screen already groups multiple rows under one meal-type heading — the friction was purely in the add flow, which closed the form and forgot the meal type after every single save. `AddLogEntryForm` (`TodayScreen.tsx`) now stays open after a save, resetting only the item-picking fields (search/selection/portion/notes) while keeping the chosen meal type, so logging "buckwheat + omelet + kefir" for breakfast is pick-meal-type-once, then repeat search→pick→portion→save three times, instead of re-selecting the meal type each time. A brief hint ("Продукт додано. Можете додати ще один...") confirms the save; the former "Скасувати" button is now "Готово," reflecting that it just closes the form rather than discarding anything (nothing to discard — items save immediately, there was never real "cancel" semantics here even before this change).

**Configurable Today progress bars**: new `Settings.showCarbsProgress`/`showCaloriesProgress` (booleans, same `TRUE`/`FALSE`-string Sheets convention as the existing `Favorite` column), both defaulting to `true` (matches the prior always-both behavior). `settings.ts` gained a `BOOLEAN_FIELDS` category alongside the existing numeric/string ones; `SettingsScreen.tsx` renders these two as checkboxes (new `.settings-checkbox` CSS for the row-layout, vs. the label-above-input layout every other Settings field uses). `TodayScreen.tsx`'s progress-bar block now renders each bar conditionally, and hides the whole block if both are off.

**Confirmed already solved, no work needed**: developer asked whether the starter bundle would need to populate mom's new (empty) spreadsheet somehow, or if the app should offer to seed it — already true, has been since the 2026-08-13 "bundle merge" fix: the bundle lives in app code and merges in in-memory at every read regardless of sheet content, so it's already the full list the instant any spreadsheet (even one with zero data rows) is connected. Documented for the record since it came up as a live question, not because anything changed.

**Verified**: `npm run test` (88/88, up from 87 — 1 new `settings.test.ts` case for the boolean fields), `npm run build` clean, `npx cap sync android` picked up the changes, live browser check of the not-signed-in state shows no regressions.

**Not yet verified on a real device** — same as everything else from today, needs the next rebuild/reinstall cycle to confirm in practice (does the multi-item flow feel right, do the checkboxes actually hide/show the right bars).

**Needs a manual spreadsheet edit, new**: add `ShowCarbsProgress`/`ShowCaloriesProgress` as new Key/Value rows on the Settings tab (`TRUE`/`TRUE` to match the code defaults) — same category as the still-pending `WakeTime`/`SleepTime` rows from earlier today.

**Next steps:**
1. One combined rebuild + reinstall covering everything from today's session (persistent login, Today picker order, spreadsheet override, multi-item meals, progress-bar toggles) — test all of it together before Saturday
2. Everything else still pending, unchanged from the previous entry

## 2026-09-10 — Offline read fallback; scoped (not built) auto-provisioning and full offline sync

Developer asked about two more things: (1) could the app auto-create a blank spreadsheet's tabs/headers on first connect, and (2) could the app work offline with writes syncing once reconnected. Talked through both before writing any code, given the second one in particular carries real risk if rushed.

**Auto-provisioning a blank spreadsheet — feasible, not built.** The existing `spreadsheets` OAuth scope already covers creating/renaming/deleting sheets (tabs), not just editing cell values, so this is a real, buildable feature (detect missing expected tabs, offer to create all 5 with headers + Settings defaults in one `batchUpdate`). Deliberately not built this session: not needed for mom specifically, since the template spreadsheet (sent earlier today) already does the same job with zero new code. Worth doing later if this app gets more users, since it would remove the current "upload template → convert to Google Sheets" dance (and the exact Office-file-conversion step that caused a real bug earlier in this project).

**Full offline write support — explicitly deferred, not built.** Queueing writes made offline and safely replaying them once reconnected is a real local-first sync engine (persistent queue, connectivity detection, conflict handling) — comparable in scope to everything else built this session, and risky to rush for a health-tracking app specifically: a half-built sync queue that silently drops a write is a worse failure mode than today's "clear error, try again," since she'd believe something saved when it didn't. Recommended treating this as its own carefully-scoped future project rather than improvising it before Saturday — developer agreed.

**Built instead — the safe half, offline reads**: `src/lib/sheets.ts`'s `readRange()` now caches every successful read in `localStorage` (keyed by spreadsheet + tab + range, so switching which spreadsheet a device points at can't leak stale data from the wrong one) and falls back to that cache on a genuine network failure. Deliberately narrow: only falls back on a `TypeError` (what `fetch()` itself throws when it can't reach the server at all — no connectivity, DNS failure, CORS block) — never on an HTTP-level error status (bad permissions, a bad range, an expired session), which `authorizedFetch` surfaces as a plain `Error` and which should keep surfacing normally rather than being masked by old cached data. Writes are completely unchanged — still fail outright with no connection, same as before this session, which is the deliberately-kept-simple/safe behavior discussed above.

New `wasLastReadFromCache()` lets a screen show an offline hint. Wired into `TodayScreen.tsx` only (the main daily-use screen) — a `showingCachedData` flag, reset at the start of each refresh and set if any of the five parallel reads (Ingredients/Dishes/Settings/DailyLog/BloodSugar) used the cache, shown as a banner: "Немає з'єднання — показано збережені раніше дані. Нові записи не збережуться, доки з'єднання не відновиться." Accepted imprecision: since the five reads run in parallel, the global cache-flag they check is technically racy (last-completing read wins) — fine for a coarse "possibly offline" hint, not worth solving more precisely today. Not wired into Foods/BloodSugar/Settings screens this pass — Today covers the primary daily-use case.

**Verified**: `npm run test` (88/88, unchanged — this is IO/caching glue in `sheets.ts`, no new pure logic to test, same convention as the rest of that file), `npm run build` clean, `npx cap sync android` picked up the changes, live browser check shows no regressions in the not-signed-in state.

**Not yet verified**: actual offline behavior on a real device (airplane mode after a successful sign-in, confirm Today still shows real data with the banner, confirm a write attempt fails with a clear error rather than doing anything worse).

**Next steps:**
1. Same combined rebuild + reinstall as the previous entry, now also covering offline read fallback — test with airplane mode after first opening the app online once (so a cache actually exists to fall back to)
2. Everything else still pending, unchanged from the previous entries

## 2026-09-10 — Four more UX fixes: button clarity, compose-recipe prominence, Ukrainian month names, expanded Today metrics

**Button labels on the meal-log form**: "Зберегти"/"Готово" were unclear about what each actually did once the form started staying open across multiple items (per the earlier multi-item fix this session) — renamed to "Додати" (adds one item, form stays open) and "Зберегти запис" (finishes the meal, closes the form). No logic change, pure labeling.

**"Create custom recipe" promoted to a real button**: reversed the 2026-08-14 "custom-recipe ingredients no longer a peer tab" decision — that session deliberately made it a subordinate text link below the starter-bundle browser, reasoning it should read as a secondary escape hatch, not a co-equal option. Live use showed the opposite problem: it was too easy to miss entirely. Now a full-width button (new `.compose-cta` CSS) above the bundle browser, not below it as a link. Noting the reversal explicitly since the prior entry's reasoning was recorded as if settled — it wasn't, once real usage disagreed.

**Ukrainian month names**: `BloodSugarScreen.tsx`'s `formatTimestamp` used `month: "2-digit"` (numeric). Changed to `month: "long"` — with the `uk-UA` locale, `toLocaleString` produces the correctly-declined Ukrainian genitive month name (e.g. "10 вересня") via the platform's own ICU data, deliberately not a hand-rolled month-name array (avoids risking the grammar). This was the only place in the app actually displaying a date to the user — `dateAdded` (Ingredients/Dishes) is stored but never rendered anywhere.

**Today screen's trackable stats expanded, defaults changed**: developer wants to eventually surface fat/sugars/protein/sodium as optional stats, and wants Calories + Glycemic Load as the default view (not Carbs). Implemented with a real constraint respected: Carbs/Calories have known daily targets from mom's interview, and **Glycemic Load has a standard nutrition-science reference band** (a "low GL day" is commonly cited as ≤80) — so those three get real progress bars, with `dailyGlycemicLoadTarget` (new, defaults to 80) as GL's target. Fat/Sugars/Protein/Sodium have **no established daily target** (only `fatPerMealLimit`, a *per-meal* limit tied to the no-gallbladder constraint, already existed) — rather than inventing a plausible-sounding number for a health-tracking app, these four are shown as plain opt-in daily totals with no progress bar. Flagged this reasoning to the developer rather than silently picking numbers.

- `src/lib/settings.ts`: `Settings` gains `dailyGlycemicLoadTarget` (numeric) and 5 more booleans (`showGlycemicLoadProgress`, `showFatTotal`, `showSugarsTotal`, `showProteinTotal`, `showSodiumTotal`). **Defaults changed**: `showCarbsProgress` flipped from `true` to `false` (Carbs is now opt-in, not default), `showGlycemicLoadProgress` defaults `true`. This takes effect immediately for anyone without a live Settings-sheet override (i.e. mom right now).
- `TodayScreen.tsx`: computes `totalGl`/`totalFat`/`totalSugars`/`totalProtein`/`totalSodium` from today's entries; renders GL as a third `ProgressBar` alongside Carbs/Calories, and the four opt-in totals as plain text lines below (new `.today-totals` CSS) when enabled.
- `SettingsScreen.tsx`: the 5 new checkboxes and 1 new numeric field slot into the existing `NUMERIC_FIELDS`/`BOOLEAN_FIELDS` pattern, no new UI pattern needed.

**Verified**: `npm run test` (90/90, up from 88 — 2 new `settings.test.ts` cases), `npm run build` clean, `npx cap sync android` picked up the changes, live browser check of the not-signed-in state shows no regressions.

**Not yet verified on a real device** — same as everything else from today.

**Needs a manual spreadsheet edit, new**: add `DailyGlycemicLoadTarget` (80), `ShowGlycemicLoadProgress` (TRUE), `ShowFatTotal`/`ShowSugarsTotal`/`ShowProteinTotal`/`ShowSodiumTotal` (FALSE) as new Key/Value rows — same still-growing list as `WakeTime`/`SleepTime`/`ShowCarbsProgress`/`ShowCaloriesProgress` from earlier today.

**Next steps:**
1. Same combined rebuild + reinstall, now covering everything from the whole session — this is a lot to verify in one pass before Saturday, worth going through the full test checklist methodically rather than spot-checking
2. Everything else still pending, unchanged from the previous entries

## 2026-09-10 — Confirmed GL daily target against mom's own old spreadsheet

Mom pushed back on the `dailyGlycemicLoadTarget: 80` default from earlier today, saying GL does have real daily-limit standards and she had something about it in her old spreadsheet. Checked it (`docs.google.com/spreadsheets/d/1dz_wPjkqjhwUmrIp1ByU-2078A9YkpsPtBkRIsGe3xM`, link from `docs/requirements-open-questions.md` — first time this spreadsheet's actually been opened, still flagged elsewhere as worth reviewing for bundle-expansion data too, not done yet). She was right, and had more specific guidance than what was used: a tab named "норми ГІ та ГН" (GI and GL norms) states **diabetes-specific daily GL of 60-80** (vs. a separate non-diabetic "standard" of 100-130), sourced from prodiabet.ua. Also has standard per-portion GI (0-55 low/56-69 medium/70+ high) and GL (0-10 low/11-19 moderate/20+ high) classification bands, not currently surfaced anywhere in the app — a possible future per-item GI/GL label, not built.

**No number changed** — 80 (used earlier today as a generic international-guideline default) happens to already match the top of her source's diabetes-specific range, so it was right, just under-justified. Updated the code comment and `docs/technical-spec.md` to cite the real source instead of the generic one. Worth remembering: `docs/requirements-open-questions.md`'s spreadsheet link is real, useful, and still unreviewed for the bundle-expansion purpose it was originally flagged for.

**Also answered, no code change**: whether the AddFoodForm name-collision/no-edit-flow issues (flagged 2026-09-10 earlier, "not necessarily right now") got fixed in any of today's other work — no, still open, confirmed explicitly rather than left ambiguous.

**Next steps:** unchanged from the previous entry — same combined rebuild/test pass still pending, everything else on the standing list untouched.

## 2026-09-10 — Fixed AddFoodForm's name collision, built a real edit flow, added GI/GL classification, and Today timestamps + a 3-day history stopgap

Five separate asks in one message: apply the GI/GL classification bands found in mom's old spreadsheet, finally fix AddFoodForm's search/save-name collision (deferred twice earlier today), build a real edit flow for saved Ingredients/Dishes (also deferred twice), add timestamps to Today's meal list (mom's own observation — she couldn't tell when a meal happened), and a lightweight "last 3 days" history section on Today ahead of a real History tab later.

**GI/GL classification** (`src/lib/health.ts`, new, tested): `classifyGi()` (0-55 low / 56-69 medium / 70+ high) and `classifyGl()` (0-10 low / 11-19 moderate / 20+ high) — the *per-item* bands from mom's spreadsheet, distinct from `Settings.dailyGlycemicLoadTarget` (a *daily total*, from the same spreadsheet but a different table). Applied in `uk.health` (new i18n section) wherever a raw GI/GL number was already shown: Foods screen's Ingredients/Dishes list rows, AddFoodForm's bundle suggestions and USDA candidate list, and Today's meal-log preview line (GL). No new UI surfaces added — every application point already showed the raw number, this just adds the classification word next to it.

**AddFoodForm redesign** (`FoodsScreen.tsx`): split the single `nameUk` field into `search` (query only, drives bundle/USDA matching) and a new, always-visible, always-editable `saveNameUk` field with its own hint explaining why it matters. Defaults: the bundle's own name when picked from there (already specific), the search text when picked from USDA (the best available default — there's no automatic English→Ukrainian back-translation to generate something more specific per candidate). The actual fix for the reported bug: **`handleSave` now checks the save-name against every currently-resolvable name (bundle + saved) and refuses to save silently on a collision** — shows a warning and requires an explicit second tap ("Так, замінити") to proceed, instead of the old silent overwrite. Editing the name after a warning clears it, so it can't go stale against a name she's since changed.

**Edit flow, both Ingredients and Dishes**:
- `src/lib/ingredients.ts`/`dishes.ts`: new `updateIngredient()`/`updateDish()` — overwrite an existing row in place (found by its *current* name, so a rename is just part of the same write), the edit-flow counterpart to `addIngredient`/`addDish`'s always-append behavior. `dishes.ts` also got a light refactor (`findDishRowNumber` extracted, was inlined only in `setDishGlycemicFlag` before).
- New `EditIngredientForm` (`FoodsScreen.tsx`): direct field editing, no search/lookup needed since she's correcting values already in hand. A bundle-only ingredient (never actually saved) can still be "edited" — saving becomes its first save, same implicit-save-on-explicit-action principle used for favoriting.
- `ComposeDishForm` gained an optional `existingDish` prop: pre-fills name/ingredient-rows/yield from it, recomputes nutrition via the same `computeDishNutrition` path as a new dish (never hand-typed, even when editing — matches the standing "Dish nutrition is always computed" principle), and updates in place on save. Reused rather than building a separate edit form, since editing a dish and composing one are the same operation modulo starting state.
- New ✎ edit button in both list rows (`.edit-toggle` CSS), alongside the existing favorite/flag toggles.

**Today screen — timestamps and history**: new shared `src/lib/dateFormat.ts` (`formatDateTime`, `formatTime`, `formatDayMonthFromKey` — the last one built from explicit local Y/M/D components rather than `new Date("yyyy-mm-dd")`, which parses as UTC midnight and can roll back a day in timezones behind UTC). `BloodSugarScreen.tsx`'s inline `formatTimestamp` moved here and reused rather than duplicated. Each of Today's logged items now shows its time (`.entry-time`, muted gray). New `recentDayGroups()` in `dailyLog.ts` (pure, tested) groups entries from the 3 calendar days before today (today itself excluded — already shown above), most-recent-day-first; rendered as a new "Останні 3 дні" section below Today's meal groups, explicitly framed as a stopgap ahead of a real History tab, per the developer's own words.

**Verified**: `npm run test` (94/94, up from 90 — 4 new `health.test.ts` cases for the classification bands, 2 new `dailyLog.test.ts` cases for `recentDayGroups`), `npm run build` clean (no type errors across this whole redesign), `npx cap sync android` picked up the changes, live browser check of the not-signed-in state shows no regressions across all four tabs.

**Not yet verified on a real device** — this is a large batch (search/save-name split, both edit flows, GI/GL labels, timestamps, history section) all landing in one pass; worth a careful, unhurried test rather than a quick spot-check once installed.

**Next steps:**
1. The now-quite-large combined rebuild + reinstall + full test pass — recommend going through every item on the standing checklist methodically given how much has accumulated in one session
2. Everything else still pending, unchanged from earlier entries: `Favorite`/`GlycemicFlag`/`WakeTime`/`SleepTime`/`Show*`/`DailyGlycemicLoadTarget` header cells and rows still needed on the live dev sheet, weight tracking, a real History tab (this session's 3-day section is explicitly a stopgap), reminder Phase 2, deleting the unused Desktop app OAuth client

## 2026-09-10 — GI data source audit; a real raw/cooked mismatch found and fixed; approximation caveats made visible

Developer asked where the app's GI data actually comes from and pushed back on whether computing a cooked dish's GI from its raw ingredient was scientifically sound — a good challenge, since GI is lab-measured empirically and isn't something that follows from macros the way calories/carbs do.

**What was actually verified, precisely**: the mechanism was never a naive "convert raw GI to cooked GI" — `starter-foods.ts`'s grain/legume rows already stored what their own comment claimed was the *cooked*-form's published GI (reasoning: GI can't be measured on inedible raw grain, so there's nothing else meaningful to store there), and `computeDishNutrition`'s single-ingredient pass-through just carries that forward unchanged. The real gap was different and worse: **none of these ~60 GI values had an individual citation** — "published research" was asserted, not traceable.

**Researched all 12 grain/legume dish GI values against real sources** (University of Sydney's GI database where available, cross-checked against other peer-reviewed/commonly-cited figures) — full citation table now in `starter-dishes.ts`. Two adjusted: buckwheat 54→50 (Univ. Sydney cites 49), oatmeal-with-water 55→58 (matches a study of that *exact* prep — old-fashioned rolled oats cooked with water — specifically; this one crosses from "low" to "medium" classification, a real change). The rest were within a defensible range of what's cited and left as-is, with the honest finding documented: GI research itself is inherently noisy (rice cited anywhere from 50-89 across studies depending on variety, millet 52-107) — better sourcing makes the numbers *traceable*, not perfectly precise, since no single figure can be.

**A real, confirmed bug found**: "Морква" (carrot) had no raw/cooked qualifier in its name — the exact class of bug fixed for dairy fat % and grain prep-state earlier in this project, which slipped through for carrot specifically. Its stored GI (39) turned out to be clearly a *cooked* value (raw carrot GI ≈16 per research; boiled 32-49) sitting under an unlabeled name. **Split into "Морква сира" (raw, GI 16) and "Морква варена" (boiled, GI 39)** — carbs/calories barely change with boiling (same reasoning already applied to potato/beet/pumpkin), so only GI differs between the two rows. Checked onion and cabbage too, for the same class of issue — their GI is low and stable regardless of prep state (research confirmed no meaningful swing), so no fix needed there.

**The "soup" concern** (composing a multi-ingredient dish where everything cooks together — a home cook can't separate and re-weigh individual cooked components afterward): confirmed this is the correct, inherent limit of the carb-weighted-average model, already honestly documented in code (`computeDishNutrition`'s comment: "true GI isn't simply additive, but no better data exists without lab-testing the specific dish") but never visible to whoever's actually using the app. Fixed the visibility gap, not the underlying math (there's no better math available without lab equipment): a `≈` now prefixes every *computed* Dish GI wherever shown (Foods screen's Dishes list, the starter-dish browse list, `ComposeDishForm`'s live preview) — distinct from Ingredients' GI, which is a direct reference value, not computed — plus a full explanatory note in `ComposeDishForm` specifically (`uk.dishes.approximateGiNote`), shown right where a soup/stew would actually get composed.

**Verified**: `npm run test` (94/94, unchanged count — no new pure logic added, this was data correction + a UI-only caveat; 3 existing test expectations updated to match the corrected buckwheat/oatmeal GI values), `npm run build` clean, `npx cap sync android` picked up the changes, live browser check shows no regressions.

**Not yet resolved, flagged rather than guessed at**: pearl barley's GI (kept at 25) has a genuine conflict in the sources found — one citation for "cooked pearl barley" ≈25, another for "pearled barley" specifically (which is what Ukrainian "Перлова крупа" actually is) at 58±8, notably higher. Documented the conflict in `starter-dishes.ts` rather than picking one; worth a closer look if it matters in practice.

**Next steps:**
1. Same combined rebuild + reinstall + full test pass as the previous entry, now covering this too
2. Consider resolving the pearl barley conflict with a more specific source
3. Everything else still pending, unchanged from earlier entries

## 2026-09-10 — GI estimate vs. confirmed: a per-item checkbox, not a blanket assumption

Follow-up to the GI audit: developer asked for a manual "estimate vs. confirmed" checkbox on both Ingredients and Dishes, so a specific value someone has personally checked against a trusted source can be marked as such — replacing the blanket `≈` from the previous entry (which couldn't distinguish a genuinely-checked value from an unreviewed one).

**New field, both schemas**: `giVerified: boolean` — `Ingredient` (new column O) and `Dish` (new column P), same additive no-migration pattern as every previous column addition (Favorite, GlycemicFlag). Defaults `false` for every new entry, **including starter-bundle items** — the point being that "we researched it" (the previous entry's audit) and "a person confirmed it" are different claims; nothing gets to claim the second just because of the first.

- `src/lib/ingredients.ts`/`dishes.ts`: schema, row mapping, and range constants extended (Ingredients A2:N→A2:O, Dishes A2:O→A2:P); `updateIngredient`/`updateDish`'s overwrite ranges extended to match.
- Checkbox added to `AddFoodForm`, `EditIngredientForm`, and `ComposeDishForm` (`uk.foods.form.giVerifiedLabel`) — reused the `.settings-checkbox` CSS from the Settings screen rather than introducing new styling. Resets to unchecked whenever the GI value it would be attesting to actually changes (a new AddFoodForm pick, or editing the GI field directly in `EditIngredientForm`) — a stale checkmark on a since-changed number would be worse than no checkmark.
- The `≈` marker from the previous entry is now **conditional on `giVerified`**, not blanket — and extended to Ingredients too (previously only Dishes got it, since Ingredients' GI was treated as a direct reference value; now that verification is tracked per-item regardless of type, the same marker logic applies uniformly). Applies everywhere a saved item's GI is shown: Foods screen's Ingredients/Dishes lists, `ComposeDishForm`'s live preview.
- The three "implicit save" paths (favoriting/flagging a bundle-only Ingredient or Dish) now carry the source item's existing `giVerified` value through instead of dropping it.

**Verified**: `npm run test` (94/94, unchanged — no new pure logic, this is schema + form wiring; several existing `Ingredient`/`Dish` test fixtures updated to include the new required field), `npm run build` clean, `npx cap sync android` picked up the changes, live browser check confirmed the page still renders correctly (one stray `ERR_NETWORK_IO_SUSPENDED` console line from the browser tab having sat idle during a long research phase this session — reload didn't clear it but the actual page content was unaffected, not a real regression).

**Needs a manual spreadsheet edit, new**: add `GiVerified` as a header in Ingredients column O and Dishes column P on the live dev sheet — same category as every other still-pending header addition this session.

**Next steps:**
1. Same combined rebuild + reinstall + full test pass, now covering this too
2. Everything else still pending, unchanged from earlier entries

## 2026-09-10 — Pre-publish documentation review

Google Play developer account verification came through — before moving to Play Store setup, did a documentation pass for anything worth fixing first, per the developer's own request.

**Real gap found and fixed**: the spreadsheet template (generated mid-session for mom's setup) had gone stale — schema kept evolving after it was built, so it was missing `GiVerified` (Ingredients/Dishes), the 7 `Show*` display toggles, and `DailyGlycemicLoadTarget` (all Settings). Regenerated with the complete current schema and re-sent — the earlier version should not be used for her real spreadsheet.

**Real gap found, not fixed (out of scope for a doc pass)**: her old Google Sheet's "продукти"/"продукти1" tabs — her actual logged foods — were never reviewed for bundle-expansion despite being flagged as worth reviewing since the interview. Only the GI/GL norms tab got checked, for an unrelated question. Still open.

**Docs updated to match reality** (no functional change, just stopped them contradicting the app): `requirements-open-questions.md`'s reminder item said "not yet designed" — it's built. `technical-spec.md`'s status banner still said "pending mom's interview" — that was 2026-09-07. Its JDK/Android-SDK limitation note was also stale — resolved same-day it was written, once Android Studio access came through.

**Confirmed NOT blocking, deliberately deferred** (unchanged from the standing list): weight tracking, blood-sugar trend charts, medication logging (never scoped), reminder Phase 2, full offline write-sync, the pearl barley GI citation conflict.

**Flagged plainly to the developer**: nothing built this entire session (persistent login, offline caching, multi-item meals, progress-bar toggles, the AddFoodForm/edit-flow rebuild, GI verification checkboxes) has been tested signed-in on a real device yet — every verification this session has been build/test-suite/not-signed-in-browser only. Recommended a real local test pass before adding Play Store's upload/processing delay on top.

**Next steps:**
1. Developer does a full signed-in device test covering everything from this session (checklist given in-conversation, not duplicated here)
2. Once confirmed: set up mom's real spreadsheet from the regenerated template, then proceed to Play Store Internal Testing setup (privacy policy via GitHub Pages, .aab build, store listing, add mom as tester)
3. Review mom's old spreadsheet's actual food/product tabs for bundle expansion, whenever convenient
4. Everything else still pending, unchanged from earlier entries

## 2026-09-10 — Session wrap-up (context handoff)

Context ran to ~87% during this single very long session — recording a clean handoff rather than continuing to append. Everything above this entry (search "2026-09-10" for the full run) covers, in order: Android release build pipeline stood up end-to-end (keystore, signed builds, sign-in fixed through 3 rounds of live correction), persistent login, offline read caching, multi-device spreadsheet support, several UX fixes (multi-item meals, configurable Today stats, timestamps, a 3-day history stopgap, button clarity, compose-recipe prominence), a full GI data audit (real carrot bug found and fixed), a `giVerified` estimate/confirmed flag, and finally this pre-publish documentation review. `docs/requirements-open-questions.md` and `docs/technical-spec.md` were also both updated in this pass to stop contradicting the app's actual state.

**Repo state**: commit `aa58511`, working tree clean, everything from this session committed in two batches (`2a271cd`, `aa58511`).

**Where things actually stand and what's next**: see the `project-pending-items` memory file (rewritten this session to reflect current end-state, not appended) for the full picture — short version: the immediate thread is device-test → mom's spreadsheet → Play Store Internal Testing, in that order, not the deferred-features backlog.

## 2026-09-11 — v1.0 published; real usage feedback: meal grouping was wrong

**v1.0 published to Google Play as Internal Testing on 2026-09-10** — live, mom and dad added as testers (dad initially hit `403 access_denied` signing in; fixed by adding his account to the OAuth consent screen's Test users list in Google Cloud Console's Audience tab — a separate list from Play Console's Internal Testing tester list, easy to conflate).

**Real feedback from mom, the first since actual use began — a genuine architecture gap, not a small tweak**: the daily log's `MealType` (Сніданок/Обід/Вечеря/Перекус) was being used as if it were a meal's *identity*, not just a label. Two concrete symptoms: (1) a multi-dish meal (e.g. lunch = buckwheat + chicken + salad) had no way to show one combined total — each dish was just a same-mealType row, with per-item totals only; (2) multiple snacks in one day (after breakfast, after lunch, after dinner) all shared the literal label "Перекус" and got merged into one group, indistinguishable from each other. This also broke the Blood Sugar screen's "meals before this reading" list in a real way: since it counted individual item-rows toward its limit, a single 6-dish lunch could fill the entire "last 6 meals" list by itself, hiding everything actually eaten before it.

**Fix — a proper meal-occasion identity, additive column**: added `MealId` to DailyLog (column O), generated once per "add meal" form session and reused across every item saved while that form stays open (a fresh form open after "Зберегти запис" starts a new meal). `groupIntoMeals()` in `src/lib/dailyLog.ts` groups entries by MealId and computes summed totals (carbs/calories/GL/etc.) — used by Today's meal list (now numbered "1. Сніданок", "2. Перекус", "3. Обід"... matching how mom herself described wanting to tell same-day snacks apart), the 3-day history section, and `mealsBeforeTimestamp()` (now returns meal occasions, not raw rows, fixing the "6 dishes ate the whole limit" bug). Per-meal fat-limit warnings also switched from per-mealType-across-the-day to per-meal-occasion — a real correctness fix, since the fat limit is a per-sitting rule (no gallbladder) and the old code could combine two separate snacks' fat into one check just because they shared a label. Blank/legacy rows (logged before MealId existed) fall back to their own Timestamp as MealId, so old data reads exactly as it already displayed — no backfill needed, same additive-column pattern as Favorite/GlycemicFlag/GiVerified before it.

**Needs a manual spreadsheet edit** (non-blocking — the column works via the API with or without a header label, but should still get one for anyone opening the sheet directly): add `MealId` as the header in DailyLog column O, on both mom's real sheet and the developer's dev/test sheet.

**Also enabled this session, not yet verified in a real build**: R8/ProGuard minification (`minifyEnabled true` in `android/app/build.gradle`) for readable crash reports going forward — this sandbox can't run Gradle at all (`Unable to establish loopback connection`, confirmed under both the JBR's bundled JDK 25 and a separately-installed Temurin 21, so it's this sandbox's networking, not a JDK-version issue as first suspected) — needs confirming via a real Android Studio build before it ships in the next release.

**Verified**: `npm run test` (100/100, up from 96 — new `groupIntoMeals` tests plus updated `mealsBeforeTimestamp`/`buildLogEntry`/round-trip tests for the new field), `npm run build` clean, live browser check of the not-signed-in state (no regressions) — the actual meal-grouping UI is behind sign-in, same standing limitation as ever, so real verification needs the developer testing live.

**Next steps**: confirm R8 doesn't break anything in a real Android Studio build before the next release; add the `MealId` header cell on both live sheets; the bundle-expansion research from mom's old spreadsheet (2026-09-10) is still unmerged — see `project-pending-items` memory.

## 2026-09-11 — Session handoff (developer-requested, ~77% context)

Four new asks landed right after the meal-grouping fix above shipped: editable meal timestamps, custom/estimated meal entries (restaurant food, unknown macros, mixable with database picks), editing/merging existing meal entries (e.g. two snacks 5 min apart → one entry — nothing in this app can edit/delete a logged entry yet), and a confirmed-real gap where connecting a brand-new blank spreadsheet fails (`400 — Unable to parse range`, since every data module hardcodes its tab name/range and a blank sheet has none of them — this was previously discussed and deliberately deferred, not a regression). None of the four are built. Full detail, including design questions worth asking before building #2 and #3, is in the `project-pending-items` memory file (rewritten this session, not appended).

**Repo state**: commit `aaddad8`, working tree clean.

## 2026-09-11 — Editable meal timestamp; auto-init for a blank spreadsheet

Picked up the four-item list from the handoff above, starting with the two independent/no-open-questions items.

**Editable timestamp (#1):** `AddLogEntryForm` in `TodayScreen.tsx` now has a `<input type="datetime-local">` field, defaulting to now, carried over across items added in the same form session (same as `mealType`) since a multi-item meal was eaten at one time. New `toDatetimeLocalValue`/`fromDatetimeLocalValue` in `dateFormat.ts` round-trip an ISO timestamp through the local-time string the input needs (built from local Y/M/D/h/m parts, not string-slicing — the existing `formatDateTime`/`formatTime` helpers are display-only and don't round-trip). `buildLogEntry()` already accepted a custom `timestamp` param, so `dailyLog.ts` itself needed no changes.

**Blank-spreadsheet auto-init (#4, the empty-spreadsheet bug from the previous entry):** rather than detecting the `400 — Unable to parse range` error reactively (string-matching a Sheets error message felt brittle), used the Sheets API's spreadsheet-metadata endpoint (`spreadsheets.get?fields=sheets.properties.title`) to proactively check which of this app's 5 tabs actually exist — same underlying detection, a more reliable mechanism. New `listSheetTitles()`/`addSheetTabs()` in `sheets.ts` (thin API wrappers, additive-only — never touches/removes a sheet's own tabs); new `src/lib/spreadsheetInit.ts` with the actual flow (`checkSpreadsheetTabs()`, `initializeSpreadsheet()`) plus two pure/tested helpers (`missingTabs()`, `buildInitUpdates()`). Settings also gets its full set of default key/value rows on init (`settingsToRows()`, new in `settings.ts`, exported `SETTINGS_KEYS` so there's one source of truth for the field↔sheet-key mapping) — every other tab is append-only and fine starting empty, but Settings' own `computeSettingsUpdates()` deliberately never adds new rows, so a Settings tab with only a header row would silently accept every future Settings save as a no-op.

**Settings screen UX:** `SpreadsheetSection` now runs a tab check automatically once signed in (and again right after Save/Connect Mom's/Connect test), showing either a small "✓ all tabs found" line or a warning naming the missing tabs with an "Ініціалізувати таблицю" button. Re-running init on a partially-set-up sheet only touches the tabs still actually missing — verified this doesn't clobber a real Settings tab that already has customized values, only a genuinely absent one.

**Verified:** `npm run test` (109/109, up from 100 — 9 new: `spreadsheetInit.test.ts` plus 2 `settingsToRows` cases), `npm run build` clean. **Not live-tested against a real blank spreadsheet** — this sandbox's browser tooling couldn't reach a dev server this session (port already held by another chat's instance), and the feature is entirely behind sign-in regardless (standing limitation, see `dev-feedback-patterns` memory). The developer should try connecting a genuinely fresh blank Google Sheet and confirm the "missing tabs" prompt appears and Ініціалізувати actually works end-to-end.

**Next steps:** developer live-tests the blank-spreadsheet init flow for real; items #2 (custom/estimated entries) and #3 (edit/merge entries) from the handoff still have open scoping questions to ask before building — see `project-pending-items` memory.

## 2026-09-11 — Create-a-new-spreadsheet flow; header-name-based row parsing

Developer follow-up questions on the blank-spreadsheet work above: (1) can the app create a brand-new spreadsheet itself, defaulted to a fixed Drive location but with an editable name, rather than only connecting an existing one; (2) what happens if a future schema change reorders columns, not just appends — does the app need a version-detection/conversion system for that? Both decided via `AskUserQuestion` before building: fixed-folder-with-editable-name (not a full Drive folder picker — too much added complexity for a feature mom likely won't use), and refactor to header-name-based parsing now rather than defer, since a reordered sheet is a real risk even without a deliberate schema change (someone manually dragging a column in the Sheets UI).

**Create-new-spreadsheet flow:** `createSpreadsheetInAppFolder(name)` (new, `sheets.ts`) uses the Drive API to create a blank spreadsheet inside a single app-owned "Track My Meals" folder in Drive root (found-or-created on first use), then the caller runs the same `initializeSpreadsheet()` built in the previous entry to populate its tabs — the blank-sheet-init logic turned out to be exactly what this needed too, no new tab-creation code required. Needed the `drive.file` OAuth scope (added to `SHEETS_SCOPE`, which both the web and Android auth flows already reference from one place) — deliberately the narrowest scope that can do this: it only grants access to files the app itself creates, and doesn't touch how "connect an existing spreadsheet by pasting a link" works (that's the `spreadsheets` scope, unrelated). **Real setup action needed, not yet done**: enable the Google Drive API in Cloud Console, and add `drive.file` to the OAuth consent screen's configured scopes (Data Access tab) — a scope requested in code but not listed there is rejected by Google. Also: every already-signed-in device needs one re-consent sign-in to actually grant the new scope; existing tokens don't retroactively cover it. `SettingsScreen`'s `SpreadsheetSection` now has two clearly separated subsections: "Нова таблиця" (name field + Створити, shown only when signed in — Drive access needs a token) and "Наявна таблиця" (the existing paste-a-link flow, unchanged, plus the Mom's/test-sheet buttons).

**Header-name-based row parsing (`src/lib/sheetRow.ts`, new):** every `rowToX`/`xToRow` pair in `ingredients.ts`/`dishes.ts`/`dailyLog.ts`/`bloodSugar.ts` now resolves each column by looking up its header name's *actual* position in the sheet's row 1, instead of a fixed array index — `buildColumnIndex()` builds a name→index map from a header row once, `cell()`/`buildRow()` read/write through it, `columnLetter()` converts an index back to A1 notation for the single-cell update paths (`setIngredientFavorite`, `setDishGlycemicFlag`, etc., which previously hardcoded column letters like `"M"`/`"O"`). Every mapper function got an optional `columnIndex` param defaulting to that module's own canonical header order — meaning **every existing test kept passing completely unchanged**, since a default-order call is identical to the old positional behavior; only the real read/write functions (`listIngredients`, `addDish`, `findIngredientRow`, etc.) now fetch and pass the sheet's actual live header row. `updateIngredient`/`updateDish` also now compute their write range's rightmost column from the live columnIndex rather than a hardcoded `O`/`P`, so a row-overwrite still targets the right width even if a known column ended up shifted. Header lists (`INGREDIENTS_HEADERS` etc.) now live in each data module itself and are imported by `spreadsheetInit.ts`, removing the duplicate copies it had before this session. (`settings.ts` needed no changes — it's already key/value rows keyed by matching column A's text, immune to reordering by construction.) Added new reorder-specific test cases per module (in `sheetRow.test.ts`, `ingredients.test.ts`, `dishes.test.ts`) proving a shuffled column order still round-trips correctly.

**Verified:** `npm run test` (119/119, up from 109 — 10 new), `npm run build` clean. **Not live-tested** — same standing limitation (sign-in required, sandbox couldn't reach a dev server this session). The developer should: (1) do the two setup actions above (enable Drive API, add the scope to the consent screen) before trying "Створити"; (2) re-sign-in on each device to pick up the new scope; (3) try creating a new spreadsheet for real and confirm it lands in Drive under "Track My Meals" with all 5 tabs populated; (4) if convenient, manually reorder a couple of columns on the dev sheet (see next entry) and confirm the app still reads/writes it correctly, to validate the reorder-resilience refactor beyond its unit tests.

**Next steps:** the three items above need the developer's live verification; items #2 (custom/estimated entries) and #3 (edit/merge entries) from the 2026-09-11 handoff are still open with scoping questions to ask first.

## 2026-09-11 — Split the shared dev/test spreadsheet into two

Developer follow-up: with real testers now on the currently-released build, actively experimenting with schema changes (like the reorder-resilience refactor above) against the same sheet the "Підключити тестову таблицю" button points real testers at was a real risk — an in-progress column change could break their app before the matching release ships. Developer created a fresh spreadsheet for this purpose and gave its ID.

**Three spreadsheets now, cleanly separated by role:** mom's real sheet (`VITE_DEFAULT_SPREADSHEET_ID`, unchanged), a **test** sheet (`VITE_SPREADSHEET_ID`, unchanged value/button — stays matching whatever the *currently-released* build expects) and a new **dev** sheet (`VITE_DEV_SPREADSHEET_ID` = `1M-uw6EnQueSaBDQp2nSzFdcWKc7cFrYvyoGS0SLkPFo`, new "Підключити dev-таблицю" button) — where actual schema/data experiments happen from now on. `getDevSpreadsheetId()` (new, `sheets.ts`) follows the exact same optional-env-var/hide-button-if-blank pattern as `getMomSpreadsheetId()`/`getTestSpreadsheetId()`. Local `.env` and `.env.example` updated with the new var and comments explaining the dev/test split's purpose. Documented as a standing rule in `docs/technical-spec.md`: schema experiments always target dev, never test or mom's, until a matching release ships.

Also answered a related developer question (design-only, not built): can the app detect when an *existing* tab is missing some of its expected *columns* (not just a whole missing tab) and propose topping them up? Yes, and cheaply — `sheetRow.ts` already builds a columnIndex from each tab's live header row for every operation, so diffing that against each module's canonical `*_HEADERS` list is a natural, low-risk extension of the tab-level `checkSpreadsheetTabs()`/`initializeSpreadsheet()` already built (same safety profile: only ever appends missing trailing columns, never touches existing ones). Explicitly recommended *against* attempting to auto-fix a genuinely mismatched/renamed header (ambiguous whether it's a typo, a deliberate rename, or someone's own custom column) — surfacing a diagnostic and leaving the decision to a human fits this project's "never let a wrong guess look authoritative" pattern better than auto-guessing. Not yet built — developer hasn't confirmed they want it yet.

**Verified:** `npm run test` (119/119, unchanged — no new pure logic, just a new env-var-backed function mirroring two existing ones), `npm run build` clean.

**Next steps:** developer still needs to do the Drive API + OAuth scope setup actions from the previous entry before any of the new spreadsheet flows are testable; decide whether to build the missing-columns top-up feature described above.

## 2026-09-11 — Built the missing-columns/missing-keys top-up feature

Developer confirmed building the design proposed in the previous entry.

**`spreadsheetInit.ts` additions:** `checkSchemaGaps()`/`topUpSchemaGaps()`, one level finer than the existing whole-tab-missing `checkSpreadsheetTabs()`/`initializeSpreadsheet()` pair. For each already-existing tab (Ingredients/Dishes/DailyLog/BloodSugar), reads its live header row (a generous "AZ"-wide scan — comfortably covers any real tab plus room for a person's own extra columns) and diffs it against that module's canonical `*_HEADERS` list (`missingHeadersFor()`, pure). For Settings specifically — key/value rows, not columns — does the row-based analog: diffs the actual Key column against every expected key (`missingSettingsKeysFor()`, pure). Both are skipped for a tab that doesn't exist at all yet (that's `checkSpreadsheetTabs()`'s job).

**The actual fix (`topUpSchemaGaps()`):** appends missing headers right after a tab's *true* current last column (`buildColumnTopUpUpdate()`, pure) — reading the wide "AZ" scan rather than just the canonical width specifically so this can't collide with or overwrite a column this app doesn't recognize, e.g. a personal note column someone added themselves. Missing Settings keys get appended as new rows with their default values, reusing `settingsToRows(DEFAULT_SETTINGS)` (already built) filtered down to just the missing ones (`buildSettingsKeyTopUpUpdate()`, pure) rather than re-deriving the boolean-to-string conversion a second time.

**Deliberately NOT built, as discussed when this was proposed:** auto-fixing a genuinely mismatched/renamed header. Only ever surfaces it (as an unrecognized/missing-header diagnostic), never guesses at a fix — ambiguous whether it's a typo, a deliberate rename, or someone's own column, and this project's "never let a wrong guess look authoritative" pattern argues against auto-resolving that kind of ambiguity.

**Settings screen UX:** `SpreadsheetSection`'s tab check now runs `checkSchemaGaps()` right after confirming no tabs are missing (skipped entirely while tabs are still missing — no point checking a tab's columns before it exists). Shows either "✓ all tabs and columns found," or a warning listing exactly which tabs/Settings are short which headers/keys, with an "Оновити структуру" button that calls `topUpSchemaGaps()` then re-checks.

**Verified:** `npm run test` (127/127, up from 119 — 8 new pure-function tests, no network mocking needed per this project's usual IO/pure-function split), `npm run build` clean. **Not live-tested** — same standing sign-in-required / dev-server-port-conflict limitation as the rest of this session's spreadsheet work.

**Next steps:** once the developer finishes the Drive API + OAuth scope setup from two entries ago, all three new spreadsheet flows (create-new, blank-tab-init, column/key top-up) become testable together — worth verifying as one pass rather than three separate ones. Items #2/#3 from the 2026-09-11 handoff (custom entries, edit/merge) remain open with scoping questions.

## 2026-09-11 — Version bump for the next Play Store release

Developer completed the Google Cloud Console setup from two entries ago (Drive API enabled, `drive.file` scope added to the consent screen's Data Access tab, confirmed live via screenshots) and asked to cut a new release bundling today's spreadsheet work. `android/app/build.gradle`: `versionCode` 1 → 2, `versionName` "1.0" → "1.1" — Play Console rejects a re-upload with an unchanged `versionCode`, and this had never been bumped since the original v1.0 publish despite several real feature sessions since.

**Also fixed a stale doc note found while checking for other loose ends**: `docs/requirements-open-questions.md` still marked the food-vs-blood-sugar correlation feature "ready to implement, not yet built" — it actually shipped a while ago (`mealsBeforeTimestamp()` + the `GlycemicFlag` watch/avoid flags, both live in `BloodSugarScreen.tsx`). Updated to reflect that.

**Bonus, worth calling out to future testers**: several long-pending "manually add this header cell to the live sheet" to-dos from past sessions (`Favorite`, `GlycemicFlag`, `GiVerified`, `MealId` on Ingredients/Dishes/DailyLog; a handful of `Show*`/`DailyGlycemicLoadTarget` Settings rows) are effectively obsolete now that this release ships the column/key top-up feature — "Оновити структуру" in Settings will auto-detect and fix all of them the next time it runs, so no more manual spreadsheet editing needed for that class of gap.

**Verified:** `npm run test` (127/127, unchanged), `npm run build` clean.

**Not done by this sandbox (needs the developer, real Android tooling required):** `npx cap sync android`, opening the project in Android Studio, building the signed release bundle, and — importantly — actually confirming R8/ProGuard (`minifyEnabled true`, enabled a few sessions ago, never verified in a real build since this sandbox can't run Gradle at all) doesn't break anything before promoting past Internal Testing. Sign-in, adding a food, and logging a meal are the minimum smoke test given a minification bug would show up as something silently misbehaving, not a build failure.

**Next steps:** developer builds and uploads the release; once live, verify all three new spreadsheet flows (create-new, blank-tab-init, column/key top-up) as one pass on a real device. Items #2/#3 (custom entries, edit/merge) still open after that.

## 2026-09-11 — Real-device release debugging: versionCode churn, stale-scope 403, and a connected-spreadsheet visibility gap

Three real issues surfaced while the developer actually tried uploading and testing the release, none of them code bugs from earlier sessions — all specific to the release/testing process itself.

**versionCode churn:** Play Console rejected `versionCode 2` ("already been used") — turned out an earlier attempt had silently succeeded and gone `Active` in the App bundle explorer without the developer noticing. Bumped to 3, then discovered mid-debugging that the *first* `versionCode 3` upload itself had also gone `Active` — but before the `npm run build && npx cap sync android` clean-rebuild steps were actually run, meaning it very likely shipped stale web assets (this is the probable root cause of "I don't see the latest changes," a question raised earlier in the same debugging session — never fully confirmed since Play Store propagation lag is an equally plausible alternative explanation, and there's no way to distinguish them after the fact). Bumped to `versionCode 4` for a build confirmed to be from freshly-generated `dist/`, re-uploaded successfully. `android/app/build.gradle` now at `versionCode 4` / `versionName "1.1"`.

**403 "insufficient authentication scopes" on create-new-spreadsheet, even after the Drive API + scope setup:** root cause was a *stale refresh token*, not a setup gap. `initGoogleAuth()`'s native path auto-restores a session from a stored refresh token on every app launch (so mom/the developer don't need to sign in every time) — but a refresh token only ever carries the scopes it was originally granted with, and simply relaunching the app (rather than an explicit Settings → Sign out → Sign in) silently reuses the old-scoped token without ever re-prompting for `drive.file`. Fixed by the developer doing a real sign-out-then-sign-in on the test device; no code change needed, but worth remembering this exact failure mode for any *future* scope addition too.

**Connected-spreadsheet visibility gap, real UX finding:** the create-new flow actually worked and auto-connected correctly the whole time, but the only proof was a success message plus a raw spreadsheet ID sitting in a text field — nothing that visibly confirmed *which* real file got connected. New `getSpreadsheetName()` (`sheets.ts`, a small Sheets-metadata call mirroring the existing `listSheetTitles()`) fetches the connected spreadsheet's own title; `SettingsScreen.tsx`'s `SpreadsheetSection` now shows "Підключена таблиця: <name>" as a live hyperlink to the actual file, loaded alongside the existing tab/schema check (one `Promise.all`, no extra round trip). Replaced the "Копіювати посилання на таблицю" button entirely — a bare copy-link action was strictly less useful than a clickable name once this existed, so it and its now-dead `copyToClipboard` helper were removed rather than kept alongside.

**Verified:** `npm run test` (127/127, unchanged — no new pure logic), `npm run build` clean. Not independently re-verified beyond the developer's own live device testing that surfaced and confirmed each fix in the moment.

## 2026-09-11 — Built custom/estimated meal entries (item #2)

Picked up the last open item from the original 2026-09-11 handoff with real design decisions resolved via `AskUserQuestion` first (see that session's conversation, not re-litigated here): unknown fields excluded from totals with a visible caveat (never silently zeroed); any of the 8 nutrient fields can be unknown independently, not all-or-nothing; a custom entry is always a one-off DailyLog row, never saved to Ingredients.

**`src/lib/dailyLog.ts`:** `DailyLogEntry` gained `unknownFields: NutritionField[]` (`NutritionField` = the 7 `IngredientNutrition` keys plus the derived `"gl"`) and a new additive `UnknownFields` schema column (P — DailyLog is now A-P, 16 columns; `LOG_RANGE`/`LOG_WIDTH` updated accordingly). New `buildCustomLogEntry()`: unlike `buildLogEntry`, takes the actual totals-as-eaten directly (no per-100g scaling — there's no database row to scale from), and any of the 8 fields left out of `values` is stored as 0 but recorded in `unknownFields`. GL is additionally marked unknown whenever GI or carbs is, since it can't be meaningfully derived without both. New `sumKnownField(entries, field)`: sums one field across entries while skipping any entry where that specific field is unknown, returning both the total and how many were skipped — the correctness-critical piece that keeps a real gap from silently reading as zero. `groupIntoMeals()`'s per-meal totals now use it (was a plain reduce before) and `MealGroup` gained a `hasUnknownValues` flag for the UI caveat.

**`TodayScreen.tsx`:** `AddLogEntryForm` gained a "Власний запис" ↔ "Обрати з бази" mode toggle. Custom mode swaps the database search/pick UI for a name field plus 8 nutrient inputs (any left blank = unknown, placeholder text says so) — portion, meal type, timestamp, and notes stay shared between both modes since they mean the same thing either way. Daily totals switched from plain `.reduce` to `sumKnownField`, with one combined "Позицій з невідомими значеннями: N" caveat near the totals block (a single count, not a per-stat disclaimer — deliberately simpler than tracking exclusions per displayed stat, and matches what was actually proposed and approved). `MealItemsList` shows "невідомо" instead of a misleading "0" for an item's own unknown field, and appends a small caveat to a meal's total line when any of its items has one.

**Also fixed while touching `spreadsheetInit.ts` for the new DailyLog column**: header-row range computation (`Ingredients!A1:O1` etc.) was hardcoded per tab — replaced with a small `headerRowUpdate()` helper that derives the range from each `*_HEADERS` list's actual length via `columnLetter()`, so adding a column to any tab's canonical header list (like this session's `UnknownFields`) can never again silently leave a stale hardcoded letter behind, the exact class of bug that would have bitten this change otherwise.

**Verified:** `npm run test` (139/139, up from 127 — 12 new), `npm run build` clean, live browser check of the not-signed-in state (no console errors, all 4 tabs render) — the actual custom-entry form is behind sign-in, so real end-to-end verification still needs the developer.

**Next steps:** developer live-tests the custom-entry flow (both database-pick and custom modes in the same meal, an entry with some fields unknown, confirming totals/caveats look right) — the `UnknownFields` column will need topping up on already-connected sheets too, but that's exactly what "Оновити структуру" (built earlier this session) already handles automatically. Item #3 (edit/merge existing entries) is the one remaining open item from the original handoff.
