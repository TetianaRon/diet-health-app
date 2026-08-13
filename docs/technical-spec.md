# Technical Spec

> **Status:** 🟡 First draft — architecture decided, exact targets/food lists pending mom's interview

The architecture below doesn't depend on mom's interview answers (those only tune numbers and food lists — see [requirements-open-questions.md](requirements-open-questions.md)), so it's safe to build against now.

## Architecture

```
┌─────────────────────────────┐
│   PWA (React + Vite + TS)   │  installable on mobile + Windows desktop
│   src/lib/sheets.ts  ───────┼──► Google Sheets API v4 (user's own OAuth token)
│   src/lib/claude.ts  ───────┼──► /api/lookup-food (serverless proxy)
└─────────────────────────────┘                │
                                                ▼
                                  Anthropic API (server-side key only)
```

- Single codebase serves phone browser, "Add to Home Screen" (mobile), and "Install app" (Windows desktop) — same PWA, no separate native build.
- Google Sheets is both the database and the sync layer: any signed-in device reads/writes the same spreadsheet.
- The Anthropic API key never ships to the browser — it lives only in the serverless function's environment.

## Google Sheets structure

Spreadsheet ID stored in `VITE_SPREADSHEET_ID`. Tabs:

### Ingredients
Raw foods, values per 100g.

| Column | Notes |
|---|---|
| NameUk | Ukrainian name (shown to mom) |
| NameEn | English name (used for AI lookup consistency) |
| Carbs_g | |
| GI | Glycemic Index |
| Fiber_g | |
| Sugars_g | |
| Protein_g | |
| Fat_g | |
| Calories_kcal | |
| Sodium_mg | |
| Source | `manual` or `ai` |
| DateAdded | ISO date |

### Dishes
Mom's recipes, auto-totaled from Ingredients.

| Column | Notes |
|---|---|
| DishName | |
| IngredientsJson | `[{name, grams}]` |
| Servings | |
| Carbs_g … Sodium_mg | computed totals, same columns as Ingredients |

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

## Claude API integration (nutrition lookup)

- Frontend calls `POST /api/lookup-food { nameEn: string }` (`src/lib/claude.ts`).
- The serverless function (`api/lookup-food.ts`) calls the Anthropic API with web search server-side, using `ANTHROPIC_API_KEY` (never exposed to the client), and returns a structured nutrient estimate (per 100g, matching the Ingredients columns).
- Flow: mom searches a food → not found locally → app calls the proxy → shows the AI estimate → mom approves → app writes the row to the Ingredients tab (`Source = ai`).

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

App suggests (via Claude lookup) → mom reviews the estimate → mom approves → row saved to Ingredients with `Source = ai`. Never auto-saves without approval.

## Daily summary and progress indicators

Today screen shows: running totals vs. Settings targets (carbs, calories), time-until-next-meal-warning, most recent blood sugar reading vs. target range.

## UI/UX: screen structure, navigation

4-tab shell, Ukrainian labels:

- **Сьогодні** (Today) — daily log, quick-add meal, progress vs. targets
- **Продукти** (Foods) — Ingredients + Dishes, search/add/edit
- **Цукор** (Blood Sugar) — log + history
- **Налаштування** (Settings) — targets, meal schedule, Google account

## Deployment and access

- Hosted on Vercel (static PWA + `api/` serverless functions in one deploy).
- Mom opens the same URL in her phone browser and installs it to her home screen; on Windows, the developer (or mom) installs it from the browser's "Install app" menu.
- No app store, no separate installer.
