# Technical Spec

> **Status:** 🟢 All four screens built, Android app built/signed/tested, interview completed 2026-09-07 (targets tuned from her answers) — see [requirements-open-questions.md](requirements-open-questions.md) for the interview record and `docs/build-log.md` for the full build history.

## Architecture

```
┌─────────────────────────────┐
│   PWA (React + Vite + TS)   │  installable on mobile + Windows desktop
│   src/lib/sheets.ts  ───────┼──► Google Sheets API v4 (user's own OAuth token)
│   src/lib/nutrition.ts ─────┼──► 1. bundled starter data (src/data/starter-foods.ts) — checked first
│                             │    2. USDA FoodData Central API — only if not in the bundle
└─────────────────────────────┘
```

- Single codebase serves phone browser, "Add to Home Screen" (mobile), and "Install app" (Windows desktop) — same PWA, no separate native build.
- Google Sheets is both the database and the sync layer: any signed-in device reads/writes the same spreadsheet.
- No serverless proxy needed for nutrition lookup: USDA FoodData Central is a free public-data API with no billing risk, so it's safe to call directly from the browser with its API key (unlike the Anthropic key, which the earlier design had to hide server-side).

## Google Sheets structure

Spreadsheet ID stored in `VITE_SPREADSHEET_ID`. Tabs:

**Schema resilience:** two independent mechanisms keep an existing spreadsheet readable across app releases and manual edits, without any version-tracking or migration-script system:
1. **Additive-only columns** — every schema change so far has appended new trailing columns (Favorite, GlycemicFlag, GiVerified, MealId), never inserted or removed one; a missing cell parses to a safe default. See the `dev-feedback-patterns` memory.
2. **Header-name-based column resolution** (`src/lib/sheetRow.ts`, added 2026-09-11) — `ingredients.ts`/`dishes.ts`/`dailyLog.ts`/`bloodSugar.ts` read/write each row by looking up the *actual* column position of each header name in row 1, not a fixed index. This makes a **reordered** sheet — a deliberate future schema change, or someone manually dragging a column in the Sheets UI — parse correctly too, which positional reads couldn't handle. (`settings.ts` never needed this: it's already key/value rows keyed by matching column A's text against a known key, not position.) Every `rowToX`/`xToRow` function takes an optional `columnIndex` param defaulting to each module's own canonical header order (`INGREDIENTS_HEADERS`/`DISHES_HEADERS`/`DAILY_LOG_HEADERS`/`BLOOD_SUGAR_HEADERS`, also imported by `spreadsheetInit.ts` so the header list is defined once, not duplicated) — real reads/writes always fetch and pass the live sheet's actual current header row instead.

### Ingredients
Raw foods only — always the uncooked/unprepared state, values per 100g. Anything requiring cooking or preparation belongs in Dishes instead (see below), even a single-ingredient one like cooked rice — cooking changes carbs/100g too much (water dilution) to treat as the same row. `GI` here is carried over from the food's published GI (which is normally measured on the cooked/eaten form) purely so Dishes has a value to pull from when computing a prepared dish's GI — it's not claiming the raw form itself has been measured.

| Column | Notes |
|---|---|
| NameUk | Ukrainian name — the primary label, always shown to mom |
| NameEn | English name (used to query USDA). Also shown in the UI as a subtle, secondary line next to NameUk — not something mom needs to read, but a visible fallback/cross-check so any variant detail (fat %, cut, etc.) that didn't make it into the Ukrainian name is still there for the developer or a translator to catch, per the dairy fat-% gap found in testing |
| Carbs_g | |
| GI | Glycemic Index — from the bundled static table, not an API (see below) |
| Fiber_g | |
| Sugars_g | |
| Protein_g | |
| Fat_g | |
| Calories_kcal | |
| Sodium_mg | |
| Source | `starter` (bundled), `usda` (fetched), or `manual` |
| DateAdded | ISO date |
| Favorite | `TRUE`/`FALSE` — marks an ingredient for quick access; favorited ingredients sort to the top wherever Ingredients are browsed or picked from (the main Foods list, and the ingredient picker when composing a custom Dish). Appended as the last column rather than inserted mid-schema, so existing rows need no migration — a blank cell reads as not-favorited |
| GlycemicFlag | `none` / `watch` / `avoid` — mom's own manual "should I be careful with this" marker, independent of GI/GL. See "Glycemic flag (watch/avoid)" below. Appended as column N, same additive pattern as Favorite — a blank cell reads as `none` |
| GiVerified | `TRUE` once a person confirmed the GI against a source they trust (see the `giVerified` note in `src/lib/ingredients.ts`) |
| UnknownFields | Comma-separated nutrient fields (`carbsG`, `gi`, `fiberG`, …) the person **left blank on purpose** when saving — added 2026-09-20. The cell for each stores 0 (a safe, writable default) but is never treated as a real zero: logging the ingredient carries the gap into the meal entry (`buildLogEntry`'s `itemUnknownFields`), and a dish built from it inherits it (`computeDishUnknownFields`). Additive column P; a blank cell means nothing is unknown |

### Dishes
Anything requiring preparation — from a single cooked ingredient (e.g. "Гречка варена") to a real multi-ingredient recipe (e.g. borscht) — auto-computed from Ingredients, never hand-typed. This is the counterpart to Ingredients being *always raw*: a food that changes meaningfully when cooked (grains/legumes absorbing several times their dry weight in water) belongs here, not as a separate "cooked" Ingredients row. Values are **per 100g of the finished/cooked product**, matching Ingredients' per-100g convention — mom logs a dish by portion grams exactly like an ingredient.

Schema is deliberately kept consistent with Ingredients: `NameUk`/`NameEn` first and `Source`/`DateAdded` last match exactly, same nutrient column names in between — only `IngredientsJson`/`YieldGrams` are Dish-specific, inserted in the middle.

| Column | Notes |
|---|---|
| NameUk | Ukrainian, shown to mom |
| NameEn | English label — like Ingredients, shown as a subtle secondary line in the UI, not something mom needs to read |
| IngredientsJson | `[{nameUk, grams}]` — raw ingredient names (must match an Ingredients row) and the raw grams used |
| YieldGrams | Total finished weight after cooking (e.g. 100g dry buckwheat → ~360g cooked). This is what makes per-100g values correct — cooking water adds mass but no calories |
| Carbs_g … Sodium_mg | Computed: `Σ(ingredient_nutrient_per_100g × grams_used / 100) / YieldGrams × 100` |
| GI | Computed as a **carb-contribution-weighted average** of the ingredients' GI (`Σ(carb_contribution_i × GI_i) / Σ(carb_contribution_i)`) — an approximation, not a lab-measured value (true GI isn't simply additive), but the standard practical simplification when no GI database entry exists for the exact prepared dish. For a single-ingredient dish this reduces to that ingredient's own GI. |
| Source | `starter` (bundled) or `manual` (custom-composed, once that feature exists) |
| DateAdded | ISO date |
| GlycemicFlag | `none` / `watch` / `avoid` — same three states as Ingredients, but set **independently**: a dish's own flag is never overwritten by its ingredients' flags. Appended as column O. See "Glycemic flag (watch/avoid)" below |
| GiVerified | Same meaning as on Ingredients |
| UnknownFields | Same as on Ingredients (column Q, added 2026-09-20). For a composed dish it is *computed*, not typed: a field is unknown if any ingredient it's built from has that field unknown; GI is additionally unknown if a carb-bearing ingredient's GI is unknown, or any ingredient's carbs are (GI is carb-weighted). See `computeDishUnknownFields()` in `src/lib/dishes.ts` |

Implemented in `src/lib/dishes.ts` (`computeDishNutrition`, pure and unit-tested).

### DailyLog
Every meal entry — one row per logged item (an ingredient/dish portion, or a custom/estimated entry — see below).

| Column | Notes |
|---|---|
| Timestamp | |
| MealType | Сніданок / Обід / Вечеря / Перекус |
| ItemName | ingredient or dish name |
| PortionGrams | |
| Carbs_g … Sodium_mg | computed for the portion, or typed directly for a custom entry |
| GL | computed: `GI × Carbs_g / 100` |
| Notes | |
| MealId | Ties multiple item-rows eaten in one sitting together as a single meal *occasion*, distinct from MealType — added 2026-09-11 per mom's real-usage feedback: MealType alone can't tell two same-day snacks apart, and without a shared identifier a multi-dish meal only ever displayed as several unrelated items instead of one meal with a combined total. Generated once per "add meal" form session (`AddLogEntryForm` in `TodayScreen.tsx`) and reused across every item saved in that session; a fresh form open (after "Зберегти запис") starts a new meal. Additive column (same pattern as Favorite/GlycemicFlag elsewhere) — a blank cell (rows logged before this existed) falls back to that row's own Timestamp, so old rows each remain their own single-item meal exactly as they already behaved. See `groupIntoMeals()` in `src/lib/dailyLog.ts`. |
| UnknownFields | Comma-separated list of which of this row's own nutrient fields (any of Carbs_g/GI/Fiber_g/Sugars_g/Protein_g/Fat_g/Calories_kcal/Sodium_mg, plus the derived GL) the person explicitly didn't know rather than a real value — added 2026-09-11 for custom/estimated entries (see below). The field itself still stores 0 (a safe, writable default); a blank cell means nothing is unknown, same additive-column convention as MealId. See `sumKnownField()`/`buildCustomLogEntry()` in `src/lib/dailyLog.ts`. |

