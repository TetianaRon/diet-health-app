# Technical Spec

> **Status:** 🟡 First draft — architecture decided, exact targets/food lists pending mom's interview

The architecture below doesn't depend on mom's interview answers (those only tune numbers and food lists — see [requirements-open-questions.md](requirements-open-questions.md)), so it's safe to build against now.

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

### Dishes
Anything requiring preparation — from a single cooked ingredient (e.g. "Гречка варена") to a real multi-ingredient recipe (e.g. borscht) — auto-computed from Ingredients, never hand-typed. This is the counterpart to Ingredients being *always raw*: a food that changes meaningfully when cooked (grains/legumes absorbing several times their dry weight in water) belongs here, not as a separate "cooked" Ingredients row. Values are **per 100g of the finished/cooked product**, matching Ingredients' per-100g convention — mom logs a dish by portion grams exactly like an ingredient.

| Column | Notes |
|---|---|
| DishName | Ukrainian, shown to mom |
| IngredientsJson | `[{nameUk, grams}]` — raw ingredient names (must match an Ingredients row) and the raw grams used |
| YieldGrams | Total finished weight after cooking (e.g. 100g dry buckwheat → ~360g cooked). This is what makes per-100g values correct — cooking water adds mass but no calories |
| Carbs_g … Sodium_mg | Computed: `Σ(ingredient_nutrient_per_100g × grams_used / 100) / YieldGrams × 100` |
| GI | Computed as a **carb-contribution-weighted average** of the ingredients' GI (`Σ(carb_contribution_i × GI_i) / Σ(carb_contribution_i)`) — an approximation, not a lab-measured value (true GI isn't simply additive), but the standard practical simplification when no GI database entry exists for the exact prepared dish. For a single-ingredient dish this reduces to that ingredient's own GI. |
| DateAdded | ISO date |

Implemented in `src/lib/dishes.ts` (`computeDishNutrition`, pure and unit-tested).

### DailyLog
Every meal entry.

| Column | Notes |
|---|---|
| Timestamp | |
| MealType | Сніданок / Обід / Вечеря / Перекус |
| ItemName | ingredient or dish name |
| PortionGrams | |
| Carbs_g … Sodium_mg | computed for the portion |
| GL | computed: `GI × Carbs_g / 100` |
| Notes | |

### BloodSugar
| Column | Notes |
|---|---|
| Timestamp | |
| ValueMmolL | |
| Context | fasting / after-meal / other |
| Notes | |

### Settings
Key/value rows, pre-filled with Project Brief defaults; mom's interview tunes the values, not the schema.

| Key | Default |
|---|---|
| DailyCarbsTarget | 130–150 (g) |
| FatPerMealLimit | 15–20 (g) |
| DailyCaloriesTarget | 1400–1600 |
| MealsPerDay | 5–6 |
| MaxGapHours | 2.5–3 |
| BloodSugarMin | 4.0 |
| BloodSugarMax | 7.8 |

## Google Sheets API integration

Client-side only — no custom backend for data storage. Uses Google Identity Services (OAuth) so the app acts as the signed-in user (mom or the developer), reading/writing her own spreadsheet.

**One-time setup (manual, in Google Cloud Console — done by the project owner, not by Claude):**

