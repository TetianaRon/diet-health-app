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

*Removed in 1.7 (developer, 2026-10-04):* the former Blood Sugar screen let mom expand a reading to see the meals eaten before it. With the day's meals, sugar and medicine on one Today screen (and yesterday's summarised at the bottom), that expander is no longer needed.

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

> **Status:** ✅ Built in release 1.6 (2026-10-04) as described below — see `docs/build-log.md` for the implementation notes. Comes **before** the verified food database (1.7) and mom's data import (1.8).

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

### Column migrations — when a released column changes meaning (added in 1.7, developer, 2026-10-05)
Additive upgrades can't carry data over when a column's meaning changes (first case: Weight `Timestamp` → `Date`, one record per day). A manual fix isn't acceptable for a public app, so `src/lib/columnMigrations.ts` declares migrations — `{ tab, from, to, convert }` — and the silent upgrade, right after adding the new column, **fills the new column's empty cells by converting the old column's values**. The old column stays exactly as it was (the app just stops reading it); filled cells are never overwritten; the one-time note says «Стовпець «Дата» заповнено зі стовпця «Час»». Pure, unit-tested.

**Row rewrites keep other columns:** when the app rewrites a row (edits), columns it doesn't manage — an old migrated column, or a column the user added — are sent as `null`, which the Sheets API skips, so those cells stay as they are (`buildRow`, fixed 2026-10-05 after an edit wiped the old Weight `Timestamp` cell).

**Rule for every release from now on:** a change to the sheet is either **additive** (new tab/column/settings key) or ships **with a column migration**. Columns are never removed or rewritten automatically; anything needing that goes to the structure dialog for a person.

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

## App notifications (release 1.6, 2026-10-04)

One standard for app-level messages (`src/context/NotificationsContext.tsx`, `src/screens/Toaster.tsx`, `src/screens/AppNotifications.tsx`):
- **One queue, never overlapping:** a column of toasts, bottom-right on a computer (≥1000 px), full width just above the tab bar on a phone; at most 3 visible, the rest wait in order. One notice per key (showing a key again replaces it).
- **Info** (e.g. «Таблицю оновлено…»): closes by itself after 8 s, paused while «Детальніше» is open; ✕ closes earlier.
- **Action** (e.g. «Вхід у Google завершився — Увійти знову», «Таблицю потрібно виправити — Переглянути»): stays until acted on or closed; closing = "later" and it returns at the next check (sign-in, sheet switch, app start). A notice whose problem blocks the app with no other way out (expired sign-in) has **no ✕**.
- `AppNotifications` is the only place that decides which app-level notices exist; new ones are added there.
- **Not in the queue:** messages tied to one spot — form errors, the search's translation notice, Today's reminder-access notice — stay where they are.
- A notification centre (bell + history) was considered and left out for now (one user; info notices are of passing interest and action ones stay visible) — can be added on top of the same queue.

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

Three tabs, Ukrainian labels (since 1.7, see "Daily records and the new Today"):

- **Сьогодні** (Today): the day's meals, progress against targets, weight, blood sugar and medicine
- **Історія** (History): past days, read-only
- **Страви** (Dishes and Products): search, add, edit and delete
- **Налаштування** (Settings) opens from the gear: targets, meal schedule, the connected spreadsheet, the Google account

### UI conventions

- **Questions and confirmations open as a dialog** (`.modal-backdrop` / `.modal`, `role="alertdialog"`), never inline below a button. A button at the end of a long form or in a pinned footer would leave an inline question off-screen on a phone.
- **Buttons name their outcome** («Так, видалити «…»», «Продовжити редагування»); no bare "OK" or "Disagree".
- **Numbers use a decimal comma:** every displayed number goes through `formatDecimal`, including inside `uk.ts` strings.
- **Every UI string is in `src/i18n/uk.ts`.**

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

## Connecting a spreadsheet (release 1.7.1, designed 2026-10-04)

**Settings** shows only the connected sheet — «Підключена таблиця: <its title>» as a link that opens it, a copy-link icon — and **«Підключити іншу таблицю»**. With nothing connected: «Таблицю ще не підключено» + **«Підключити таблицю»**. Signed out: a hint to sign in. The structure status/repair lines stay under it.

