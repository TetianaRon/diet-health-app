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

### Component 2 — Claude Web App (interface)

Opens in the phone browser. Mom only interacts with this — it reads and writes to Sheets automatically. She never needs to open the spreadsheet directly.

## Technical Decisions

- **UI language:** Ukrainian
- **Backend search language:** English (more reliable nutritional data)
- **Platform:** Web app, opens in phone browser (no install required)
- **Database:** Google Sheets (familiar to mom, already in use)
- **Nutritional lookup:** Claude API with web search
- **Blood sugar units:** mmol/L (Canada/Ukraine standard)
- **New product validation:** App suggests → mom approves → saved to Ingredients tab

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
