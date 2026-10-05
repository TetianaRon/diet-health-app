# Changing the verified food database

**When:** adding, correcting or restructuring entries in `src/data/verified-foods.json`. The developer must review every change before it ships.

The tooling is `tools/verified-db/` (pipeline in its README). The format and the guard test are in `src/data/verifiedFoods.ts` and `docs/technical-spec.md` → "Verified food database".

## Data rules

**Entries**
- One entry per food per state, with a permanent `B####` ID that is never reused. A replaced entry stays as `status: "retired"` with `replacedBy`.
- `category`, `family`, `state` and an optional `variant`. A variant is a type whose GI differs (rice types, potato hot/cooled, banana ripeness).
- Add raw and cooked forms wherever the source has both.
- Names state what the values assume: fat %, «без солі», «з сіллю», ripeness.
- No substitute analogies: never let one food stand in for a different one. If nothing genuinely matches, don't add the entry.
- Each part carries its own `source`, `reliability` (high / medium / low), `reason` in Ukrainian and English, and `verified` date. The reason is written for a public reader.
- No medical-claim wording.

**Nutrients**
- Use USDA FoodData Central SR Legacy, fetched by entry ID. Cooked forms are "without salt" unless the name says otherwise.
- A calculation (e.g. kefir 2.5% from 1%) is the dataset `calculation`, with low reliability and the method in the description.

**GI**
- **Source:** the 2021 international GI tables. Prefer the table's own summary row where one covers exactly this food.
- **Combining several measurements:** the upper quartile, from the most reliable tier only (Table 1 before Table 2). The reason states the count, range and mean.
- **Status by carbohydrate:**
  - `notApplicable`: at most 1 g carbohydrate per 100 g, or up to 2 g with no sugars (black coffee);
  - `conventional` 15: low-carb vegetables, dairy and eggs;
  - `unknown`: when there is no study.
- **Dry grains, pasta and legumes** carry the GI of their cooked form; the app labels it «після варіння».

## Steps

1. Change the item definitions or overrides in `tools/verified-db/build_verified.py`. New entries carry their own `ver` date.
2. Run `python tools/verified-db/build_verified.py`. Read the warnings in `build-report.txt` and check that no other entry changed unexpectedly by diffing against the committed JSON.
3. Run `npx vitest run src/data/verifiedFoods.test.ts`, then the full test suite.
4. Run `python tools/verified-db/build_review.py`. In `build_review.py`, give each changed entry a `CHANGES` text and a `changedAt` time (the publish time), so that only entries changed since their last decision reopen. Republish `review.html` to the review page https://claude.ai/artifact/Qv3xCH1UDqGwhxWeo8hFw4.
5. The developer reviews. Their decisions and comments are in the page's storage (`decisions/<id>`, `questions/<id>`); read them, answer each comment, and repeat from step 1 until every changed entry is accepted.
6. **Sweep:** after a structural or source change, update every reason text, spec section, roadmap line and review question that describes the old state (standing rule 8).
7. Record the round in `docs/build-log.md`, then ship with the release (`dha-task-release.md`).

## In the app

- Database values show ⓘ, which opens their sources. Values the user entered or changed show «неперевірено».
- The user's own "I checked the GI" checkbox (`GiVerified`) is their judgement, separate from the database's reliability label. Never merge the two.