**The «Підключити таблицю» window** (`ConnectSheetDialog`), top to bottom; a sheet appears once, in the first section it belongs to, and the connected one is left out (`connectOptions()` in `src/lib/sheetConnections.ts`, unit-tested):
1. **Знайдено на вашому Google Диску** — spreadsheets the app can see with the `drive.file` scope, i.e. the ones it created (or was given), newest change first (`listAppSpreadsheets()`, Drive `files.list`). Looked up again each time the window opens. A sheet made by hand isn't found here — that's what the sections below are for.
2. **Нова таблиця** — name + «Створити й підключити» (in the «Track My Meals» Drive folder, with all tabs). If setting up the new file fails, the device stays on its previous sheet.
3. **Раніше підключені на цьому пристрої** — kept **only on the device** (`localStorage` `trackmymeals.recentSheets`, newest first, max 10), never on a server. Each with ✕ «прибрати зі списку» (the sheet itself isn't touched). Devices connected before 1.7.1 get their current sheet added on the first check.
4. **Інші доступні вам таблиці** — the sheets built into the app (`VITE_DEFAULT_SPREADSHEET_ID` mom's, `VITE_SPREADSHEET_ID` testers', `VITE_DEV_SPREADSHEET_ID` dev, optional comma list `VITE_KNOWN_SPREADSHEET_IDS`). **Shown only if the signed-in account can open them** (`getSpreadsheetTitle()` tries to read each title; no access → hidden). So mom sees her sheet, the developer sees all, anyone else sees none — **access decides, no emails in the app** (developer's choice, 2026-10-04). **Rule:** these sheets must be shared with specific people, never "anyone with the link" — their IDs are in the public app code, so a link-shared one would be listed for any signed-in user.
5. **За посиланням** — paste a link/ID; the app checks it can open it first («Не вдалося відкрити цю таблицю…» otherwise).

**No build-time fallback any more:** a device that never connected a sheet has none (`getSpreadsheetId()` → ""), instead of landing in the testers' shared sheet. Sheet requests then fail with `NoSpreadsheetError` («Таблицю не підключено…»), the structure check is skipped, and an action notice «Таблицю ще не підключено…» offers **«Підключити таблицю»** (opens the window). Detection **proposes**, it never connects on its own (developer, 2026-10-04 — changes the 2026-09-29 "one found → connect automatically" idea below).

**Connecting** (`connectSpreadsheet()` in `SheetHealthContext`): saves the ID on the device, puts it at the top of the recent list, runs the structure check / silent upgrade, and remounts the screens so they read the new sheet.

## Planned: spreadsheet detection + Google Picker (decided 2026-09-29, not built)

*Update 2026-10-04:* detection, the recent list and removing the test-sheet fallback were built in **1.7.1** (section above). Still planned here: the Google Picker (replacing the paste-a-link fallback), the `appProperties` marker, and dropping the `spreadsheets` scope.

**Problem:** the app asks for the broad `spreadsheets` scope (any sheet the user can open, by link/ID) plus `drive.file`. `spreadsheets` is a Google *sensitive* scope — a heavier review for a public launch. On a new browser/device the web version also falls back to the testers' shared sheet (`VITE_SPREADSHEET_ID`), so a new web user would start inside someone else's test sheet.

**Decisions (developer, 2026-09-29):**
- **Auto-detect after sign-in** with the existing `drive.file` scope: list the spreadsheets this app created (its «Track My Meals» Drive folder; new sheets also get an invisible `appProperties` marker so the app can tell its own sheets apart). One found → connect automatically («Знайдено вашу таблицю "…" — підключено»); several → let the user choose; none → «Створити нову» / «Вибрати наявну». «Створити» first warns if one already exists. Google Drive itself is the memory of which sheet is the user's — **no new place to store the sheet ID**, and it works on any device.
- **Connecting an existing sheet the app didn't create** (e.g. mom's, or one shared by someone else) goes through the **Google Picker** — a Google dialog where the user picks the file, which grants `drive.file` access to that one file. Replaces pasting a link (easier for older users). A wider Drive scope (e.g. `drive.readonly`) is **rejected**: it's *restricted* and would need a paid security assessment.
- **Remove the shared test-sheet fallback** from the web build once detection exists.
- **Later, before a public launch:** drop the `spreadsheets` scope entirely (`drive.file` + Picker cover everything) → only non-sensitive scopes. Mom picks her sheet once through the Picker first. Changing scopes means updating the OAuth consent screen's Data Access list and a re-consent for existing users.
- **Web sign-in stays per-session** (token in memory, re-sign-in each session). Persisting it needs a server-side token exchange — only worth it with real user volume. The Android app already stays signed in (refresh token on the device).

**To research before building:** the Picker runs inside a Google page; inside the Android app's WebView there may be no Google session, so on Android it may have to open in the system browser (a small picker page on the web app's domain, returning the file ID to the app via a deep link) — verify that the per-file grant made there applies to the Android OAuth client too (same Cloud project). **Setup the developer does in Google Cloud:** enable the Google Picker API, create a browser API key restricted to the app's origins, note the project number (Picker "App ID").