**Custom/estimated entries** (added 2026-09-11, real-usage feedback item #2): a genuinely one-off item not in the Ingredients/Dishes database — restaurant food, a homemade dish with no exact recipe. `AddLogEntryForm` in `TodayScreen.tsx` has a "Власний запис" toggle that switches from database-picking to typing the item's name and its actual totals-as-eaten directly (not a per-100g figure scaled by portion, since there's no database row to scale from). Any of the 8 nutrient fields can be left blank rather than guessed — recorded in UnknownFields — and `sumKnownField()` excludes that specific field from any total it's rolled into (meal-level via `groupIntoMeals()`, daily-level in `TodayScreen.tsx`) rather than letting a real gap silently read as zero. Design decisions (confirmed with the developer via `AskUserQuestion` before building): unknown fields are excluded from totals with a visible caveat, not silently zeroed; any field can be unknown independently, not all-or-nothing; a custom entry is always a one-off DailyLog row, never saved to Ingredients for reuse (avoids an Ingredients list bloated with one-time restaurant meals).

**Editing, deleting, and moving a logged entry** (added 2026-09-11, item #3): previously nothing in this app could change or remove an already-saved DailyLog row. `src/lib/dailyLog.ts` gained `updateLogEntry()`/`deleteLogEntry()`/`moveLogEntryToMeal()`, all built on `findLogEntryRow()` — DailyLog has no surrogate row ID, so a row is located by its (Timestamp, ItemName, MealId) triple, the same content-based-matching convention `findIngredientRow`/`findDishRow` already use for their own tabs. `updateLogEntry` overwrites the row in place; `deleteLogEntry` clears it (new `clearRange()` in `sheets.ts`) rather than shifting rows below it up — every `listX()` already filters out a row with `row.length > 0`, so a cleared row simply stops appearing, no different in effect from a real delete. `moveLogEntryToMeal` reassigns an entry's `MealId`/`MealType` to join an existing sibling meal occasion — the "two snacks 5 minutes apart should be one" case, chosen over a dedicated multi-select merge UI (confirmed via `AskUserQuestion`) since it covers the realistic scenario (adding one late item to an existing meal) with much less UI. `TodayScreen.tsx`'s `LogEntryRow` exposed all three as per-entry actions (Редагувати/Перенести/Видалити); edit reuses `buildCustomLogEntry()` to re-derive the row from typed values regardless of whether the entry was originally a database pick or custom, and delete requires an inline confirmation step first (this app's established pattern for an irreversible-feeling action on health data).

> **Superseded 2026-09-20 by the meal editor — see "Meal editor" below.** The per-dish buttons proved crowded and hard to read; `updateLogEntry`/`deleteLogEntry`/`moveLogEntryToMeal`/`findLogEntryRow` and `clearRange()` were removed in favour of one batch `saveMeal()`. The dedicated *move* action no longer exists.

### Meal editor (added 2026-09-20)
"Add a meal" and "edit a meal" are one dedicated full-screen editor (`src/screens/MealEditorScreen.tsx`); the tab bar and settings gear are hidden while it's open so a stray tap can't drop a draft. It has two levels of buttons that never share a screen: the **meal view** (type, time, the dishes, "+ Додати страву", "Видалити вибрані", and a sticky footer with "Зберегти прийом їжі"/"Скасувати"; when editing, also "Видалити весь прийом їжі" behind an inline confirmation) and a separate **add-dish step** (database pick or "Власний запис", portion, notes, "Додати до прийому") or **edit-dish step** (the custom-entry fields). Nothing touches the spreadsheet until "Зберегти прийом їжі": dishes are a draft in memory, so Cancel (with a discard confirmation when there are changes, also wired to Android's back button) genuinely discards.

Saving is one `values:batchUpdate` computed by the pure `planMealSave()` in `src/lib/dailyLog.ts`: an edited dish overwrites its own row in place, a removed dish's row is blanked, a new dish takes a freed row first and otherwise goes after the last row — so a failure can't leave a meal half-saved. Rows are matched by (Timestamp, ItemName, MealId), consuming each match once so two identical dishes in one meal still get distinct rows; an original that can no longer be found (changed on another device) throws instead of guessing. If the time field is untouched, every existing dish keeps its own saved timestamp.

Each meal on Today and in the recent-days history has a single "Редагувати" button opening this editor, and shows the **same stats the daily status is set to show** (Settings' `Show*` toggles) plus the meal's weight in grams — `mealStatItems()` in `src/lib/mealStats.ts`.

### Meal-size recommendation (added 2026-09-20)
Shown in the meal editor as "Орієнтир на цей прийом": what's left of each daily limit the person enabled on the Today screen (calories, carbs, GL), split across the meals still to come, next to the running total of the meal being composed; the per-meal fat limit is shown as-is. **It is arithmetic on the person's own settings, not medical advice, and the UI says so right next to the numbers** (`uk.today.recommendation.disclaimer`). `src/lib/mealRecommendation.ts`, pure and unit-tested:
- The day is `MealsPerDay` meals, `SnacksPerDay` of them snacks and the rest full meals. The person sets `FullMealSharePercent` — what share of each daily limit one **full** meal gets — and a **snack's share is derived**: `snack % = (100 − full meal % × full meals) / snacks`. At the start of the day a full meal gets exactly its configured share (default 25 % → 450 kcal of 1800, ≈8.3 % / 150 kcal per snack with 3+3). As the day goes on, what's left of each limit (limit − eaten, this meal excluded) is shared over the planned meals still to come in proportion to those shares. If the snack share can't be derived (no snacks / no full meals / full meals ≥ 100 %) everything splits evenly instead of inventing a ratio; Settings rejects a share that leaves nothing for the snacks. This replaced an earlier "a snack is half a meal" constant, which had no basis.
- **The default (25) is a starting point, not a citation.** No authoritative figure exists for a 3+3 day: clinical guidance (ADA) is to individualise with a dietitian, and the commonly repeated "breakfast 25–30 %, lunch 30–35 %, dinner 25–30 %, snacks 5–10 % each" could not be traced to a primary source when this was researched (a university page a search summary attributed it to did not contain it). 25 % is mid-range and lands each snack inside 5–10 %.
- Next to each per-meal recommendation the editor shows what would remain of that daily limit after the meal being composed ("Залишиться за день: 945 із 1800 ккал", red and "перевищено на N" once exceeded) — `MealRecommendation.dailyLeft` is limit − eaten before this meal, unclamped; the editor subtracts the live draft.
- Time left before `SleepTime` does **not** change the numbers — it only adds a note when, at the even spacing `(SleepTime − WakeTime) / MealsPerDay`, fewer meals than the planned ones still fit. (The first version shrank the meal count as bedtime neared, which crammed the whole day's untouched budget into one late meal — the full daily limit by ~21:30 on an empty day. Fixed 2026-09-20; regression-tested.) "Now" is the meal's own time field, so logging after the fact measures from when it was eaten. Wake/sleep values read back from Sheets as `6:30:00` are parsed too.
- A used-up limit gives 0 (never negative) and is flagged.

### BloodSugar
| Column | Notes |
|---|---|
| Timestamp | When the test was **taken** (not when it was written down) — set in the form, default now (2026-09-27) |
| ValueMmolL | |
| Context | fasting / after-meal / other |
| Notes | |

The Цукор screen lists readings grouped by day (Сьогодні / date), each led by its time like a meal. **Today's readings can be edited** («Редагувати» opens the same form, including the time); the tab has no row ID, so `updateBloodSugarEntry()` finds the row by timestamp + value (`planBloodSugarUpdate()`, unit-tested) and rewrites it in place. A time in the future is rejected.

### Settings
Key/value rows, pre-filled with Project Brief defaults; mom's interview tunes the values, not the schema.

| Key | Default |
|---|---|
| DailyCarbsTarget | 130–150 (g) |
| FatPerMealLimit | 15–20 (g) |
| DailyCaloriesTarget | 1400–1600 |
| MealsPerDay | 5–6 |
| SnacksPerDay | 3 — how many of MealsPerDay are snacks (the rest are full meals); only used by the meal-size recommendation (added 2026-09-20). 3 main + 3 snacks is the split from mom's interview |
| FullMealSharePercent | 25 — percent of each daily limit one full meal gets; the snack share is derived from what's left (see "Meal-size recommendation"). Editable in Settings, which shows the resulting snack share live |
| MaxGapHours | 2.5–3 |
| BloodSugarMin | 4.0 |
| BloodSugarMax | 7.8 |
| WakeTime | 06:30 |
| SleepTime | 00:00 |
| TimeFormat | `24h` (default) or `12h` — how times are displayed and picked (added 2026-09-20). The browser's own time inputs follow the device locale and can't be forced, so meal time and wake/sleep use hour/minute selects (`TimeInput.tsx`); stored values stay 24h either way. `formatTime()` follows it via a module-level preference refreshed by every `getSettings()` |
| DailyGlycemicLoadTarget | 80 (top of the diabetes-specific 60–80/day range mom's own old spreadsheet cites, via prodiabet.ua) |
| ShowCarbsProgress | FALSE |
| ShowCaloriesProgress | TRUE |
| ShowGlycemicLoadProgress | TRUE |
| ShowFatTotal | FALSE |
| ShowSugarsTotal | FALSE |
| ShowProteinTotal | FALSE |
| ShowSodiumTotal | FALSE |

## Google Sheets API integration

Client-side only — no custom backend for data storage. Uses Google Identity Services (OAuth) so the app acts as the signed-in user (mom or the developer), reading/writing her own spreadsheet.

**One-time setup (manual, in Google Cloud Console — done by the project owner, not by Claude):**

1. Create a Google Cloud project.
2. Enable the **Google Sheets API** and the **Google Drive API** (the latter added 2026-09-11, needed only for the "create a new spreadsheet from the app" flow below).
3. Configure the **OAuth consent screen** — External, in Testing mode; add both Google accounts (mom's and the developer's) as **test users** (avoids the app-verification process needed for a two-person app). On the **Data Access** tab, the configured scopes must include both `.../auth/spreadsheets` and `.../auth/drive.file` — a scope the code requests but the consent screen doesn't list is rejected by Google, not silently ignored.
4. Create an **OAuth Client ID** (type: Web application), with the app's dev/prod URLs as authorized origins.
5. Copy the Client ID into `.env` as `VITE_GOOGLE_CLIENT_ID`.
6. Either connect an existing spreadsheet (reuse mom's, restructured into the tabs above, or a freshly blank one — see "Connecting a brand-new blank spreadsheet" below) and copy its ID into `.env` as `VITE_SPREADSHEET_ID`, or use the app's own "Створити нову таблицю" button (Settings screen) to create one from scratch — see "Creating a new spreadsheet from the app" below.

**`drive.file` re-consent note:** adding this scope means every existing signed-in device (mom's phone, the developer's) needs to sign in again once to grant it — a stored access/refresh token from before this scope existed doesn't retroactively cover it. This is a one-time re-consent, not a recurring thing.

`src/lib/sheets.ts` wraps: `initGoogleAuth()`, `signIn()`, `signOut()`, `readRange(tab, range)`, `writeRange(tab, range, values)` — thin wrappers over the Sheets REST API using the OAuth access token.

**Creating a new spreadsheet from the app:** `createSpreadsheetInAppFolder(name)` in `sheets.ts` uses the Drive API to create a blank spreadsheet inside a single app-owned Drive folder ("Track My Meals" in Drive root, created on first use), using the `drive.file` scope — the narrowest scope that can do this, since it only grants access to files the app itself creates (it does not grant broader Drive access, and doesn't change how the existing "connect an existing spreadsheet by pasting a link" flow works — that still relies entirely on the `spreadsheets` scope). The caller then calls `initializeSpreadsheet()` (see below) to populate the new file's tabs, same as any other blank spreadsheet. The Settings screen exposes this as a name field + "Створити" button, alongside the existing "paste a link" flow for an existing spreadsheet and the Mom's/test-sheet shortcut buttons.

**Connecting a brand-new blank spreadsheet**: a genuinely blank Google Sheet has none of the 5 tabs above, which would otherwise make every read fail. `initializeSpreadsheet()` (`src/lib/spreadsheetInit.ts`) creates whichever tabs are missing and fills each with its header row (Settings also gets its full set of default key/value rows). Used directly by the "create a new spreadsheet" flow; for a connected sheet it's part of the structure check/repair below.

**Tab layout: keys in row 1, readable names in row 2** (decided 2026-09-26). Row 1 of every tab holds the fixed column keys the app reads (`Carbs_g`) — they never change with the language. Row 2 holds readable names in the user's language (`Вуглеводи, г`), generated from `uk.sheetLabels` via `src/lib/sheetLabels.ts`; data starts at row 3, and the repair freezes rows 1–2. This replaces the earlier bilingual-header style (`Carbs_g (Вуглеводи, г)`), which mixed the two in one cell and couldn't follow a language change. **Multi-language:** UA and EN are planned for the first official release — adding a language means adding its label set to `LABEL_SETS`; every set is also used to *recognize* row 2, so a sheet labelled in one language still reads correctly after a switch, and the repair relabels it (a label a person reworded is left alone). Row 2 has no marker cell: it's recognized by content (at least half its filled cells under known columns are a known label for that column — a data row never is). A tab without row 2 (older sheets) keeps working with data from row 2 (`parseTab()` → `firstDataRow`); adding the row is a proposed, non-blocking upgrade. **Settings** follows the same idea with three columns, `Key | Value | Label`: row 2 names those three, and each key row's Label is that setting's Settings-screen name.

**Structure check and repair** (replaced the header-only "Оновити структуру" top-up on 2026-09-26 — see the build log for the bug it caused on mom's sheet). Layers:

1. **Header matching** (`src/lib/sheetRow.ts`): a header cell is reduced to its key by trimming and dropping a trailing parenthesized label, so old bilingual headers still read correctly until upgraded. Every read and write scans the same width (`SCAN_LAST_COLUMN`, AZ), so the check and the data code always see the same columns.
2. **Guard on every read and write**: data modules only get a column index through `parseTab()`/`resolveColumnIndex()`, which throw `SheetStructureError` (a Ukrainian message pointing to Settings) if any expected column is missing or duplicated, or the tab isn't this app's layout — a field must never be silently dropped from a health log. `writeRange()` also refuses to append a blank row and treats a reply reporting 0 written cells as an error.
3. **Check** (`src/lib/sheetSchema.ts`, pure and tested; IO in `spreadsheetInit.ts` → `checkSpreadsheetHealth()`). Issues are **blocking** (the tab can't be safely read/written: missing tab, missing/duplicate columns, not this app's layout, missing Settings keys) or **presentation** (the tab works but isn't in the current format: non-bare keys in row 1, no/stale names row).
4. **App-wide flagging** (`src/context/SheetHealthContext.tsx` + `src/screens/SheetHealthDialog.tsx`): the check runs on sign-in, when the connected spreadsheet changes, and the moment any screen's read/write throws `SheetStructureError` (`onSheetStructureError`). Problems open a dialog listing each issue with what the repair will do — "Таблицю потрібно виправити" (blocking) or "Таблицю можна оновити" (presentation only) — with the repair button, "Пізніше", and, when something can't be fixed automatically or the repair fails, a pointer to a manual fix or a fresh spreadsheet in Settings. After a repair the screens remount and re-read. Settings shows the same list and button (for after "Пізніше").
5. **Repair** (`repairSpreadsheet()`), two passes on fresh scans:
   - *Structure* (only tabs whose issues are all fixable; each gets a backup copy `<Tab> — копія <date time>` first): missing tab → created with keys + names rows; missing columns → added after the last column holding **anything**; duplicate columns → keep the one with the most data, move stray values into it, delete the others — only if no row has two different values across them; missing Settings keys → appended with defaults and names. *Not this app's layout* and conflicting duplicates are reported, never touched.
   - *Presentation* (tabs with no blocking issue left; no backup — never touches a data cell): row 1 rewritten to bare keys, row 2 inserted/refreshed with names, rows 1–2 frozen.

   The steps are separate API calls but idempotent, so re-running finishes an interrupted repair.

**Three spreadsheets, three roles** (settled 2026-09-11): mom's real sheet (`VITE_DEFAULT_SPREADSHEET_ID`, her actual logged data — never experimented on), a **test** sheet (`VITE_SPREADSHEET_ID`, what real testers connect to via the "Підключити тестову таблицю" button — kept matching whatever schema the *currently-released* app build expects), and a **dev** sheet (`VITE_DEV_SPREADSHEET_ID`, "Підключити dev-таблицю" — where actual schema/data changes get tried during active development). The dev/test split exists specifically so in-progress schema work (like the reorder-resilience refactor above) never risks breaking what a real tester's already-released app is reading from. **Rule going forward: any schema experiment (new column, reordering test, tab restructuring) targets the dev sheet, never test or mom's**, until the corresponding app release actually ships and test can be safely brought up to match.

## Nutrition lookup: bundled data + USDA FoodData Central

Lookup order, implemented in `src/lib/nutrition.ts`:

1. **Bundled starter dataset** (`src/data/starter-foods.ts`) — 60 common Ukrainian/Eastern European staples (grains, dairy, common proteins, vegetables, fruits), each with both `nameUk`/`nameEn` and full nutrient values including GI. Curated once, shipped with the app, not fetched at runtime. Covers the large majority of mom's actual day-to-day foods (per the health context, her diet leans toward simple home-cooked staples, not a huge rotating variety).
2. **Static GI reference table** (`src/data/gi-table.ts`) — since no free API provides Glycemic Index at all (it comes from academic studies, not nutrition labels), GI is always looked up locally, never fetched. Covers the same foods as the starter dataset, plus any commonly-needed extras.
3. **Translation** (`translateUkToEn` in `src/lib/nutrition.ts`) — only when a food isn't in the bundle. Mom only ever *types* a Ukrainian name (she's never asked to supply or understand English — confirmed necessary after live testing showed she doesn't speak English); it's translated before querying USDA — since 1.5.2 via **Google Cloud Translation through our own `api/translate.js`** (key `GOOGLE_TRANSLATE_API_KEY` on Vercel; [MyMemory](https://mymemory.translated.net/) before that, dropped for its 5,000-characters-a-day anonymous limit). Typed queries are trimmed and lowercased; Latin-letter queries skip translation. Translations are remembered on the device (500 entries) and each device may send **2,000 characters a day**; the Google Cloud project's quota *"v2 and v3 general model characters per day"* is capped at **15,000**, which keeps a 31-day month inside the free 500,000 characters (Google bills every character sent, incl. spaces). When either limit is reached, the search screen shows a notice and works in English only until the next day. Only the top 5 USDA matches are back-translated (one request), the rest are listed in English. The resolved English name is displayed afterward as a subtle secondary line next to the Ukrainian name wherever foods are listed — not something she needs to read, but a visible fallback in case a detail the numbers depend on (fat %, cut, etc.) didn't make it into the Ukrainian name.
4. **USDA FoodData Central API** — queried with the translated name. Free, no cost, requires a free API key (`api.data.gov`, no card needed) stored as `VITE_USDA_API_KEY`. Returns carbs/protein/fat/fiber/sugar/calories/sodium per 100g (no GI — falls back to a manual GI entry).
5. **Manual entry** — always available regardless of the above, if nothing is found anywhere (translation unavailable, or USDA has no match); mom or the developer can type values in directly (`Source = manual`).

Only USDA FoodData Central is wired up initially — Open Food Facts (better for packaged/branded goods via barcode) was considered but deferred since mom's diet is mostly whole/home-cooked foods; add it later only if real usage shows gaps.

Flow: mom types a Ukrainian name → checked against the bundle first → if not found, translated to English and queried against USDA → show the estimate (GI filled from the static table if available, else flagged for manual entry) → mom approves → app writes the row to the Ingredients tab.

## Ingredient & Dish availability: bundle merge

The bundled starter data (`src/data/starter-foods.ts`, `src/data/starter-dishes.ts`) is usable everywhere ingredients or dishes are browsed or picked from — the Продукти tab's lists, the Dish composer's ingredient picker, and the Today screen's meal-logging picker — **without first being individually saved to the Ingredients/Dishes sheet**. `mergeWithStarterFoods()` (`src/lib/ingredients.ts`) and `mergeWithStarterDishes()` (`src/data/starter-dishes.ts`, to avoid a circular import with `lib/dishes.ts`) merge the bundle with whatever's actually in the personal sheet at read time, keyed by name — a sheet row (an edit, or a favorited entry) always overrides the bundle default for the same name. Nothing needs "approval" to be *used* this way; approval (the flow above) is only needed for a genuinely new food not in the bundle, or to make a bundle item's row permanent — e.g. to edit its values, or to favorite it (see below).

A Dish composed from a bundle-only ingredient (never saved to the Ingredients sheet) is allowed — its `IngredientsJson` reference may not resolve to an actual Ingredients row if read back later, but nothing re-resolves it after the Dish is saved (its nutrition is computed once, at save time, and stored as static columns), so this is a harmless, accepted gap rather than a bug. *(Planned change: once ingredient edits offer to recompute the dishes that use them, bundle-only references are resolved from the bundle — see "Label photos, drafts and the 3-day update window".)*

## Favorites

`Ingredient.favorite` (Ingredients tab column M, `TRUE`/`FALSE`) marks an ingredient for quick access — favorited ingredients sort to the top wherever Ingredients are listed (`sortFavoritesFirst()` in `src/lib/ingredients.ts`). Only an actual sheet row can hold the flag, so favoriting a bundle-only ingredient (one that only exists via the merge above) saves it to the sheet as a side effect — the *only* implicit "add" the app performs, and only in response to that explicit favorite action, never automatically.

## Glycemic flag (watch/avoid)

`glycemicFlag: "none" | "watch" | "avoid"` (`src/lib/glycemicFlag.ts`) is a manual "should mom be careful with this" marker, set independently on `Ingredient` (Ingredients column N) and `Dish` (Dishes column O) — separate from GI/GL, which are computed. Shown as a small cycling badge (○ → △ → ✕, `cycleGlycemicFlag()`) wherever ingredients/dishes are listed, same interaction as the ★/☆ favorite toggle; flagging a bundle-only item implicitly saves it first, reusing the favorite mechanism above.

**No automatic propagation in either direction:**
- **Ingredient → Dish** is a *derived, non-persisted* hint only: `dishContainsFlaggedIngredient()` (`src/lib/dishes.ts`) checks a dish's stored `IngredientsJson` against current ingredient flags at read time and surfaces a separate "contains a flagged ingredient" note in the Foods screen — it never overwrites the dish's own explicit `glycemicFlag`. Other ingredients in a dish can compensate for one flagged one, and sometimes the combination or cooking method is the actual problem even when every ingredient is individually fine, so the dish's flag stays independently settable.
- **Dish → Ingredient** is a manual suggestion, not automatic: flagging a dish (watch/avoid) surfaces its ingredient list right there in the Foods screen, with an optional (not forced) prompt to also flag specific ones.

## Meals-before-reading review

The Blood Sugar screen lets mom expand any reading to see the last 6 `DailyLog` entries at or before that reading's timestamp, most-recent-first, with time-before-reading shown per item (`mealsBeforeTimestamp()` in `src/lib/dailyLog.ts`). Pure timestamp filter/sort — ISO strings already sort correctly lexically — with no correlation or statistics computed; mom reviews the list herself to spot patterns. Deliberately scoped down from a full food/blood-sugar analytics feature (see `docs/build-log.md`'s 2026-09-07 design entry).

## Google auth on Android: system browser + PKCE, not GIS

The web/PWA sign-in (`src/lib/sheets.ts`'s GIS token-client flow, described above) **cannot complete inside the Android build** — confirmed live as "Error 400" during the 2026-09-10 Android session. Google deliberately blocks OAuth sign-in from inside an embedded WebView (an anti-phishing policy that applies to every app, not something specific to this one), and a default Capacitor app renders in exactly that kind of WebView.

**Fix, Android-only, web path untouched**: `initGoogleAuth()`/`signIn()` in `sheets.ts` branch on `Capacitor.isNativePlatform()`. On native, sign-in uses the system browser (`@capacitor/browser`, which launches Chrome Custom Tabs — a real browser context Google will authorize) with the Authorization Code + PKCE flow (RFC 8252, Google's own recommended pattern for installed apps):

1. Generate a PKCE `code_verifier`/`code_challenge` (Web Crypto, no library).
2. Open `https://accounts.google.com/o/oauth2/v2/auth` in the system browser via `Browser.open()`.
3. The redirect (`ca.roncreator.trackmymeals:/oauth2redirect` — a single slash, opaque URI with no host/authority, deliberately) is caught by an intent-filter on `MainActivity` (`AndroidManifest.xml`, matched on `android:scheme` alone since there's no host to match on) and delivered to the app via `@capacitor/app`'s `appUrlOpen` event.
4. Exchange the returned `code` for an access token via a direct `fetch()` to `https://oauth2.googleapis.com/token` (no `client_secret` param — see below) — no library needed, same as every other Sheets API call in this codebase.

**A second OAuth client was required** — the existing Web application client (`VITE_GOOGLE_CLIENT_ID`) can't be reused, because a "Web application" client's redirect URIs must be pre-registered HTTPS/localhost origins, incompatible with a custom URI scheme redirect.

**Getting the working client configuration took three rounds of live-testing-driven correction** — worth recording all three since each looked like "the fix" until the next test disproved it:

1. **"Desktop app" type client, rejected**: Error 400 (`invalid_request`, citing Google's "secure response handling" policy) — custom URI scheme redirects are only accepted for "Android" or "iOS" type clients, since only those let Google verify which app owns the scheme (via package name + signing certificate); a "Desktop app" client has no such binding.
2. **"Android" type client, still rejected on the double-slash redirect URI**: switching client type alone wasn't enough — `ca.roncreator.trackmymeals://oauth2redirect` parses as having an authority component (`oauth2redirect` as host), which the validator for this client type doesn't accept. Fixed by using the single-slash opaque form instead (matches the convention Google's own AppAuth-Android library uses).
3. **"Custom URI scheme is not enabled for your Android client"**: a specific, actionable error pointing at a Console-only setting — Google added an explicit opt-in toggle for custom-scheme redirects on Android OAuth clients (pushing Android App Links as the more-secure default). No code change, just enabling that toggle on the client's edit page.

**Final working setup**: `VITE_GOOGLE_ANDROID_CLIENT_ID`, an "Android" type client registered with package name `ca.roncreator.trackmymeals`, the SHA-1 fingerprint of the signing certificate (from `./gradlew signingReport`, run with `JAVA_HOME` pointed at Android Studio's bundled JDK since a plain terminal doesn't have Java on `PATH` by default), and the custom-URI-scheme toggle enabled. "Android" type clients issue **no client secret at all** (verification is via package+signature instead), so this path is fully secret-free, same as the web flow.

**Correction, found once the release keystore was actually generated**: Google Cloud Console's Android client edit page has **one** SHA-1 field, not a multi-fingerprint list — there is no "+ Add fingerprint" option. Once the release keystore existed (see the Phase 1 entry below), its SHA-1 simply **replaced** the debug one on this same client, rather than being added alongside it. This means **only the release build can sign in from that point on** — a deliberate, accepted tradeoff, since mom only ever runs the signed release build and debug was purely a testing vehicle. If debug-build sign-in testing is ever needed again, it would need its own separate Android-type client (same package name, debug SHA-1), not a second fingerprint on this one.

**Also found and fixed in the same live-testing pass**: the app's CSS had never accounted for Android's edge-to-edge system bars (status bar over the top, gesture/nav bar over the bottom) — bad enough that the bottom tab bar was unusable on a real device. `src/index.css`'s `.app-content`/`.tab-bar` now add `env(safe-area-inset-top)`/`env(safe-area-inset-bottom)` padding, which is `0px` (a no-op) on web/desktop.

## Meal-time reminder (Android/Capacitor)

The web/PWA codebase is also wrapped as an Android app via [Capacitor](https://capacitorjs.com) (`capacitor.config.ts`, `android/`) — additive to, not replacing, the browser/PWA path, which keeps working exactly as before. App ID `ca.roncreator.trackmymeals`. Full design rationale (why Capacitor over a backend/push service, cross-device staleness tradeoff, Phase 2 ideas) is in `docs/build-log.md`'s 2026-09-09 "Scoped the meal-time reminder" entry — this section just documents the mechanism as built.

- **Pure scheduling logic** (`src/lib/reminders.ts`, unit-tested): `computeReminderTime(lastMealTime, maxGapHours)` and `shouldScheduleReminder()`/`isWithinQuietHours()` — a reminder due inside the `[SleepTime, WakeTime)` window is skipped entirely, not deferred to wake time.
- **Platform glue** (`src/lib/reminderScheduler.ts`, not unit-tested — thin IO wrapper, same convention as `sheets.ts`): `initMealReminders()` (requests notification permission, creates a high-importance/lock-screen-visible channel — call once at app startup) and `scheduleMealReminder(lastMealTime, settings)` via `@capacitor/local-notifications`. Both are no-ops outside a native build (`Capacitor.isNativePlatform()`), so calling them from the shared React code is always safe.
- **Trigger points**: `TodayScreen` reschedules whenever its most-recent `DailyLog` entry or `Settings` change — this covers both "just logged a meal" and "reopened the app" (a `@capacitor/app` `resume` listener re-reads the sheet on foreground, refreshing a possibly-stale cached state — see the build-log entry for the accepted cross-device gap this doesn't fully close). Tapping the notification (`localNotificationActionPerformed`, handled in `App.tsx`) deep-links into Today's quick-add form.
- **Android manifest** (`android/app/src/main/AndroidManifest.xml`): `POST_NOTIFICATIONS` (Android 13+ runtime permission), `SCHEDULE_EXACT_ALARM` (Android 12+, for on-time delivery), `RECEIVE_BOOT_COMPLETED`.
- **Fixed 2026-09-27 — reminders only arrived when the app was opened:** the notification was scheduled without `allowWhileIdle`, so Doze held it while the phone was idle; opening the app then found it overdue and fired it 5 s later. Now scheduled with `allowWhileIdle: true`. Also, Android 14+ leaves "Alarms & reminders" (exact alarms) **off by default** for new installs even though the manifest declares it: `getReminderAccess()` checks notification permission and `checkExactNotificationSetting()`, and `ReminderAccessNotice` (top of Today, native only) explains what's missing with one button (`requestReminderAccess()` → permission prompt / system settings screen), re-checked on resume, plus a hint about battery optimisation on aggressive OEMs. **Needs an on-device test with the screen off.**
- **Building**: `npm run build:android` (Vite in `android` mode + `npx cap sync android`), then Gradle. The android mode ships a self-removing service worker instead of the PWA one (the worker kept old screens after updates; since 1.5.1 it is web-only, see `src/lib/serviceWorker.ts`). `KeyboardFriendlyWebView` replaces Capacitor's WebView via `res/layout/capacitor_bridge_layout_main.xml` (keyboard-language fix, 1.5.1).
- **Release signing**: `android/app/build.gradle` reads `android/keystore.properties` (gitignored) if present, else falls back to debug signing. See `android/keystore.properties.example` for the one-time `keytool` setup — needs a JDK, so it's done once on whichever machine has Android Studio, not regenerated per build.
- **Resolved 2026-09-10**: `./gradlew assembleRelease` needs a JDK + Android SDK (Android Studio), which the primary dev machine lacks — but access to a separate Android Studio machine was available the same day this was written, and the release keystore, signed builds, and on-device testing have all been done from there since.

## Glycemic Load calculation

```
GL = (GI × Carbs_g_in_portion) / 100
```
Implemented as a pure function in `src/lib/health.ts`.

**Dishes today** (`computeDishNutrition` in `src/lib/dishes.ts`): nutrients = Σ (each ingredient's per-100 g value × grams entered), divided by the finished yield weight. GI = carb-weighted mean of the ingredients' GIs (the standard mixed-meal method, Wolever). Known gaps: GI depends strongly on cooking state (raw vs boiled carrot; potato/pasta by cooking time; mashing/blending raises it, cooling lowers it), and the composer can't tell whether an ingredient row is raw or cooked — so a raw weight entered against a cooked row (e.g. «гречка варена» ~92 kcal/100 g weighed dry) understates carbs ~3.5×.

### Planned: food families with cooking states (designed 2026-09-27, not built)

Chosen with the developer: **option B (families with states) as the mechanism, option D (published whole-dish GI) only as a verification/visibility aid** — never replacing B's result.

- **Scope first: carb-rich foods only** (grains, pasta, potatoes, legumes, root vegetables, corn, fruit — roughly 20–30 families). Ingredients with negligible carbs (meat, fish, eggs, oil, most leafy/non-starchy vegetables) contribute ~nothing to GL, so their state doesn't matter and the composer doesn't ask about it.
- **Data:** each family (e.g. Картопля) has state variants — сира, варена, печена, пюре, смажена, консервована… — each with its own per-100 g values, GI, source and reliability (as on the review page). Ingredients gain `Family` + `State`.
- **Composer:** for a carb-rich ingredient she enters the **raw weight** and picks **«стан у готовій страві»** per ingredient (so "potatoes boiled, dill added raw at the end" works). The dish's final weight stays as today.
- **Why no cooked weight per ingredient is needed:** carbs (and protein/fat) are conserved through cooking — only water moves. So the ingredient's carbs = *raw* variant carbs × raw grams, the dish per-100 g = totals ÷ final weight (mass balance, as today), and the *cooked-state* GI is applied to exactly those carbs in the carb-weighted mean. The cooked weight of each ingredient never enters the GL maths.
- **Where a raw→cooked weight factor is still useful** (the developer's density idea): (a) estimating the dish's final weight when the pot wasn't weighed, (b) sanity-checking an entered final weight, (c) converting when only a cooked weight is known. Factor = raw per-100 g ÷ cooked per-100 g of the same family, computed from **carbs** for carb-rich foods (carbs are conserved even when oil is added in frying) and from kcal only as a fallback (kcal shifts when fat is absorbed or rendered out). E.g. rice 80 g carbs raw vs 28 g boiled → ×2.8.
- **Missing state GI:** use the nearest state with a lower reliability label and a written reason; the dish GI is always labelled an **estimate** («розрахунок з інгредієнтів») with an ⓘ noting that fat, protein, fibre and acidity in a dish usually lower the real response.
- **Option D as verification:** where a published GI exists for a comparable whole dish, show it next to the computed estimate («у дослідженнях схожої страви: 48») with its source — for visibility, not as the value used.
- Also fixes the raw/cooked weight mix-up above, since each ingredient's state is explicit.

## Per-meal fat limit logic

Compare a meal's total `Fat_g` against `Settings.FatPerMealLimit`; warn (not block) when exceeded, since the limit exists due to no gallbladder.

## Meal timing logic

Track time since the last logged meal; warn when approaching `Settings.MaxGapHours` (gastritis requires eating every 2.5–3 hrs).

## New product validation flow

App suggests (bundle match or USDA lookup) → mom reviews the estimate → mom approves → row saved to Ingredients with `Source = starter`/`usda`/`manual` as appropriate. Never auto-saves without approval.

## Item IDs and the sheet upgrade (release 1.6, designed 2026-10-01)

> **Status:** 📝 Designed with the developer, not built. Comes **before** the verified food database (1.7) and mom's data import (1.8) — see `docs/roadmap.md`.

**Why:** everything in the sheet is linked **by name** today — `Dishes.IngredientsJson` stores `{name, grams}`, `DailyLog` has only `ItemName`, `findIngredientRow`/`findDishRow` find rows by name, and `mergeWithStarterFoods` lets a sheet row override a built-in item of the same name. Names collide (two «хліб»), need whole sentences to tell apart, and change — 1.7 renames built-in items to proper names, which would silently cut every dish off from its ingredients. IDs make names plain labels.

### ID scheme
| Where | Format | Assigned |
|---|---|---|
| Built-in items (today's `starter-foods.ts` / `starter-dishes.ts`, later `verified-foods.json`) | `B0001`, `B0002`… | Once, in the data file. **Never changed, never reused.** An item that is removed or split later stays defined as *retired* with `replacedBy`, so old references still resolve. |
| The user's ingredients (Ingredients tab) | `I1`, `I2`… | By the app when the row is created. |
| The user's dishes (Dishes tab) | `D1`, `D2`… | Same. |

- Numbers, not readable names: readable IDs collide and need sentences to distinguish; the prefix is the item *kind*, never a status (verified/unverified changes over time; an ID doesn't). `B` also fits the database's future: entries may be only partly complete — e.g. checked nutrients but no known GI — so verification is recorded per part of an entry (1.7), never as a property of the ID (developer, 2026-10-01). The public pages can still have readable addresses (`…/foods/B0042-apple-raw`) — only the ID part is looked up.
- **Next number** = 1 + the highest of (the largest number in the tab, the Settings counter `NextIngredientNumber` / `NextDishNumber`), and the counter is updated with the write — so an ID freed by deleting the last row by hand in Sheets is still never reused. Two devices adding an item in the same second could both take the same number; the structure check detects duplicate IDs and gives the later row a new one (accepted risk — one user, rarely two devices at once).
- The same name may exist as a built-in item and as the user's item (`B0042 «Яблуко»` and `I12 «Яблуко»`) — the IDs keep them apart; the duplicate-name check (below) keeps *her* from mixing them up.

### Sheet changes (all additive — appended columns, nothing renamed or removed)
| Tab | New column | Meaning |
|---|---|---|
| Ingredients | `Id` | `I…` |
| Ingredients | `BasedOn` | The built-in ID this row is a saved copy of (a favourite or edited built-in item), else blank. Such a row replaces the built-in item in lists. |
| Dishes | `Id` | `D…` |
| Dishes | `BasedOn` | Same as on Ingredients, for built-in dishes. |
| DailyLog | `ItemId` | The item a row was logged from (`B…`, `I…` or `D…`); blank for custom entries and for rows logged before 1.6. `ItemName` stays as the readable snapshot. |
| Settings | `NextIngredientNumber`, `NextDishNumber` | The never-reuse counters (keys, like the other settings). |

`Dishes.IngredientsJson` elements gain `id`: `{"id":"I12","name":"Гречка суха","grams":100}` — `name` stays as a readable snapshot and a fallback. (The readable recipe column `I12:20, …, total:60` from the September redesign notes is a later step, not 1.6.)

### Upgrading an existing sheet (silent, lossless)
Run by the structure check after sign-in / sheet switch. **Only blank cells are written and only columns/tabs/keys are added** — no existing value is changed, so it needs no confirmation:
1. Add the missing columns / Settings keys (existing `missingColumns` / `missingSettingsKeys` repairs).
2. Give every Ingredients / Dishes row without an `Id` the next `I` / `D` number, in row order; set the counters.
3. Fill `BasedOn` where the row's name matches a built-in item's name exactly (normalised as in the duplicate check) — today that is how a favourite or edited built-in item is stored.
4. Resolve each dish's recipe names to IDs, the same way the app resolves them today: the user's ingredient of that name first, else the built-in item. A name that matches nothing (renamed or deleted by hand) keeps its name-only entry and the dish is marked in the editor «Інгредієнт не знайдено: …» — never dropped.
5. `DailyLog.ItemId` is **not** back-filled: past rows stay name-only (a name may have meant different items over time; guessing could mislink them). They're never updated by the later 3-day window either.

**Silent vs. asking (changes the structure-check dialog):** additive, lossless repairs — missing tab, missing columns, missing Settings keys, missing IDs / `BasedOn` / recipe IDs — are applied **without the dialog**. The dialog stays only for what needs a person: someone else's layout (`notAppLayout`), duplicate columns with conflicting values, and the presentation rewrites that move or rewrite existing cells (inserting the readable-names row, rewriting header text). This is also the mechanism 1.8 and 1.9 rely on for their new columns and tabs.

### The app working by ID
- **Lists / pickers:** built-in items merged with the user's rows **by ID**: a row with `BasedOn = B0042` replaces `B0042`; everything else is listed as it is (two «Яблуко» can coexist — each shows its kind/source).
- **Edits, favourite, glycemic flag, rename:** find the row by `Id`. Renaming is safe — nothing refers to the name any more.
- **Favouriting / editing a built-in item** saves a copy: new `I…`, `BasedOn = B…`.
- **Logging a meal** writes `ItemId`. **Composing a dish** stores ingredient IDs.
- **Built-in dishes** (`starter-dishes.ts`) reference their raw built-in ingredient by ID instead of `rawNameUk`.
- Dish nutrition, unknown fields, glycemic flags keep working as today — only the lookup key changes.

### Duplicate-name check
As designed 2026-09-27 (see *Label photos… → 1. Item IDs* below), now part of 1.6: whenever an item is named (add ingredient, save a USDA pick, edit/rename, compose a dish), the name is checked as she types against her items **and the built-in items**, normalised (case-insensitive, trimmed, repeated spaces collapsed, Latin look-alike letters mapped to Cyrillic `i→і`, `o→о`, `a→а`, `e→е`, `c→с`, `p→р`, `x→х`, …). On a match: «Продукт «хліб» уже є» + a card of the existing item (calories, source) + **«Це він — використати наявний»** (nothing new is created; in a meal or dish the existing item is used) and **«Це інший — назвати «хліб 2»»** (next free number), with the hint «Краще додати марку чи вид — так легше розрізнити». An exact (normalised) duplicate can't be saved without one of the two choices. (Today's `duplicateNameWarning` — "will replace the existing entry" — goes away: with IDs nothing is overwritten by name.)

### Pure, unit-tested pieces
`nextItemId`, `planIdBackfill` (rows + counters → cell writes), `resolveRecipeIds` (recipe names → IDs + unresolved list), `mergeBuiltInsById`, `normalizeItemName`, `suggestFreeName` ("хліб" → "хліб 2"/"хліб 3"), duplicate-ID detection in the structure check. IO stays in the existing `ingredients.ts` / `dishes.ts` / `dailyLog.ts` / `spreadsheetInit.ts`.

### Rollout
Build and test against the dev sheet holding a copy of mom's real sheet: every dish's ingredients must resolve (list any that don't before release); check a meal, a favourite, a rename and a dish edit afterwards. Then release; her sheet upgrades itself silently on first open.

## Label photos, drafts and the 3-day update window (planned 2026-09-27)

> **Status:** 📝 Designed with the developer, not built yet. Changes the "meals are static records" rule — see *3-day update window* below.

**Why:** package print is too small for mom to read, and she prefers entering data on the computer (vision), while taking a photo is easier on the phone. So the phone captures, the computer types — and neither step blocks eating: an item that exists only as a photo can already be logged in a meal.

### Build order
1. **Item IDs** (foundation, invisible) — see below.
2. **Label photo + zoom viewer + Drive storage.**
3. **Drafts** — photo-only items, captured on the phone, completed on the computer, loggable in meals.
4. **3-day update prompt.**
5. **«Прочитати через Google Lens»** — optional text reading of the same photos (Android only).

### 1. Item IDs
Moved into its own release — see **"Item IDs and the sheet upgrade (release 1.6)"** above for the full design. The original notes:
Ingredients, Dishes and DailyLog rows are matched **by name** today (`findIngredientRow`/`findDishRow`; DailyLog stores only `ItemName`). A draft has no name, and a name changes when a draft is completed or renamed — so:
- **Ingredients / Dishes gain an `Id` column** (generated once on creation, never changes; additive column via the structure check). Existing rows get an ID on first read-and-repair. Bundle-only items (never saved to the sheet) use a stable derived ID, e.g. `starter:<nameUk>`.
- **DailyLog gains `ItemId`** — which item a row was logged from (blank for custom entries and for rows logged before this existed; those stay name-only and are never updated by the 3-day window).
- `ItemName` stays in DailyLog as the human-readable snapshot.
- **Duplicate-name check** (developer, 2026-09-27) — part of this step, because today's name-matching would let two items called «хліб» be picked or updated in place of each other. In a hurry she'll type «хліб» for a new bread even though one exists:
  - Wherever an item is named (item editor, draft, quick add from a meal), the name is checked as she types against her items, drafts and the bundled list, **normalised**: case-insensitive, trimmed, repeated spaces collapsed, Latin look-alike letters mapped to Cyrillic (`i`→`і`, `o`→`о`, `a`→`а`, …).
  - On a match, under the field: «Продукт «хліб» уже є» + a card of the existing item (photo thumbnail if any, calories, source) + two buttons: **«Це він — використати наявний»** (nothing is created; the meal uses the existing item) and **«Це інший — назвати «хліб 2»»** (next free number: 2, 3, …). A hint suggests the better option: «Краще додати марку чи вид — так легше розрізнити».
  - An exact (normalised) duplicate can't be saved without one of these choices.
  - Because a number says little later, lists and pickers show each item's photo thumbnail next to its name (step 2), and a numbered draft can be renamed when it's completed — safe once meals point to `ItemId`, not the name.

### 2. Label photo + zoom viewer
- In the item editor: **«Сфотографувати етикетку»** (phone/tablet: camera via the Capacitor Camera plugin / `capture`) or **«Додати фото етикетки»** (computer: file picker). Two photo slots: **«Назва / упаковка»** and **«Таблиця поживності»** — each optional, at least one; retake/remove per slot.
- **The photo stays visible while typing:** next to the fields on tablet/computer, pinned above them on the phone (collapsible). Pinch / double-tap zoom, drag to pan, full-screen button; the zoom and position are kept while she moves between fields, so the nutrition table stays big and in place.
- **Storage: her Google Drive**, folder «Diabetes Tracker / Етикетки», using the **`drive.file`** scope (the app sees only files it created; non-sensitive scope). JPEG downscaled to ~1600 px (~300–500 KB). Offline: kept on the device and uploaded on the next connection. The item row stores the Drive file IDs in a new column (`PhotoIds`, comma-separated, slot-tagged).
- **Source:** an item filled from a photo records `Source = label` and its ⓘ opens the photo — the app's rule that every value shows its source, here with the original evidence attached.
- **To verify before building:** that a Drive file created by the Android app (native OAuth client) is visible to the web app (web OAuth client) under `drive.file` — expected when both clients belong to the same Google Cloud project.

### 3. Drafts
- **What a draft needs: at least a photo *or* a name** (developer, 2026-09-27). Photo-only and name-only drafts are both allowed; an empty draft (ID only) is not — «Зберегти чернетку» stays disabled until there is a photo or a name, because an item with neither can't be recognised later when it's time to fill it in. No values are required.
- **Phone:** «Сфотографувати новий продукт» → the two photo slots (and/or a quickly typed name) → «Зберегти чернетку». A name-only draft can also be started on any device, e.g. the name of something she ate but couldn't photograph. Saved as an Ingredients (or Dishes) row with `Status = draft` (new column), an `Id`, the photos and/or name, and every nutrient field listed in `UnknownFields`.
- **Computer:** Продукти shows **«Чернетки (N)»**, each draft as its photo thumbnail and/or its name. Opening one opens the normal item editor with both photos beside the fields. It becomes a normal item once it has **a name and calories**; anything still blank stays in `UnknownFields` (excluded from totals, as today).
- **Loggable in meals before it's filled** (developer's decision, 2026-09-27 — same idea as a restaurant «Власний запис»: add it for visibility even when the values are unknown). In the meal pickers a draft shows as its thumbnail and/or name + «Чернетка — дані ще не заповнені». The logged row carries `ItemId` and all fields unknown, and the meal/day show the existing clear warning that some values are missing and excluded from totals. Completing the draft later feeds those meals through the 3-day window below.

### 4. 3-day update window
Replaces "a logged meal is a static record forever" with: **DailyLog rows older than 3 days are frozen history; rows from the last 3 days can be updated from their item — but only after asking.** No silent overwrite: an item can change legitimately (a recipe changes, a brand reformulates), and old meals must keep what was true when they were eaten; but values that were missing or plainly wrong can still be corrected where it matters.
- **When it asks:** primarily **when an item is saved in the editor** (she knows why it changed) — e.g. «Цей продукт є у 2 прийомах їжі за останні 3 дні (вчора обід, сьогодні сніданок). Оновити їх: 250 → 230 ккал?» → **[Оновити]** / **[Залишити як було]**. Secondary safety net: a quiet check on the Today screen for changes saved on another device.
- **Two wordings:** *missing values filled in* (draft completed, unknown → known): «Доповнити дані в прийомах їжі?»; *existing values changed*: shows old → new for each affected meal.
- **Hand-edited meals are left alone:** a row is offered only if its stored values still equal what the *previous* version of the item gives for that portion (or were unknown). If she adjusted it in the meal editor, it isn't touched.
- **Dishes built from ingredients:** changing an ingredient makes composed dishes that use it stale, so the same prompt offers «Також використовується у N стравах — перерахувати їх?»; recomputed dishes then flow into the meal check. (Dishes referencing bundle-only ingredients resolve them from the bundle.)
- **Window length** is one constant (`LIVE_LOG_DAYS = 3`), easy to change.
- Custom/restaurant entries (no `ItemId`) and rows logged before `ItemId` existed are never updated.

### 5. «Прочитати через Google Lens» (Android)
- Appears under the label photo once taken. Sends the **same photo** to Google Lens (Android share-to-Lens intent); she selects all text → «Копіювати» → returns; on resume the app offers «Вставити текст з етикетки?» (Capacitor Clipboard) and a parser fills kcal/protein/fat/carbs/sugars/fibre, preferring the "на 100 г" column and leaving a field empty rather than guessing. Every prefilled field is highlighted for her to check against the photo beside it. A plain «Вставити текст» box also works on the computer.
- **Tuning data:** for each Lens use, a small text file next to the photo in Drive holds the Lens text, the parsed values and the values she finally saved; manual fills keep the photo + final values. These become parser unit tests.
- **To check on her phone first:** that Lens opens from the app with the photo, and whether Lens offers «Поділитися» for selected text (if so the app can register as a share target and skip copy/paste).

### Alternative to step 5: AI label reading (explored 2026-10-02, not decided)
Revisit when the label-photo work starts. Instead of the Google Lens copy/paste round trip, the app could send the label photo to an AI model that reads the nutrition table directly and fills the form; she checks each highlighted field against the photo, as above. Options found (Google changes tiers often — re-check limits and prices in Google AI Studio / Cloud pricing when implementing):

| Option | Cost | Privacy | Catches |
|---|---|---|---|
| **Gemini API (Flash), paid tier** on our existing Google Cloud project, through our own `api/` function like translation | Charged from the first request (likely a fraction of a cent per photo — check current price); cap it with a quota / spend cap | Google doesn't use the data | Needs the cap set up like the translation quota |
| **Gemini API, free tier** on a **separate project without billing** (billing is per project: once a project has billing, Gemini there is paid-only, with no free allowance underneath — unlike Translation/Vision, whose monthly free allowance stays with billing) | $0, a few hundred requests a day on Flash models | Google may use inputs to improve products; human reviewers may read them | Label photos are product labels, not personal data, but the privacy policy must say so |
| **Gemini Nano on the phone** (Android ML Kit GenAI Prompt API) | $0, no limit, offline | Nothing leaves the phone | Newer phones only (Pixel 10 yes; mom's model unknown); the custom-prompt API was alpha; no web version; needs native code |
| **Cloud Vision OCR** | 1,000 photos/month free (allowance stays with billing) | Paid-tier terms | Returns raw text only — we'd still parse which number is which (the Lens parser's job) |

**Other places AI could help later:** suggesting the best USDA entry among the candidates for a Ukrainian query (with a one-line reason; values still from USDA); proposing a typical composition for a dish without a recipe, labelled «оцінка», for her to adjust.

**Boundaries (not-a-medical-app rule):** AI reads, matches and suggests — it is **never a source of values** (values stay from the label, USDA or the GI tables, with their sources); no GI from AI, no advice; never send health data (blood sugar, meals) to an AI service — only label photos and food names.

## Daily summary and progress indicators

Today screen shows: running totals vs. Settings targets (carbs, calories), time-until-next-meal-warning, most recent blood sugar reading vs. target range.

## UI/UX: screen structure, navigation

4-tab shell, Ukrainian labels:

- **Сьогодні** (Today) — daily log, quick-add meal, progress vs. targets
- **Продукти** (Foods) — Ingredients + Dishes, search/add/edit
- **Цукор** (Blood Sugar) — log + history
- **Налаштування** (Settings) — targets, meal schedule, Google account

## Deployment and access

- **Web app:** Vercel project from this repo, served at **`https://track-my-meals.roncreator.com`** (Cloudflare CNAME, DNS only). **Unlisted** while in closed testing: `noindex` meta + `robots.txt` disallow, no link from roncreator.com; testers get the direct link. Sign-in still limited to the OAuth test-user list.
- **`api/translate.js`** (since 1.5.2): Google Cloud Translation proxy — POST `{ q, source, target }` (uk/en only, ≤6 texts, ≤200 characters each, ≤800 total), refuses other websites' origins, turns Google's daily-quota error into 429. Local `npm run dev` runs it via a small Vite middleware with `GOOGLE_TRANSLATE_API_KEY` from `.env`; the Android build calls `VITE_TRANSLATE_PROXY_URL` (set, with `VITE_USDA_PROXY_URL`, in the committed `.env.android`, which only `npm run build:android` loads). Tests in `test/api-translate.test.ts` (kept out of `api/`, where Vercel would turn any file into an endpoint).
- **One serverless function, `api/usda.js`:** a USDA FoodData Central search proxy that adds the API key on the server (`USDA_API_KEY`), so the key is in neither the web bundle nor the APK. Same-origin for the web app; the Android build calls it at `VITE_USDA_PROXY_URL` (CORS allows `https://localhost`, Capacitor's WebView origin). Only `query`/`pageSize`/`dataType` are forwarded; responses are edge-cached for a day. `npm run dev` proxies `/api/usda` via `vite.config.ts`.
- **Vercel env vars (web):** `VITE_GOOGLE_CLIENT_ID`, `VITE_SPREADSHEET_ID` (the testers' default sheet), `USDA_API_KEY`. Deliberately **not** set: `VITE_DEFAULT_SPREADSHEET_ID` (mom's sheet) and `VITE_DEV_SPREADSHEET_ID` — Settings hides their buttons when unset, so personal sheet IDs never reach the public bundle.
- Google OAuth web client: `https://track-my-meals.roncreator.com` in Authorized JavaScript origins.
- The landing page and privacy policy live on roncreator.com (separate repo `roncreator-site`).
- Android: Capacitor app from the same code, released through Google Play (internal/closed testing).

## Planned: English version (postponed 2026-09-28)

Deferred by the developer; the decisions are already made:
- **Language choice:** first start follows the device language (Ukrainian if it's Ukrainian, otherwise English); a switch in Settings overrides it and is remembered per device. Mom's devices stay Ukrainian.
- **Spreadsheet readable-names row (row 2):** a new sheet gets names in the app's language at creation; existing sheets keep theirs.
- **Implementation notes:** all UI text is in `src/i18n/uk.ts` (~500 lines, 16 importing files) → an `en.ts` with the same shape plus a small language module. Meal types are stored in the sheet as Ukrainian words (`MEAL_TYPES` in `dailyLog.ts`) — keep them as stored keys and map to English only for display. Built-in foods already carry `nameEn`. Dates use `uk-UA` in `src/lib/dateFormat.ts` → follow the app language. Names people type themselves are never translated.

## Planned: spreadsheet detection + Google Picker (decided 2026-09-29, not built)

**Problem:** the app asks for the broad `spreadsheets` scope (any sheet the user can open, by link/ID) plus `drive.file`. `spreadsheets` is a Google *sensitive* scope — a heavier review for a public launch. On a new browser/device the web version also falls back to the testers' shared sheet (`VITE_SPREADSHEET_ID`), so a new web user would start inside someone else's test sheet.

**Decisions (developer, 2026-09-29):**
- **Auto-detect after sign-in** with the existing `drive.file` scope: list the spreadsheets this app created (its «Track My Meals» Drive folder; new sheets also get an invisible `appProperties` marker so the app can tell its own sheets apart). One found → connect automatically («Знайдено вашу таблицю "…" — підключено»); several → let the user choose; none → «Створити нову» / «Вибрати наявну». «Створити» first warns if one already exists. Google Drive itself is the memory of which sheet is the user's — **no new place to store the sheet ID**, and it works on any device.
- **Connecting an existing sheet the app didn't create** (e.g. mom's, or one shared by someone else) goes through the **Google Picker** — a Google dialog where the user picks the file, which grants `drive.file` access to that one file. Replaces pasting a link (easier for older users). A wider Drive scope (e.g. `drive.readonly`) is **rejected**: it's *restricted* and would need a paid security assessment.
- **Remove the shared test-sheet fallback** from the web build once detection exists.
- **Later, before a public launch:** drop the `spreadsheets` scope entirely (`drive.file` + Picker cover everything) → only non-sensitive scopes. Mom picks her sheet once through the Picker first. Changing scopes means updating the OAuth consent screen's Data Access list and a re-consent for existing users.
- **Web sign-in stays per-session** (token in memory, re-sign-in each session). Persisting it needs a server-side token exchange — only worth it with real user volume. The Android app already stays signed in (refresh token on the device).

**To research before building:** the Picker runs inside a Google page; inside the Android app's WebView there may be no Google session, so on Android it may have to open in the system browser (a small picker page on the web app's domain, returning the file ID to the app via a deep link) — verify that the per-file grant made there applies to the Android OAuth client too (same Cloud project). **Setup the developer does in Google Cloud:** enable the Google Picker API, create a browser API key restricted to the app's origins, note the project number (Picker "App ID").

## Planned: medication log (decided 2026-09-29, not built)

Mom needs to log the medicine she takes alongside blood sugar (e.g. Forxiga, taken situationally when sugar is high). **Start simple, refine with her while she uses it live** (developer's decision).

- **Two new tabs:** `Medications` — her medicines, entered once: Name, usual Dose, Unit, Notes, Active (still taking), DateAdded. `MedicationLog` — each intake: Timestamp (time *taken*, editable, default now), Medication (name), Dose (pre-filled with the usual dose), Unit, Notes. New column labels for the readable-names row: Name, Dose, Unit, Active, Medication.
- **UI:** on the Цукор screen, «Додати ліки» next to «Додати вимірювання»; the day list shows readings and intakes together in time order (e.g. «08:10 · 8,4 ммоль/л», «08:30 · Форксига 10 мг»); a new medicine can be added from the intake form; today's intakes editable like readings.
- **New tabs appear silently:** adding tabs to `REQUIRED_TABS` would make the structure check report them as missing and open the repair dialog on mom's phone after the update. Purely *new* tabs should be created quietly by the app; the dialog stays for real structural problems.
- **Not a medical app:** a plain diary — no dose suggestions, no "you should take…", no interaction warnings. Possible later (ask mom): plain reminders for fixed-schedule medicines.
- **Questions for mom, gathered while she tests it:** which medicines; fixed schedule or as needed for each; does the dose change; would reminders help.