1. Create a Google Cloud project.
2. Enable the **Google Sheets API**.
3. Configure the **OAuth consent screen** — External, in Testing mode; add both Google accounts (mom's and the developer's) as **test users** (avoids the app-verification process needed for a two-person app).
4. Create an **OAuth Client ID** (type: Web application), with the app's dev/prod URLs as authorized origins.
5. Copy the Client ID into `.env` as `VITE_GOOGLE_CLIENT_ID`.
6. Create the spreadsheet (or reuse mom's existing one, restructured into the tabs above) and copy its ID into `.env` as `VITE_SPREADSHEET_ID`.

`src/lib/sheets.ts` wraps: `initGoogleAuth()`, `signIn()`, `signOut()`, `readRange(tab, range)`, `writeRange(tab, range, values)` — thin wrappers over the Sheets REST API using the OAuth access token.

## Nutrition lookup: bundled data + USDA FoodData Central

Lookup order, implemented in `src/lib/nutrition.ts`:

1. **Bundled starter dataset** (`src/data/starter-foods.ts`) — 60 common Ukrainian/Eastern European staples (grains, dairy, common proteins, vegetables, fruits), each with both `nameUk`/`nameEn` and full nutrient values including GI. Curated once, shipped with the app, not fetched at runtime. Covers the large majority of mom's actual day-to-day foods (per the health context, her diet leans toward simple home-cooked staples, not a huge rotating variety).
2. **Static GI reference table** (`src/data/gi-table.ts`) — since no free API provides Glycemic Index at all (it comes from academic studies, not nutrition labels), GI is always looked up locally, never fetched. Covers the same foods as the starter dataset, plus any commonly-needed extras.
3. **Translation** (`translateUkToEn` in `src/lib/nutrition.ts`) — only when a food isn't in the bundle. Mom only ever *types* a Ukrainian name (she's never asked to supply or understand English — confirmed necessary after live testing showed she doesn't speak English); it's translated via [MyMemory](https://mymemory.translated.net/) (free, no API key) before querying USDA. The resolved English name is displayed afterward as a subtle secondary line next to the Ukrainian name wherever foods are listed — not something she needs to read, but a visible fallback in case a detail the numbers depend on (fat %, cut, etc.) didn't make it into the Ukrainian name.
4. **USDA FoodData Central API** — queried with the translated name. Free, no cost, requires a free API key (`api.data.gov`, no card needed) stored as `VITE_USDA_API_KEY`. Returns carbs/protein/fat/fiber/sugar/calories/sodium per 100g (no GI — falls back to a manual GI entry).
5. **Manual entry** — always available regardless of the above, if nothing is found anywhere (translation unavailable, or USDA has no match); mom or the developer can type values in directly (`Source = manual`).

Only USDA FoodData Central is wired up initially — Open Food Facts (better for packaged/branded goods via barcode) was considered but deferred since mom's diet is mostly whole/home-cooked foods; add it later only if real usage shows gaps.

Flow: mom types a Ukrainian name → checked against the bundle first → if not found, translated to English and queried against USDA → show the estimate (GI filled from the static table if available, else flagged for manual entry) → mom approves → app writes the row to the Ingredients tab.

## Glycemic Load calculation

```
GL = (GI × Carbs_g_in_portion) / 100
```
Implemented as a pure function in `src/lib/health.ts`.

## Per-meal fat limit logic

Compare a meal's total `Fat_g` against `Settings.FatPerMealLimit`; warn (not block) when exceeded, since the limit exists due to no gallbladder.

## Meal timing logic

Track time since the last logged meal; warn when approaching `Settings.MaxGapHours` (gastritis requires eating every 2.5–3 hrs).

## New product validation flow

App suggests (bundle match or USDA lookup) → mom reviews the estimate → mom approves → row saved to Ingredients with `Source = starter`/`usda`/`manual` as appropriate. Never auto-saves without approval.

## Daily summary and progress indicators

Today screen shows: running totals vs. Settings targets (carbs, calories), time-until-next-meal-warning, most recent blood sugar reading vs. target range.

## UI/UX: screen structure, navigation

4-tab shell, Ukrainian labels:

- **Сьогодні** (Today) — daily log, quick-add meal, progress vs. targets
- **Продукти** (Foods) — Ingredients + Dishes, search/add/edit
- **Цукор** (Blood Sugar) — log + history
- **Налаштування** (Settings) — targets, meal schedule, Google account

## Deployment and access

- Hosted on Vercel as a static PWA — no serverless functions needed now that nutrition lookup doesn't require hiding a paid API key.
- Mom opens the same URL in her phone browser and installs it to her home screen; on Windows, the developer (or mom) installs it from the browser's "Install app" menu.
- No app store, no separate installer.