## Verified food database (release 1.8, designed 2026-10-04)

**One file, `src/data/verified-foods.json`,** replaces `starter-foods.ts` / `starter-dishes.ts` as the source of the app's built-in items and, later, of the public data pages on roncreator.com. Types and the validator: `src/data/verifiedFoods.ts`; `verifiedFoods.test.ts` runs the validator over the real file, so **the test suite refuses any entry that breaks a rule**.

**File structure:**
- `sources` — registry of datasets (name, edition/version, full citation, URL). Entries refer to a key here, so a citation is written once. Today: `usda-sr-legacy`, `gi-2021-st1`, `gi-2021-st2`, `gi-2008`, `calculation` (our own arithmetic; its description says what was computed from which entries).
- `categories` — every entry belongs to one (Крупи та макарони, Хліб, Молочні продукти, М'ясо і птиця, Риба, Яйця, Бобові, Овочі, Гриби, Фрукти та ягоди, Горіхи, Олії та жири, Напої), so the database can be offered as **sets** (local-first, roadmap 2.1).
- `entries` — one per food in one state:
  - `id` — the permanent `B` ID (never changed or reused; a replaced entry stays as `status: "retired"` with `replacedBy`).
  - `family` + `state` — what the food is across states (`buckwheat`: `dry` and `boiled`); states: raw, dry, boiled, baked, fried, steamed, canned, dried, fermented, processed, brewed (coffee).
  - `variant` (optional) — a type within the family **whose GI differs** (developer, 2026-10-05, from the rice review: one entry per type, e.g. family `rice`: long-grain white, basmati, parboiled, jasmine, round-grain, brown). When USDA has no entry for the type, its nutrients come from the closest one (medium reliability, reason stated) — the GI is still worth having.
  - `nameUk`, `nameEn` — proper names, stating what the values assume (fat %, cooked without salt…).
  - **`nutrients`** — values per 100 g (kcal, carbs, fibre, sugars, protein, fat, sodium), `unknown` for fields the source lacks (held as 0, excluded from totals), `source` (dataset + entry ID + the dataset's own description), `reliability`, `reason` (Ukrainian + English), `verified` date.
  - **`gi`** — `status`: `measured` (a GI table value, with its source), `conventional` (no measurable GI — too little carbohydrate to test — a conventional value labelled «умовне» so the carbs still count in GL), `notApplicable` (value null, «не застосовується», GL 0 — at most 1 g carbohydrate per 100 g: meat, fish, oils, butter; or, like black coffee, up to 2 g with no sugars at all, where USDA's carbohydrate "by difference" isn't sugar or starch), or `unknown` (value null, GL not counted, «немає даних»); plus its own `reliability`, `reason`, `verified`.

**Verification is per part:** nutrients and GI each carry their own source, reliability and date; nothing is called "verified" as a whole, and an entry may be incomplete (GI unknown).

**Sources and choices (developer, 2026-10-04):**
- **Nutrients:** USDA FoodData Central (SR Legacy; Foundation where it is the better match), raw and cooked forms where USDA has both. **Cooked forms: the "without salt" entries** — salt depends on her cooking; the unsalted entry describes the food itself.
- **The 12 cooked dishes** use USDA's **measured cooked entries** (no more raw values ÷ an unrecorded yield factor); the yield calculation stays only as a cross-check. Semolina porridge: USDA's unsalted farina porridge (#171659) — farina is the same soft-wheat крупа as манка (developer's choice, 2026-10-05). Corn porridge: yellow corn grits, dry #171670 / cooked #171672 — кукурудзяна крупа is grits, not cornmeal (developer, 2026-10-05). No stand-in foods.
- **Cautious GI — the upper quartile** (developer, 2026-10-05): when an entry combines several measurements (the range comes from type, variety, brand, ripeness or cooking details the entry can't specify), its GI is the **upper quartile** of those measurements — ¾ are at or below it — not the mean and not the maximum (one extreme study can't drive it). Only the most reliable tier counts: Table 1 (ISO) before Table 2, so a higher value from a weaker study never wins. The note gives the range and the mean. Wording: "upper estimate", never "safer".
- **Nutrients and GI can match differently** (developer, 2026-10-05): when the GI fits a food exactly but the nutrients come from a looser match (or the reverse), the entry is still added, each part labelled by its own reliability — e.g. durum-wheat pasta (GI exact, nutrients from USDA's general pasta entry, low). Packaged foods carry their own nutrients; the database's job there is the GI (see 1.9: suggesting GI for the user's items).
- **GI from the table's own summary rows first** (developer's review, 2026-10-05): where the 2021 table gives its own mean for exactly our food ("Boiled potato, mean of 29 studies — 73"), its covered entries are the ones used (upper quartile, with the authors' mean in the note; a row is linked to the N entries right before it, and its mean is re-computed as a check); a summary row is checked against the entries it covers before use (e.g. "Non-fat yoghurts" are sweetened flavoured yoghurts, so plain yoghurt keeps its own entry). Otherwise the matching entry, or the mean of the listed entries.
- **GI: the 2021 international tables** (Atkinson et al., *Am J Clin Nutr* 2021) as the main source — Supplemental Table 1 (ISO method) can rate higher, Supplemental Table 2 (less robust methods) lower, with the reason. The 2008 tables only where a food isn't in 2021, named as such.
- **Low-carb vegetables:** conventional GI 15, «умовне», with the reason.
- **Reliability:** high = an exact match from a well-replicated source (a table mean, a direct USDA analysis); medium = a single study, a close variant, or sources that disagree; low = an old/small study, a loose match, or our own calculation. The reason always says which and why.
- **Wording:** values are "from the cited source"; no claim about what is good for anyone (see the not-a-medical-app rules).

**App side — decisions (developer, 2026-10-05):**
- **Saved copies of built-in items** (`BasedOn = B…`) that still hold the *old* built-in values (she didn't change them) get a one-time notice «Для N продуктів є уточнені значення» with the list and «Оновити копії (N)» / «Залишити як є». Copies she edited are never offered or touched.
- **Built-in cooked foods** (гречка варена, рис варений…) appear **among products, as defaults** for when the precise values aren't known; «Страви» are the user's own composed dishes (raw pack values + cooking, where her water and weights decide the result). A dish's GI already follows from its ingredients (carb-weighted), so a GI on the raw product is enough.
- **Unknown GI in a dish — the small-share rule** (developer, 2026-10-05, for any product): ingredients with an unknown GI are left out of the dish GI average (their stored 0 is not a GI), and the dish GI still counts while they bring **at most 5% of the dish's carbohydrate** (`SMALL_UNKNOWN_GI_SHARE`) — e.g. garlic in soup. The composer says what share was left out. Above 5% the dish GI is unknown, as before.
- **Types** (rice, potato, banana…) are shown as a **flat list** with descriptive names in 1.8; grouping by family comes with the 1.9 search.

**Steps:** (1) format + guard test ✅; (2) data — 69 built-in items grown to 96 entries through the review (rice, oats, potato, rye bread, banana, pear types; durum pasta; mashed potatoes; kefir 2.5%) ✅; (3) review page — the developer decided per entry with buttons that name the outcome; all 96 accepted on 2026-10-05 ✅; (4) app: read the file, ⓘ per value, «неперевірено» on the user's own items, offer to update saved copies of built-in items ✅ (2026-10-05; `data/builtInFoods.ts`, `lib/builtInStatus.ts`, `screens/VerifiedInfoDialog.tsx`, `screens/CopyUpdateOffer.tsx`; old built-ins frozen in `data/legacyBuiltIns.ts` for name matching and the update offer).

## Search and GI suggestions (release 1.9, designed 2026-10-05)

Only what works the same wherever her data lives — the database is bundled in the app; sets come with local-first (roadmap 2.1).

**Matching** (`src/lib/foodSearch.ts`, pure, unit-tested) — one function behind every search: the Продукти/Страви lists, the add-product form, the meal picker and the dish composer.
- Text is normalised (lower case, apostrophes and punctuation dropped, «ё»→«е»); words match by **word start** (a query word matches a name word that starts with it, or that it starts with, from 4 letters — so «гречки» finds «Гречка», «макаронні» finds «Макарони»).
- **Everyday synonyms per food family** (`FAMILY_SYNONYMS`): e.g. спагетті / паста / вермішель → pasta; геркулес / вівсянка → oats; манка → semolina; перловка → pearl barley; пшонка → millet; мамалига / полента → corn grits; творог → cottage cheese. A synonym counts like a word of the name.
- **Ranking:** all query words matched first, then more matched words, then a match at the name's start; database entries before her own items at equal score, types of one family kept together. Nothing is hidden: a word that matches nothing just ranks lower.

**GI suggestions for her own items** (developer, 2026-10-05):
- In the add-product and edit-product forms, while the GI field is empty — or holds a GI without a source — the form shows up to 3 closest database matches for the name: «У базі: Гречка (ядриця), суха — ГІ 50 (після варіння), середня надійність ⓘ» with a button per match **«Взяти ГІ 50 з бази»**. Only the GI is taken; her nutrients (e.g. from the pack) stay as they are. Matches whose GI is «не застосовується» or unknown aren't offered.
- **Where her GI came from is stored:** a new Ingredients column **`GiFrom`** (readable name «ГІ з бази») holds the database ID; added silently by the sheet upgrade (additive). Typing a GI by hand, or clearing it, empties `GiFrom`.
- **Display:** her product keeps «неперевірено» for its nutrients, and gets **ⓘ for the GI** («ГІ з бази: …» — the entry's GI part: value, reliability, reason, source, date). A dish made from it gets its GI from the ingredients as before (carb-weighted).
- Not a medical claim: the suggestion is "the database's GI for a similar food", with its reliability and the database entry's own note (e.g. «після варіння» for dry products).

**Deleting her products and dishes** (developer, 2026-10-05 — there was no way to delete at all): «Видалити продукт» / «Видалити страву» under the edit form of her saved items (built-in products can't be deleted; deleting her copy of one brings the database version back). The row is **removed** from the sheet (`deleteSheetRow`, a `deleteDimension` request) — the confirmation says the app can't bring it back, only Google Sheets' version history. Past meals keep their own values. **A product used in her dishes isn't deleted:** the app lists those dishes with a «Редагувати «…»» button each, which opens that dish's editor (`dishesUsingIngredient`; a recipe line pointing at a built-in ID doesn't count for her copy of it). Both questions — the confirmation and the used-in-dishes list — open as a **dialog**, not below the button: the button is at the end of a long form, so anything under it was off-screen on a phone (same lesson as hotfix 1.8.1).

## Daily records and the new Today (release 1.7, designed 2026-10-04)

> **Status:** 📝 Designed with the developer, not built. Mom asked for medicine and weight logging as soon as possible; the developer added the UX update (one daily surface). Supersedes "Planned: medication log" (2026-09-29), whose decisions are kept below.

### Navigation
Three tabs: **Сьогодні | Історія | Страви**; Settings stays on the gear. The separate Цукор screen goes (its content moves into Сьогодні and Історія).

### Сьогодні — one surface for entering and reading the day
Blocks, top to bottom:
1. **Daily status** — calories bar, GL bar and the other limits switched on in Settings (as today).
2. **Weight bar** — latest weight with its trend: «Вага: 72,4 кг · на 0,6 кг менше за середнє за 30 днів (73,0 кг)» + «+ Вага», or a pencil (edit) icon once today has a weight (one per day). The 30-day average smooths day-to-day water swings, so the comparison shows the direction. With **fewer than 3 measurements** in the last 30 days it compares with the previous measurement instead («на 0,2 кг менше, ніж 3 дні тому»). **Neutral styling** — no green/red: the app doesn't judge whether up or down is good.
3. **Records** — blood sugar and medicine in **one timeline** («07:10 · Цукор 6,2 ммоль/л (натщесерце)», «07:30 · Форксига 10 мг»), one «+ Додати» button (the form starts with a Цукор / Ліки choice), a pencil (edit) icon on today's entries — edit buttons across Today are pencil icons with the wording as tooltip/screen-reader label. **Yesterday's last medicine** shown small and read-only («Учора 21:30 · Форксига 10 мг») — it affects today's sugar.
4. **Meals** — today's meals as now (editable). **Yesterday's meals** as a compact, read-only list of **all** of yesterday's meals, each with its time and totals (e.g. «20:30 · Вечеря · 520 ккал · ГН 18»), smaller than today's (developer, 2026-10-04) — they show how meals relate to the next morning's sugar.

**Order switch** «Спочатку нові» / «Спочатку старі» — a **toggle on the screen itself**, affecting only that screen (Сьогодні and Історія each have their own): default newest first, so yesterday's entries sit at the **bottom** of their blocks; oldest first moves them to the top (chronological). A viewing preference, not data: **saved on the device** (app/browser storage), never written to the sheet (developer, 2026-10-04).

### Історія — read-only
Per day, newest first (or oldest first with its own order toggle): daily totals, sugar readings, medicine, weight, meals. No editing. Last 14 days + «Показати ще». The current "recent days" section on Today moves here.

### Страви
Today's Продукти screen with the tabs swapped: **dishes** first, **products** second.

### Medicine (decisions kept from 2026-09-29)
- **Tabs:** `Medications` — her medicines, entered once: Id, Name, Dose (usual), Unit, Notes, Active, DateAdded. `MedicationLog` — each intake: Timestamp (time *taken*, editable, default now), MedicationId, Medication (name snapshot), Dose (pre-filled with the usual dose), Unit, Notes.
- **Intake form:** pick from her list; a new medicine can be added right there; dose pre-filled and changeable; today's intakes editable like readings.
- **Not a medical app:** a plain diary — no dose suggestions, no "you should take…", no interaction warnings. Possible later (ask mom while she uses it): plain reminders for fixed-schedule medicines.

### Weight
- **Tab** `Weight`: **Date**, WeightKg, Notes — **one record per day, no time** (developer, 2026-10-05); saving for a day that already has one updates it. The date is written as text (`'2026-10-05`) so Sheets doesn't turn it into a locale-formatted date; a date typed in the sheet by hand («05.10.2026») is read too. Decimal input with either separator.

### Sheet
`Medications`, `MedicationLog`, `Weight` join the required tabs and are created **silently** by the 1.6 upgrade (missing tab = additive), mentioned in the one-time upgrade note. New readable labels for their columns.

### Tests
On the developer's devices, the emulator and a Ukrainian-locale test sheet — never relying on mom's phone.


## Local-first app (2.0, sets in 2.1; designed 2026-10-05)

> **Status:** 📝 Designed with the developer 2026-10-05; proof passed the same day; not built. Roadmap → 2.0 and 2.1.

### Goals
1. **Instant and offline:** every screen reads from the device. No read-limit errors (429), and no waiting for Google.
2. **The phone works without Google:** a fully local Android app (no sign-in), with a backup the user controls. The web version always signs in.
3. **Sync across devices** through the user's own Google Sheet, which stays readable and editable as a spreadsheet.
4. **Sets and a clean start:** the verified database is offered as sets, and everything a user adds becomes their own row.
5. **Mom moves over without losing anything,** in small releases, each shippable on its own.

### Today, for comparison
Every screen reads its tabs from Sheets (Today and History read them in one `batchGet`, the others per tab). There's a read cache for offline display, but writes go straight to the sheet and fail offline. Row identity:
- **IDs already:** Ingredients and Dishes (`I…`/`D…`, 1.6), Medications (`Id`).
- **No row ID:** DailyLog rows (`MealId` groups a meal; there's no ID per row), BloodSugar, MedicationLog and Weight (one per date).

### Architecture
- **A local database on each device is the source of truth for the screens.** Since checkpoint A it holds a copy of each tab (rows as the sheet has them), read through the existing per-tab modules. Checkpoint B adds record-level bookkeeping, using these fields per record:
  - `id`: permanent; new prefixes for records that lack one, e.g. `L…` log row, `S…` sugar, `T…` medicine taken, `W…` weight;
  - `updatedAt`: an ISO timestamp from the device that made the change;
  - `deleted`: a deletion marker.
- **Storage: SQLite on every platform** (developer, 2026-10-05), chosen as the most long-term option. Real SQL suits multi-year charts and reports, it's robust and transactional, and the database is one portable file. One SQL schema serves both platforms:
  - native SQLite on Android (Capacitor SQLite plugin);
  - SQLite compiled to WebAssembly in the browser, persisted in the browser's private file storage (OPFS) or IndexedDB.

  **Proof passed (2026-10-05, branch `spike/sqlite-web`, not merged):** `@sqlite.org/sqlite-wasm` 3.53.4 in a dedicated worker, with the OPFS "SAH pool" storage, which needs **no COOP/COEP headers**, so Google sign-in popups keep working.
  - **Tested:** Chrome and Edge on Windows, Firefox (the developer's check), Chrome on the Pixel 10, and **the app's own WebView** (a debug build).
  - **Data survives:** reloads everywhere; on Android also a full app stop and an app update.
  - **Timings on the Pixel:** opening 0.15–0.34 s, writing 3,000 rows in one transaction 0.13–0.4 s, a monthly report 3–22 ms.
  - **The same WebAssembly build runs inside the Android app,** so there's one implementation everywhere and no native SQLite plugin.
  - **Limits found:**
    - only one tab can hold the database: a second tab needs a takeover notice («Застосунок відкрито в іншій вкладці» / «Відкрити тут»);
    - browsers don't grant persistent storage unasked, which doesn't matter because the web copy is disposable;
    - the database reserves about 6 MB.

  Screens never touch the database directly; they go through the per-tab modules, so the engine stays replaceable.
- **Screens only read and write the local database.** A sync module is the only code that talks to Sheets.

### Sync with the Google Sheet
- **When:**
  - at app start;
  - on returning to the app after more than 5 minutes;
  - a few seconds after local changes (debounced);
  - from a «Синхронізувати» button that shows the last sync time.
- **Cost:** each sync is about 3 requests (one `batchGet` of all tabs; one `batchUpdate` for changed rows; appends for new rows), far under the limits.
- **Sheet layout stays as it is:** row 1 keys, row 2 readable names. New columns `Id` (on tabs without one) and `UpdatedAt` are added by the silent upgrade.
- **Merge, row by row, by `id`:**
  - only on the device → push it;
  - only in the sheet → pull it;
  - in both → the newer `updatedAt` wins (last writer wins, per row).

  This suits mostly-append data: meals, readings, weight. Settings merge per key.
- **Saving (checkpoint B):** every save is a change on the device: the fields written (only those that differ), their previous values, and the time. Screens see the device copy with pending changes on top. New products, dishes and medicines get counter-free IDs (`I…`/`D…`/`M…` + time code) like the log rows.
- **The decision per field at sync:** written unless the field also changed elsewhere since the save's previous value; a newer UpdatedAt elsewhere (another device, later) wins; a change without an UpdatedAt change (a hand edit) wins.
- **Backup copies** (`backups.ts`): registered on the device, and moved to Drive's trash after 14 days of working sync, with a note. The same mechanism serves any future safety copy.
- **Edits made by hand in the sheet are supported** (developer, 2026-10-05). The app remembers a fingerprint of each row as last synced. A row whose content changed in the sheet without a new `UpdatedAt` counts as an edit made at sync time. Rows typed in by hand without an `Id` get one.
- **Deletions** (developer, 2026-10-05): the row is removed from the sheet, and its ID goes to a small «Видалені» tab (id, tab, time) so other devices delete it too. The sheet stays clean to read.
- **The sheet update on first open** (build 20): one notice, «Оновлюємо таблицю для нової версії застосунку…», replaced by the result «Таблицю оновлено…» (or by «Таблицю потрібно виправити» if it can't run). Screens' ordinary reads wait for the check (`structureGate.ts`, at most 30 s), so they never show a structure error for something the check is fixing.
- **Clock differences between devices** only matter when the same row is edited on two devices between syncs. For a single person's data that's rare, so it's accepted.

### Without Google: the Android app only (developer, 2026-10-05)
- **Android:** first run offers «Почати без Google» or «Підключити Google Таблицю». A Google sheet can be connected later; the first sync then uploads everything.
- **The web version requires Google sign-in.** Using the browser without Google isn't a real use case. On the web, the local database is a **copy of the user's sheet for one session, plus a queue of changes waiting to sync**. The sheet is the source of truth there.
- **The web keeps no copy between sessions** (developer, 2026-10-06; someone else may use the same browser). The sign-in lives in memory only, so a page load is a new session.
  - Each page load, before its first database opens, every stored sheet copy is cleared (`forgetCopies` in the worker). Only changes not yet in the sheet stay, for up to 14 days, and they're read only after sign-in. Small markers such as "backup done" stay too.
  - Within a session the copy is used fully (no requests while browsing). One sync right after sign-in loads every tab at once.
  - «Вийти» syncs first, then clears the copy.
  - Closing the tab with changes not yet in the sheet shows the browser's own "leave site?" message.
  - The connected sheet and recent-sheets list belong to one Google account (Drive's opaque permission ID; no email or name is stored). When another account signs in, they're forgotten before any screen shows them.
  - If sign-in ever survives a reload, the clearing moves to the start of a session.
- **Android keeps its copy between sessions** (the phone is personal). Opened without a connection, it stays signed in on the device copy (the stored refresh token can't be exchanged offline). The first request once online gets a fresh access token; a refresh token Google refuses ends the session.
- **No backup file** (developer, 2026-10-06): the app's own storage is enough. An .xlsx backup was built in checkpoint C and removed.
- **Joining Google later** (developer's redesign, 2026-10-06): «Синхронізувати з Google Таблицею» signs in and opens the usual connect window. A new sheet or an existing one gets the phone's data (`localAttach.ts`): the phone's records become ordinary pending changes for that sheet, and the normal sync uploads them (IDs are unique per device). A new sheet also gets the phone's Settings; an existing one keeps its own.
  - Duplicates: same-name products, dishes and medicines (normalised names), and a weight on a day the sheet already has. «Знайдено однакові записи» asks for each: keep the sheet's (the phone's records that used it point to the sheet's item), keep the phone's (the sheet's item takes the phone's values), or keep both under names she sets, which must differ. Meals, sugar readings and medicine taken are events, never duplicates. Unknown values read «невідомо». The texts say «цей пристрій», not «телефон» (developer, 2026-10-06: the same screens can run on other devices).
  - «Скасувати — залишитися без Google» uploads nothing. After a successful join, the phone's own copy is cleared, so starting without Google again begins empty.

### Sets and the clean start
- The verified database stays bundled in the app (works offline). Later, updates come from a static file on the roncreator site, the same file the public pages are built from.
- **New data starts empty.** The app offers sets by category (Крупи, Овочі, Молочні…), and later from Продукти as well. Adding a set or a single item creates the user's own rows linked to the database (`BasedOn = B…`). The 1.8 update offer generalises to all such rows.
- **Moving mom over:** built-in items she has used (in meals or recipes) become her rows automatically; everything else is offered as sets. Nothing she sees today disappears.

### Releases
0. ✅ **Proof: SQLite in the browser and the app's WebView** (2026-10-05, see Storage).
1. **2.0, one release** (developer, 2026-10-05), built in three internal checkpoints: **A** reading from the device (row IDs, one sheet upgrade adding `Id`, `UpdatedAt` and «Видалені»); **B** offline saving and full sync; **C** Android without Google. **Safeguards:** an automatic sheet copy before the first sync, and a week on Play's internal testing track before production.
2. **2.1 — Sets + clean start + moving mom over.** Then 2.2 (mom's data, verified) as sets plus her own rows.

**Free/paid** is decided separately, before the public launch. Nothing above depends on it: sync, USDA search and label reading are separable features that can be switched on or off later.
