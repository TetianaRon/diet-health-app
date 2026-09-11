# Requirements — Open Questions

All questions to clarify with mom before development begins. To be filled after the interview.

> **Status:** ✅ Interview completed 2026-09-07 — see Mom's Answers below. A few items still open (marked below and in Open Questions).

## Medical Details

- [x] Does she have doctor-prescribed daily carb or calorie limits? — 1800 kcal/day, no specific carb-gram number
- [x] How many meals per day does her doctor recommend? — minimum 6 (3 main + 3 snacks)
- [x] What is her target blood sugar range (fasting / post-meal)? — fasting 6.2, post-meal 7.4 mmol/L
- [x] Are there any other health conditions we haven't accounted for? — gastritis stage confirmed as **2** (`CLAUDE.md`/docs corrected 2026-09-07); also has fatty liver (hepatic steatosis) and elevated cholesterol
- [x] Does she take any medications that interact with food (e.g. metformin)? — Forxiga (dapagliflozin), taken situationally when blood sugar is elevated, not meal-linked
- [x] What is her specific fat limit per meal (gallbladder)? — no specific gram limit, just general avoidance of fatty food

## Eating Habits

- [x] How many times a day does she currently eat? — 3 main meals fixed, snacks currently chaotic (pain-triggered)
- [ ] What are her 10–20 most commonly eaten foods or ingredients? — got recurring dishes, not a full ingredient list; may need a follow-up pass
- [x] Does she cook the same dishes regularly? Which ones? — omelets, stewed chicken, porridges (buckwheat/bulgur/pea), soups, salads/vegetables
- [x] What does she snack on between meals? — kefir/riazhanka+bread, mashed cottage cheese/feta, fruit, berries
- [x] Are there any foods she definitely avoids (allergies, intolerances)? — fatty fried, sugary, high-GI, sour/pickled/marinated, spicy
- [x] Does she already keep a food journal? What format? — none currently; previously a Google Sheet (link in Mom's Answers)

## Daily Schedule

- [x] What time does she usually wake up? — 6:30 AM
- [x] What time does she go to sleep? — midnight
- [x] Are her mealtimes fixed or flexible? — fixed (9:00 / 14:00 / 18:30), snacks currently unstructured
- [x] Does she leave the house during the day? (affects phone/food access) — mostly stays home, leg pain limits walks

## Tech Comfort

- [x] What phone does she use (Android / iPhone)? — Android
- [x] Is she comfortable opening links in the browser? — yes when needed, but prefers computer/tablet
- [ ] Would she want to save the app to her home screen? — not asked
- [x] Does she already use Google Sheets on her phone? — no, computer only
- [x] How large should buttons and text be? — large/vision-friendly (has vision problems)

## Goals & Preferences

- [x] What does she find most annoying about tracking food manually now? — having to go to a computer every time to log and manually calculate
- [x] What would be the single most useful feature for her? — auto-calculated nutrition from just a dish name + weight
- [x] Would she like reminders when it's time to eat? — yes
- [x] Any other wishes or ideas? — overall must be easy/convenient to use

## Mom's Answers

> Interview conducted 2026-09-07.

**DAILY ROUTINE**
Wakes at 6:30 AM, sleeps at midnight (~6.5 hrs — she says that's enough, doesn't want more). Spends most time at home — long walks are hard due to leg pain. Fixed meal schedule: breakfast 9:00, lunch 14:00, dinner 18:30.

**EATING HABITS**
Doctor recommends a minimum of 6 meals/day (3 main + 3 snacks). Snacks are currently chaotic, triggered by stomach pain — she wants to fix this. Typical pain-triggered snacks: kefir/riazhanka with bread, mashed cottage cheese/feta, fruit, berries. Regularly cooks: omelets, stewed chicken, porridges (buckwheat, bulgur, peas), sometimes soups, salads/vegetables (a daily staple). Avoids: fatty fried food, anything with sugar, high-GI foods, sour/pickled/marinated food, spicy food.

**MEDICAL DETAILS**
Type 2 diabetes, gastritis **stage 2** (confirmed 2026-09-07 — `CLAUDE.md`/`project-brief.md`/`README.md` corrected from the earlier "stage 3"). Also has **fatty liver (hepatic steatosis)** and **elevated cholesterol** — both reinforce the existing fat-avoidance guidance rather than adding a new numeric constraint; no separate limit given for either. No gallbladder; no specific fat-gram limit, just general avoidance of fatty food. Calorie limit: **1800 kcal/day** (app Settings default now updated to match — see 2026-09-07 build-log entry). No specific carb-gram target. Blood sugar targets: fasting 6.2, post-meal 7.4 mmol/L. Medication: Forxiga (dapagliflozin), taken situationally when blood sugar is elevated, not on a fixed meal-linked schedule. Important stated need: she wants to independently set/adjust *all* targets herself (calories, carbs, GI/glycemic load, blood sugar range, etc.) since these are individual and may change per doctor's guidance — already supported by the existing Settings screen, should be double-checked it covers all these fields.

**CURRENT TRACKING**
Tracks nothing currently. Previously used a Google Sheet (link provided: `docs.google.com/spreadsheets/d/1dz_wPjkqjhwUmrIp1ByU-2078A9YkpsPtBkRIsGe3xM` — worth reviewing later for real food/dish data to expand the starter bundle). Stopped because it required going to the computer every time to log food and manually calculate all nutrition parameters.

**TECH COMFORT**
Android phone. Can use the phone browser when needed but prefers computer or tablet due to vision problems — text and buttons should be large/vision-friendly. Does not use Google Sheets from her phone, only from computer — confirms she will only ever interact with data through the app itself, never the raw sheet.

**WISHES & PRIORITIES**
Top priority: enter a dish name and weight, have everything else calculated automatically — already the app's core design. Wants a reminder/notification when it's time to eat. Overall requirement: it must be easy and convenient to use.

**Follow-up 2026-09-07** (after the initial interview, same day): confirmed gastritis stage 2; disclosed two additional conditions — fatty liver (hepatic steatosis) and elevated cholesterol. Asked for the 1800 kcal/day default to actually be set in the app. Two new wishes: (1) track body-weight-over-time statistics, (2) track blood-sugar-over-time statistics. Longer-term wish: correlate blood sugar readings against what she ate, to identify which specific foods to avoid — she suggested this would need fasting *and* post-meal readings logged around each relevant meal (the Blood Sugar screen's existing `Context` field already distinguishes fasting/after-meal/other, so the raw data model already supports this; the correlation/analysis view itself doesn't exist yet).

**OPEN QUESTIONS**
- Her old Google Sheet (link above) hasn't been reviewed yet — may hold useful real food/dish data.
- Medication is situational, not meal-linked — whether the app needs any medication-logging feature was not discussed.
- ~~Meal-time reminder~~ — **built, 2026-09-10** (Capacitor Android wrapper, Local Notifications from a cached last-meal timestamp, quiet hours). Design + build history in `docs/build-log.md`'s 2026-09-09/09-10 entries. No longer an open question.
- Weight-tracking: no `Weight` tab/schema exists yet — needs a new sheet tab, data-access layer, and a place in the UI (Settings? a new small section on Today or its own screen?).
- Blood-sugar statistics: the Blood Sugar screen currently shows a plain history list, not trends/charts — "statistics" likely means a simple chart (e.g. daily/weekly trend line), not designed yet.
- ~~Food-vs-blood-sugar correlation~~ — **rescoped, designed, and built.** Deliberately cut down from a real analytics feature to a manual-review one, per the developer/mom's own suggestion: a "meals before this reading" expandable list on the Blood Sugar screen (pure timestamp lookup, no correlation logic, `mealsBeforeTimestamp()` in `src/lib/dailyLog.ts`) plus a manual watch/avoid flag on both Ingredients and Dishes (`GlycemicFlag`). Live in `BloodSugarScreen.tsx`. Design history in `docs/build-log.md`'s 2026-09-07 entry. No longer an open question.
