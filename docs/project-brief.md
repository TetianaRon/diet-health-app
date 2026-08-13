# Project Brief

## Goal

Build a simple, mobile-friendly tool for mom that helps her:

- Track nutrition with awareness of **Type 2 diabetes**, **Stage 3 gastritis**, and **no gallbladder**
- Automatically calculate nutritional parameters per meal
- Plan and time small frequent meals throughout the day
- Log blood sugar readings
- Manage her tendency to snack constantly (weight gain risk)

## User Health Context

| Condition | Impact on the Tool |
|---|---|
| Type 2 diabetes | Track carbs, GI, GL; set daily targets; visual blood sugar log |
| Stage 3 gastritis | Never go more than 2.5–3 hrs without eating; small portions only |
| No gallbladder | Hard fat limit per single meal (not just daily total) |
| Constant snacking | Calorie tracking; meal planning; portion warnings |

## Nutritional Parameters to Track

| Parameter | Why |
|---|---|
| Carbohydrates (g) | Biggest driver of blood sugar spikes |
| Glycemic Index (GI) | Speed of sugar absorption |
| Glycemic Load (GL) | GI × portion — the most practical daily metric |
| Fiber (g) | Slows sugar absorption |
| Sugars (g) | Fast-acting carbs |
| Protein (g) | Stabilizes blood sugar |
| Fat (g) | Critical per-meal limit due to no gallbladder |
| Calories (kcal) | Weight management |
| Sodium (mg) | Cardiovascular health |

## Recommended Architecture

### Component 1 — Google Sheets (database)

Mom's existing file, restructured into clean tabs:

- **Ingredients** — raw foods with nutritional values per 100g
- **Dishes** — mom's custom recipes, auto-calculated from ingredients
- **Daily Log** — every meal entry with time, portion, all calculated values
- **Blood Sugar** — timestamped glucose readings in mmol/L
- **Settings** — daily targets, meal schedule, per-meal fat limit

### Component 2 — Web App (interface)

A single responsive web app, installable on both mobile (Add to Home Screen) and Windows desktop (browser "Install app"). Mom only interacts with this — it reads and writes to Sheets automatically. She never needs to open the spreadsheet directly.

## Platform & Sync

- **One codebase, two install targets:** a Progressive Web App (PWA) built with React + Vite + TypeScript. The same app is installable on mobile (home screen) and Windows (desktop/taskbar via Edge or Chrome) — no separate native or Electron build.
- **Sync across devices:** Google Sheets is the shared database. Every device (phone, desktop, plain browser) reads and writes the same spreadsheet via the Sheets API using the signed-in Google account, so data is automatically in sync — no separate sync layer needed.
- **Offline:** the PWA service worker caches the app shell so it opens without a network connection; reading/writing data still requires connectivity since Sheets is the source of truth. Full offline data entry is a possible future iteration, not part of the initial build.
- **Nutrition data is bundled-first, API-fallback:** a curated starter set of ~150–200 common Ukrainian staple foods (plus a static Glycemic Index reference table — no free API provides GI) ships in the Ingredients tab from day one. Only genuinely new foods trigger a live lookup.
- **Hosting:** Vercel — serves the static PWA (no serverless proxy needed for nutrition lookup, see Technical Decisions).

## Technical Decisions

- **UI language:** Ukrainian
- **Backend search language:** English (more reliable nutritional data)
- **Platform:** Installable PWA — works in the browser and installs to home screen (mobile) or desktop (Windows)
- **Database:** Google Sheets (familiar to mom, already in use; also doubles as the cross-device sync layer)
- **Nutritional lookup:** bundled starter dataset (common foods + GI table) first; [USDA FoodData Central](https://fdc.nal.usda.gov/) (free, no cost) for anything not in the bundle. Claude API dropped from the required path — it costs money per lookup and USDA covers whole/home-cooked foods well, which is most of mom's diet. May revisit Claude later as an optional fallback for obscure/homemade dishes.
- **Language compatibility:** USDA is English-only, but the UI is Ukrainian-only, and mom doesn't speak English. She only ever types a Ukrainian food name; `NameEn` (used for the API query) is resolved automatically — from the bundle when it's a known food, or via a free translation API (MyMemory, no key needed) when it's not. She's never asked to supply, see, or understand an English name.
- **Blood sugar units:** mmol/L (Canada/Ukraine standard)
- **New product validation:** App suggests (from bundle or USDA) → mom approves → saved to Ingredients tab

## Default Health Targets (to be confirmed with mom)

| Parameter | Default |
|---|---|
| Daily carbs | 130–150g |
| Fat per meal | max 15–20g |
| Daily calories | 1400–1600 kcal |
| Meals per day | 5–6 |
| Max gap between meals | 2.5–3 hours |
| Blood sugar target | 4.0–7.8 mmol/L |

## Open Questions

See [Requirements — Open Questions](requirements-open-questions.md) for the full list pending from mom's interview.
