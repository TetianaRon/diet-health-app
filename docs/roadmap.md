# Roadmap

The planner for Track My Meals / Трекер Харчування and the roncreator.com site. **This file decides what gets built and when.** The *design* of each feature lives in [technical-spec.md](technical-spec.md); the history of what was done lives in [build-log.md](build-log.md).

## How we work

The workflow (intake → release branch → verify → release) and the standing rules are in [../CLAUDE.md](../CLAUDE.md); step-by-step procedures are in [tasks/](tasks/).

**Statuses:** 📝 planned · 🔨 in progress · 👀 in review / testing · ✅ released · ⏸ on hold.

---

## Next session — start here (set 2026-10-07)
1. **2.0 released** to Play's internal testing track and the web (2026-10-06, builds 19–23). Nothing is public; mom is an internal tester, so **an upload is a release to her**. Still worth checking on the developer's devices: the `online` event on a real phone, two tabs, switching sheets.
2. **Plan reviewed with the developer (2026-10-07):** 2.0.1 → 2.0.2 faster food entry → 2.0.3 reminders → 2.0.4 sign-in choices (+ privacy policy) → 2.1 one product list → 2.1.1 millilitres → 2.1.2 drinks you mix + status bar → 2.1.3 reminders you choose → 2.1.4 yesterday's and the last records → 2.2 sets (+ favourites) → 2.3 mom's data → 2.3.2 meal entry → 2.4 Picker → 2.5 food families → 2.6 label photos → 2.7 GI from ingredients (after the research) → 2.8 AI lookup → 2.9 English → 3.0 public launch.
3. **2.0.1 released** (2026-10-07, versionCode 24). **2.0.2 released** (2026-10-08, versionCode 25). **2.0.3 released** (2026-10-08, versionCode 26); still to do: check mom's notification volume and tone. **2.0.4 released** (2026-10-08, versionCode 27, with the privacy policy update on roncreator.com). **2.1 released** (2026-10-08, build 29, versionCode 29; build 28 failed to merge a sheet with a «Sheet1» tab, nothing written). Mom's sheet merges on her first open; check in the morning that her phone has build 29 and her data loads. **2.1.1 released** (2026-10-08, versionCode 30). Intake placed (2026-10-09). **2.1.2 released** (2026-10-09, versionCode 31). **2.1.3 released** (2026-10-09, versionCode 32). **2.1.4 released** (2026-10-09, versionCode 33, with the «Ліки» tab). **2.2 released** (2026-10-09, versionCode 34); check that mom's move ran (her used database items in her Продукти, the notice). **2.2.1 released** (2026-10-09, versionCode 35). **2.3 released** (2026-10-10, versionCode 36: her items in the database). **2.3.1 released** (2026-10-10, versionCode 37). **To do:** once mom's phone has 2.3.1, the developer runs the import on her sheet (`?import`, `mom-import.json`). Next: **2.3.2 — meal entry, one editor**, then 2.4 — Google Picker.
4. Chromium issue 569300356: reply sent 2026-10-05 — check for answers now and then.
5. Plugin issue [capacitor-local-notifications#15](https://github.com/ionic-team/capacitor-local-notifications/issues/15) (reminders lost during a restart; reported 2026-10-08, our patch in `patches/`): check for answers now and then; drop the patch once a fixed version ships.

## Current and upcoming releases

### 2.0.1 — Pack values: per [n] g and per [n] pieces · ✅ released (2026-10-07, web + Play internal testing) — spec → "Pack values"
Packs list nutrients per portion (per 30 g) or per piece (dumplings per 12), not always per 100 g. Values are entered exactly as printed.
- **Item editor (products and dishes):** two separate parts (developer, 2026-10-07). «Значення вказано на»: grams or pieces and the amount, as the pack says it (на 100 г, на 30 г, на 12 шт.). «Вага штук» (optional): any weighed count, e.g. 12 home-cooked dumplings = 300 г, which works for database products too (her copy is saved). A dish's yield is a weight, a count («Вийшло 10 млинців») or both. The form shows what will be stored.
- **Stored:** grams-main items stay per 100 g as today (every value except GI recalculated). Pieces-main items store values per 1 piece. New columns `Basis`, `ValuesPer`, `WeighedPieces`, `WeighedGrams` (Ingredients), `Basis`, `YieldPieces` (Dishes), `PortionPieces` (DailyLog) arrive through the silent upgrade; the sync, the duplicates review and the database search learn them.
- **Meal editor:** grams and pieces are linked. Type one and the app fills in the other when a piece weight is known (210 г → 12,6 шт.). Counts allow decimals (7,5). Without a piece weight only the main field shows; a pieces-main entry's weight is unknown, never 0.
- **Maths:** every nutrient, GI and GL work without weight. GL = GI × grams of carbs eaten; a dish's GI is already weighted by carbs; a dish needs only its ingredients' total nutrients and its yield. A pieces-main product goes into a recipe by count.
- **Checks against:** dumplings (pack per 12 шт.), potato dumplings from the database with 12 шт. = 300 г weighed at home, pancakes (dish yield as a count), nuts (per 100 г with 20 шт. = 100 г, logged as 3 горіхи), a 30 г portion pack.

### 2.0.2 — Faster food entry · ✅ released (2026-10-08, web + Play internal testing) — spec → "Faster food entry (2.0.2)"
**Built:** everything below, plus «Вага штук» for dishes (weigh a few pieces instead of counting the batch) and the «+ − × ÷» keys under a focused value field (the phone's number keyboard has neither × nor ÷). Database: 18 nuts and seeds (B0099–B0116), sizes on 39 entries; review accepted, nut GI 24 kept at low reliability.
- **Named portion sizes:** up to 3 approximate sizes per product or dish, each a label and grams («скибка ~45 г», «маленьке / середнє / велике яблуко», «чашка ~250 г»); default labels маленька / середня / велика, renamable. The meal editor offers them as one tap plus a count (2 × середнє); grams shown as approximate («≈»). **The verified database ships typical sizes** for common foods, each with a source, reliability, reasoning and date (rule 5; USDA lists portion weights, e.g. "1 medium apple"); her own sizes override or add to them.
- **Common nuts in the verified database:** almonds, pistachios, hazelnuts, cashews, peanuts, pecans, Brazil nuts, pine nuts, sunflower and pumpkin seeds, walnuts; **roasted, unsalted and salted** where sources allow (salted pistachios carry far more sodium); Brazil nuts and pine nuts dried; walnuts raw and roasted with salt. Each with the typical weight of one nut («1 мигдалина ≈ 1,2 г»), logged by count (mom eats a few at a time).
- **Save a custom meal entry to «Страви»** («Зберегти в мої страви»): a fixed-value dish (values per portion, weight optional).
- **Maths in value fields:** `200*3/4` or «200 ккал * 3/4», to log part of a meal box. Numbers, `+ − * / ( )`, a decimal comma, unit words ignored; the field shows the result, and the result is stored.

### 2.0.3 — Reminders · ✅ released (2026-10-08, web + Play internal testing) — spec → "Meal-time reminder" → "Follow-ups and restarts"
**Decided (developer, 2026-10-08):** 2 follow-ups at +30 and +60 min; no re-fire on opening; vibration plus the usual notification sound.
- **Follow-ups:** the reminder + 1–2 follow-ups (e.g. +30 and +60 min), cancelled by logging a meal, none in quiet hours, all scheduled ahead so they survive a restart. Open: how many / how far apart; keep or drop the re-fire on opening.
- **Missed during a phone restart:** `@capacitor/local-notifications` 8.3.1's restore receiver drops a one-shot whose time passed while the phone was off. Patch it (patch-package): one due after the last boot started counts as missed and shows 15 s after boot; report upstream.
- **Easy to miss:** a new channel with vibration on (a channel's sound and vibration can't change after creation), maybe a more noticeable sound; check mom's notification volume.
- **Two permission asks feel like one failed:** one short explanation screen, then both permissions one after the other; the notice only if exact alarms are still off (since 2.0 build 22 the app never opens the alarm settings by itself).

### 2.0.4 — Sign-in choices · ✅ released (2026-10-08, web + Play internal testing) — spec → "Sign-in choices (2.0.4)"
**Decided (developer, 2026-10-08):** remember on by default in the app, off on the web; «Продовжити як» shows the email; on Android with remember off, closing the app ends the session.
The person decides where their data lives, with plain wording about each choice.
- **«Запам'ятати мене на цьому пристрої»** at sign-in. On: the device keeps its copy of the sheet until «Вийти». Off: sign in every time, and the copy is cleared when the session ends (the web's behaviour today).
- **Web:** one tap «Продовжити як …» on each visit (Google skips the password while the person is signed in to Google in that browser); no long-lived pass is stored (developer: works for now). **Android:** already remembered; this adds the choice not to.
- **Without Google (Android):** before starting, an acknowledgement that the data lives only on that phone and anyone with access to it can read it, with a button naming the outcome.
- Also ends the dev server's sign-in on every reload.
- **The privacy policy update ships with it** (roncreator.com).

### 2.1 — One product list · ✅ released (2026-10-08, build 29; web + Play internal testing) — spec → "One product list (2.1)"
- **One item model:** values typed or composed by recipe; labels (інгредієнт, страва, напій, соус/заправка, перекус) for filtering only.
- **Dishes inside dishes:** any item can be a recipe line (homemade mayonnaise in a salad), with no loops and changes carried upward.
- **One «Продукти» tab** with filter chips; one editor («Значення: вказані / за рецептом»).
- **One sheet tab, `Products`** (developer, 2026-10-08): IDs never change; an automatic merge on the first open of 2.1, with the sheet copy first and a notice; the old tabs kept as «Інгредієнти (архів)» and «Страви (архів)».

### 2.1.1 — Millilitres · ✅ released (2026-10-08, web + Play internal testing) — spec → "One product list (2.1)" → "Millilitres"
- A third basis, «на 100 мл» (or «на 250 мл» as a label gives it), for her own items; logging in ml (a `PortionMl` meal-log column, so a drink without a known density keeps its amount); recipe lines in ml.
- An optional density «100 мл = 103 г» linking ml and grams. **Database densities for drinks** (milk, kefir, coffee; USDA household measures, with source and reliability) go through **2.2.1's review round**.

### 2.1.2 — Drinks you mix, and the status bar · ✅ released (2026-10-09, web + Play internal testing)
- **Composed items in millilitres** (2026-10-08, developer): mixed drinks are composed — airan (yogurt, sparkling water, mustard and salt), smoothies, homemade dressings, soups by the ladle. A yield in ml («Вийшло, мл») beside the weight and the count; values per 100 ml when that's the main yield; the optional «мл = г» density; then ml sizes and logging follow (2.1.1's maths).
- **Content shows through the Android status bar** (2026-10-08): when a list scrolls, rows pass under the clock and battery icons; the safe-area fix (1.5) padded the content but left the bar transparent. A solid bar behind the status bar on Android.

### 2.1.3 — Reminders you choose · ✅ released (2026-10-09, web + Play internal testing)
Today the reminders notice («Застосунок може нагадувати…», `ReminderAccessNotice`) sits in Today's main body: long, not dismissable, and there's no way to say "no reminders" — they're simply on once allowed.
- **A reminders toggle in Settings** («Нагадування про їжу»): turning it on asks for the missing phone permissions (notifications, then «Будильники й нагадування»); turning it off cancels the scheduled reminders. The setting is kept per device, like «Запам'ятати мене».
- **An offer instead of the notice:** after the first sign-in, a popup in the same style as the other notices offers to turn reminders on, with buttons naming the outcome (e.g. «Увімкнути нагадування» / «Не зараз»). Dismissed, it says reminders can always be turned on in Settings, and it never appears again. The notice leaves Today's body.
- **On, but a permission is missing** (e.g. revoked later in the phone's settings): not a silent note — a popup when the app opens, saying reminders can't arrive without the permission, with two choices: «Дозволити нагадування» (asks for what's missing) / «Вимкнути нагадування» (turns the toggle off). Settings also shows the toggle as on with the missing permission named. (Developer, 2026-10-09.)
- **Mom and anyone with reminders already allowed:** the toggle starts on and the offer is skipped. (Developer, 2026-10-09.)

### 2.1.4 — Yesterday's and the last records on Today · ✅ released (2026-10-09, web + Play internal testing)
Mom asked to see the medicine she took last, not only yesterday's. Today's «Цукор і ліки» shows only yesterday's last medicine intake (small, read-only; `lastIntakeOfDay`), so after a day without one she sees nothing.
- **All of yesterday's records:** every blood sugar reading and medicine intake from yesterday, compact and read-only, like yesterday's meals.
- **And the last one:** the most recent medicine intake and the most recent sugar reading, with their date, when they're older than yesterday (today's and yesterday's are already shown).
- **A «Ліки» tab** (developer, 2026-10-09), like Продукти: her medicines with a pencil, «+ Додати ліки», and «Приймаю зараз» — so a stopped medicine can leave «Востаннє» (before, that flag was only in the sheet). A first version; the developer will redesign it later.
- Decided (developer, 2026-10-09): the last one **per medicine**; yesterday's records in their own «Учора» group, like the meals; the older ones under «Востаннє».

### 2.2 — Sets, clean start, moving mom over · ✅ released (2026-10-09, web + Play internal testing)
The verified database offered as sets; new data starts empty; built-in items she used become her rows; the generalised update offer.
- **Favourites, redesigned** (2026-10-08, developer, from Intake): only typed items have the ☆ (composed ones don't — a gap the one list makes visible), and there's no way to see favourites (no «Улюблені» filter or list; they only sort first). Redesign them with the list changes here: a ☆ for every item, an «Улюблені» filter.
- **The base ingredients set moves to 2.2.1** · ✅ released 2026-10-09, web + Play internal testing (17 entries, densities for 8 liquids, «Для випічки») (developer, 2026-10-08): kinds of flour, sugars, starches, seeds, oils — new database entries through the review page; for recipes, and needed by 2.7. The same round adds densities for the database's drinks (2.1.1).

### 2.3 — Mom's data, verified · ✅ released (database part, 2026-10-10, web + Play internal testing); her rows → 2.3.1
Her import comes **after local-first (2.0) and sets (2.2)**, as sets plus her own rows, so it's built once (developer chose this over an earlier import into the bundled database, 2026-10-05). The release number stays; it ships after local-first.
Spec rules: memory of the import decisions (2026-09-29) + the review page.
- **Database content:** every item of hers with a genuine match (~90, incl. olives black + green, trout + salmon, beef/pork heart raw + boiled, cocoa), under proper names — **plus the raw/cooked partner** of each wherever the source has both.
- **Ingredients her dishes likely need** — estimated from each dish, added to the database so she can compose them later. **Her dishes themselves are not recalculated:** her value is kept and the dish is flagged «потрібно скласти рецепт».
- **Her own sheet:** branded packaging items (her values) and values we couldn't verify (kept as she has them, marked «неперевірено»); her dishes with the flag. **Not added:** items without a genuine match and the dropped ones (кукурудза варена, гірчиця американська, тунець, fructose sweets, calculation leftovers).
- **Decided at the start (developer, 2026-10-09):**
  - **Split:** 2.3 is the database round (her ~60 verified items not yet in the database, plus raw/cooked partners, through the review page); **2.3.1** brings her own rows into her sheet.
  - **The import (2.3.1) is a developer tool, not a feature:** hidden, opened only by a special link in the web app; the developer runs it on her own computer with mom's sheet connected (her account can edit it) — mom does nothing. It reads a file we build (kept local, never in the repo), shows a preview with outcome buttons (new rows; rows she already has — «Залишити її запис» / «Замінити значеннями з файлу»; flagged dishes), saves a copy of her sheet first, then writes. Her phone gets the rows on the next sync, with a one-time notice «Додано ваші продукти зі старої таблиці». A public import needs its own design (Intake).
  - **Flagged dishes:** a mark «скласти рецепт» on the row and in the editor, a «Скласти рецепт» filter in Продукти; it clears once she composes the dish; the 10 with a big difference from the estimate say so.
  - **Cuisine sets** move to the dish-sets release (Intake).

### 2.3.1 — Mom's own rows · ✅ released (2026-10-10, web + Play internal testing); the import on her sheet still to run
Her branded items, unverified values, «чорниці», 68 dishes «скласти рецепт» and 14 recipes, through the hidden developer import (see 2.3's decisions); trout and her recipes' missing ingredients added to the database (round 10). After the release, the developer runs the import on her sheet.

### 2.3.2 — Meal entry, one editor · 🔨 in progress (2026-10-10)
Placed by the developer (2026-10-10) before 2.4, which waits for mom's import; nothing here changes the sheet's structure.
- **Forms reject silently** (2026-10-10, developer): when a form won't save, it says nothing — the field that's empty or wrong isn't highlighted and there's no explanation. Proposed fix: every form names what's missing next to the field and moves to it (fix the whole class — every form, standing rule 8).
- **Custom entry follows the regular conventions** (2026-10-10, developer): «Власний запис» takes only grams and requires a weight; regular items take g, ml or pieces (2.0.1, 2.1.1) — e.g. a Tim Hortons hot chocolate is measured by the cup in ml.
- **Save a custom entry to the list later** (2026-10-10, developer): «Також зберегти» is offered only when the custom entry is first made; a logged custom entry can't be saved afterwards.
- **Recent custom entries, and one meal-entry editor** (2026-10-10, developer): when travelling you eat the same food for a few weeks without wanting it in the permanent list. The app remembers custom entries from the last 2 weeks (they're already meal rows, so no new storage) and lists them in the meal search, each with «Зберегти в мої продукти». Search and custom entry become one editor: pick from the list, or type — matches appear; with no match, the custom entry opens in place, with the option to save it permanently.

### 2.4 — Google Picker · 📝 planned (needed for the public launch)
- **The connected sheet in the connect window** (developer, 2026-10-06): listed first, marked «Підключена зараз», with no connect button. Today it's left out, so it looks missing.
- **The Android connect window doesn't list sheets the web app created** (2026-10-08, developer's report on build 28, from Intake): with `drive.file`, Google shows each client only the files it created (the web lists «Мої дані», the phone doesn't). Workaround until then: «За посиланням». The Picker grants per-file access — check it reaches the Android client (the research note below).
Spec: "Planned: spreadsheet detection + Google Picker". Detection and removing the test-sheet fallback moved to 1.7.1; left here: the Picker for sheets the app didn't create (replaces pasting a link), then dropping the `spreadsheets` scope. Research first: Picker inside the Android WebView. Needs Google Cloud setup by the developer.

### 2.5 — Food families in the dish composer · 📝 planned
Spec: "Planned: food families with cooking states". Raw weight + state in the finished dish; carbs by mass balance, GI from the cooked state; published whole-dish GI shown only as a check. The data already exists from 1.8/2.0.
- **Dry products get their GI through the family** (developer, 2026-10-05): until 2.5, dry grains, pasta and legumes carry the GI of their cooked form (labelled «після варіння»), so dishes composed from pack values keep a GI. With families, the composer asks how the product is cooked and takes the GI from the family's cooked entry; the dry entries then stop storing a GI of their own (one source per value).
- **Flour is the first family with dish states** (developer, 2026-10-09, from 2.2.1's research): the flour entries (2.2.1) carry nutrients only, GI «немає даних», because the same flour becomes porridge, pancakes, dumplings or bread. In the composer a flour line also says what's made from it, and the GI comes from that state (same upper-quartile rule, each with its source). Measurements found in the 2021 tables for wheat flour:
  - raw, stirred into water: 20, 22 (ST1 #706, #707) — not how it's eaten; shows why the state matters (the same Coles plain flour as pancakes is 61, #52);
  - pancakes (млинці, оладки): 61, 80 (ST1 #52, #55); with coconut flour 46 (#51), from a shake mix 67 (#53);
  - porridge from white flour: 55 (ST2 #2503);
  - unleavened flatbread / chapatti: 45 wholemeal roti (ST1 #350), chapatti 50–68 (#2076–#2078);
  - dumplings with cheese curd (pierogi ≈ вареники з сиром): white flour 42–61, wholegrain 25–34 (ST2 #3954–#3958, Poland);
  - white bread: summary row «White wheat flour bread, mean of 35 foods» (73; the existing bread entry uses it, 76).
  Other flours: maize-flour porridge (мамалига, кулеша) 71 whole / 75 refined (ST1 #1954, #1955); wholemeal oat-flour porridge 75 (ST2 #2506); rye only mixed with wheat (porridges 50–51, ST2 #2504, #2505); buckwheat and rice flour only in products (buckwheat pancakes from a gluten-free mix 102, ST1 #57 — a packet mix, not a home recipe). A state without a measurement stays «немає даних».

### 2.6 — Reading labels from a photo · 📝 planned
- A photo of the pack → the nutrition table and «Склад» are read on the device (text recognition, free and offline) → she checks every value before saving; «неперевірено» stays.
- Merges the two label-reading entries (2026-10-05 intake; "Label photos + zoom → drafts → 3-day update window", spec: "Label photos, drafts and the 3-day update window", which records the reading options, costs, privacy and boundaries).
- Ukrainian breads were the trigger: too many brands to add to the database, and mom picks the rye bread with the lowest sugar on the label.

### 2.7 — GI from ingredients · 📝 planned — **after the research below confirms the method** (mom's idea, 2026-10-07)
Packs never list GI, but they list «Склад». A packaged product is a dish with an unknown recipe; dishes already get their GI from their ingredients (carb-weighted).
- **The ingredient list:** the app builds it from «Склад»; **she checks it and can edit any ingredient** (developer). Each ingredient is looked up in her products, then the verified database, then USDA; anything still missing is shown for her to add. A missing ingredient with a tiny carbohydrate share is left out (the recipes' rule); otherwise the app says it can't estimate yet.
- **The recipe:** the shares that keep the label's order (largest first) and any stated percentages, and best reproduce the label's nutrition table (fitted on dry weight; baking loses water).
- **The result is a range:** the lowest and highest GI among all recipes that fit («≈ ГІ 55–68, оцінка за складом»), because ingredients that look alike in nutrients can differ a lot in GI. When nothing fits, no number.
- **Next to it, the closest measured product** with its source, chosen by processing cues in the list (закваска, цільнозернове, пластівці) through simple rules.
- Its own reliability level, the ingredients and shares used, and the reasoning are shown and stored (rule 5). It's arithmetic on the label, not a measurement.

### 2.8 — AI looks up GI and nutrients · 📝 planned (developer, 2026-10-07)
- For products not in our database, AI does the work we did by hand for the database: finds published values, gives the source, reliability, reasoning and date, and picks the closest measured product where processing is unclear (for 2.7).
- She confirms; the value is marked as found by AI, not checked by us.
- **A worked case (developer, 2026-10-08): two grocery sandwiches with no label**, logged with only a name and weight (Montreal smoked meat 180 г, maple turkey 170 г). Estimated by hand:
  - **Steps:** name and weight in → a typical recipe with grams (bread, filling, spread) → each ingredient matched to a USDA record → totals per sandwich and a carb-weighted GI from the bread → each assumption shown with its reliability.
  - **Where the uncertainty came from:** missing facts, not the maths. The bread type (rye or light rye; whole-wheat or white), the cut of meat (lean or traditional smoked meat: ≈335 vs ≈440 kcal) and whether there was a spread (mayo ±70 kcal) each moved the result more than anything else.
  - **So the feature should ask one or two short questions** ("білий чи цільнозерновий хліб?", "був майонез?") instead of guessing silently, and show the range when it can't ask.
  - **No GI table lists such sandwiches;** the GI comes from the bread's GI weighted by its share of the carbs, marked as an estimate.
  - **Ties in with saving it:** the result goes in as a fixed-value dish (2.0.2's «Також зберегти в «Страви»»), so the next time it's one tap.
- **Needs a decision on AI costs first:** free/paid, or a daily cap like translation's. Looking up a vendor's own recipe isn't part of it (expensive; people can do that in their own AI assistant).

### 2.9 — English version · 📝 planned (developer, 2026-10-07: before the public launch — she lives in Canada and her own circle is English-speaking)
Spec: "Planned: English version" (the decisions are made: device language first, a switch in Settings, new sheets' readable names in the app's language, meal types kept as stored keys).

### 3.0 — Public launch · 📝 planned
- **Closed testing first:** Play won't publish to a closed track until the Dashboard steps are done — full description and store listing, category and contact details, content rating, target audience, Data safety, financial features, the health declaration, the privacy policy, government apps (found 2026-10-06). Then mom moves to a closed track and internal testing becomes the developer's own.
- New personal Play accounts need a closed test with 12 testers for 14 days before production.
- Google OAuth verification (with the narrower scopes after 2.4), store listing (app-designer wording, no medical claims), a check of the privacy policy, free/paid and payments.

### Research — GI from ingredients, by hand · 📝 any time, no code (developer, 2026-10-07)
Before building 2.7: run the method by hand on products sold in Ukraine that have published GI values, across **different kinds of food, not only bread** (breads, cereals and granola, crackers and biscuits, pasta, sweetened yogurts, snack bars). Record each range against the measured value. If the ranges usually contain it, build 2.7; if not, rethink it first. Needs the base ingredients' values (2.2.1's set, or researched for the test).

### Product decisions still open (from the local-first design notes)
- **Free vs paid** (only what costs the developer goes paid): free = local app, our verified database as sets (built in the local-first version, kept on the device; Ukrainian search from 1.9), manual entry, meals, blood sugar, reminders; paid = USDA search with translation (Translation API), AI label reading, and sync across devices (Sheets itself costs nothing — a product choice). Payments: **Google Play billing** first (Android only, 15%); a paid web version would need its own accounts and payments.
- **Database sets — built here, once** (moved from 1.9 on 2026-10-05; design from 2026-10-04):
  - Built-in items stop being "invisible": today they live only inside the app and appear in her lists without being in her data, while users (mom included) expect to see them in the spreadsheet.
  - **Sets on our server:** the verified database as a static file on the existing Vercel site (practically free), split by category; updates without an app release; the roncreator.com public pages built from the same file. Downloaded sets are kept on the device.
  - **Clean start:** new data starts empty; the app offers sets («Додати набори: Крупи, Овочі, Молочні продукти…»), also later from Продукти.
  - **Everything she adds becomes her row** — a whole set or a single item — linked to the database (`BasedOn = B…`, the 1.6 mechanism), synced to Sheets.
  - **Database updates for her copies** («Оновлення бази: 12 продуктів мають уточнені значення — оновити?») — the 1.8 update offer, generalised.
  - **Moving mom over:** built-in items she already used (in meals or recipes) become her rows; the rest is offered as sets — nothing she's used to disappears.
  - **Size** isn't a concern: a 2,000-entry documented database ≈ 1–2 MB, a few hundred KB compressed.

---

## roncreator.com site
- 📝 **Privacy policy update** — out of date for 2.0 (a copy on the device, working without Google, backup copies in Drive, an anonymous account ID on the web); ships with 2.0.4, and sooner if possible, since mom's app already does this.
- 📝 **Public food database pages** — publish the verified database (sources, reliability, reasoning) for other users, generated from `verified-foods.json`; addresses like `…/foods/B0042-apple-raw` (only the ID is looked up, the readable part can change). Depends on 1.8 format + content (and 1.9, which hosts the same file).
- 📝 **Contact form email** — Resend account + DNS records in Cloudflare + Vercel env vars.
- 📝 **Mom's story** on the Track My Meals landing — draft privately, publish only after her approval.
- 📝 Friendly bilingual 404 page.
- ⏸ Decorative brand shapes — need dedicated design work.
- ⏸ Pomodoro Guardian: second Figma page (inner page design) not reviewed yet.

## Chores
- 📝 **Now that 1.5.x is released:** retire the old GitHub Pages privacy page, rename the repo to `track-my-meals`, make it private, rename the local folder (+ move Claude's notes).
- 📝 **Staging address** for signed-in branch testing (`staging` branch + fixed domain + OAuth origin) and tick **Preview** for `USDA_API_KEY` / `VITE_SPREADSHEET_ID` in Vercel.
- 📝 Review page: clear the stale кисляк objection (Г68).
- 🔨 **Test devices** — *2026-09-30:* Pixel 10 AVD (Google Play image, Gboard EN+UK) works; Windows hypervisor re-enabled. Still to add: small phone, medium phone, tablet (needs "Android SDK Command-line Tools" installed in Android Studio), and mom's model. Original note: Android Emulator (already installed, but no system images/AVDs yet) — create 2–3 virtual phones via Android Studio → Device Manager, *Google Play* images (include Gboard): a small phone (mom's size — model to confirm), a large phone, a tablet; enable Windows Hypervisor Platform if asked. Lets Claude reproduce app bugs without the developer's phone. Samsung-specific issues still need a real device or Firebase Test Lab (free daily quota, automated only).

## Intake (new feedback, not yet placed)

- **Cuisine sets** (2026-10-09, developer): sets by kind of kitchen, e.g. «Українська кухня», to start using the app right away; one product can be in several sets (2.2's sets file allows it). Proposed place: **with the dish sets** (developer, 2026-10-09: most useful with ready dishes). No health-claim names («здоровий вибір» is out — standing rule 5).
- **Importing a user's own data, for the public** (2026-10-09, developer): users' data is in Excel, other apps or paper, not in our file format; 2.3.1's import is a developer tool only. Proposed place: **before 3.0** (e.g. a spreadsheet column mapper), alongside 2.6's label photos.
- **Dish sets and database recipes** (2026-10-09, developer): sets by kind of dish — baking, stews, soups, sauces. They need composed recipes in the database built from its products, which it doesn't have yet. Proposed place: **its own release after 2.5** (food families give recipes their cooking states).
- **Workflow: a failed phone step went unnoticed** (2026-10-09, observed in session): a debug-build install failed over the Play build, but the command filtered its output (`| tail -1`) and went on to `pm clear` — clearing the developer's own Play app data. Proposed fix: run each phone step on its own and check its result before the next; add this to `docs/tasks/dha-task-device-testing.md`. Proposed place: **the task file** (confirm before changing it, standing rule 3).
- **Workflow: source edits during a browser check sign the developer out** (2026-10-09/10, observed in session): editing app files while the developer is signed in to the local web app makes Vite reload the page, and the in-memory sign-in is lost (it happened several times). Proposed fix: collect fixes found during a browser check and apply them after it; note it in `docs/tasks/dha-task-device-testing.md`. Proposed place: **the task file**.
- **Workflow: a review round's time in the future reopens accepted entries** (2026-10-10, observed in session): round 10's `changedAt` was set later than the developer's decisions, so the review page kept showing them as changed after her decision (one entry was decided 7 times). Proposed fix: `build_review.py` refuses a round time later than now. Proposed place: **the next database round** (`tools/verified-db/`).
- **Workflow: a commit landed on `main` before the release branch was cut** (2026-10-09, observed in session): the first 2.2 commit went to `main`; it was moved back before anything was pushed. Proposed fix: check the branch before a release's first commit; add the check to `docs/tasks/dha-task-release.md` → Branches. Proposed place: **the task file**.

New items land here with a one-line note, then get placed above.

---

## Released

Full text of each release and resolved intake item: [roadmap-archive.md](roadmap-archive.md).

- ✅ **2.0** (2026-10-06, builds 19–23, internal testing + web): local-first — reading from the device, offline saving and sync, Android without Google, «Синхронізувати з Google Таблицею» with the duplicates review; the web keeps no copy between sessions; back button; one notice for the sheet update.
- ✅ **1.9** (2026-10-05): database-first search with similar names, GI suggestions for the user's own products, deleting products and dishes, coffee (brewed, espresso), decimal comma everywhere.
- ✅ **1.8.1** (2026-10-05): hotfix — the meal editor's discard and delete questions are dialogs (they were off-screen on the phone).
- ✅ **1.8** (2026-10-05): verified food database — 96 entries (USDA SR Legacy + 2021 GI tables), ⓘ sources, «неперевірено», update offer for saved copies, «після варіння».
- ✅ **1.7.1** (2026-10-04): connecting a spreadsheet — sheets found in Drive, create new, recent on the device, built-in sheets by access, paste a link.
- ✅ **1.7** (2026-10-04): daily records — medicine and weight, the new Today, History per day.
- ✅ **1.6** (2026-10-04): permanent item IDs (built-in `B…`, the user's `I…`/`D…`), linked copies of built-in items, recipe ingredient IDs, meal `ItemId`; silent lossless sheet upgrade with a one-time note; duplicate-name check; one notification standard (toast queue); read-limit fix (batch reads, retry on 429).
- ✅ **1.5.4** (2026-10-04): when the Google sign-in expires (~1 h on the web; a dead refresh token on Android) a banner asks to sign in again instead of requests failing silently; screens keep what's on them and reload after signing in.
- ✅ **1.5.3** (2026-10-01): urgent fix — decimals (blood sugar 6.2, carbs, GL, settings) read as 0 from Ukrainian-locale sheets; the app now reads stored values instead of display text.
- ✅ **1.5.2** (2026-10-01): Google Cloud Translation through our own `api/translate`, 15,000 characters/day project cap (inside the free tier), 2,000/day per device, translations remembered on the device.
- ✅ **1.5.1** (2026-09-30): keyboard language switch, food search (capitals, failures, translation limit, top-5 layout), no service worker in the Android app. Includes 1.5 (reminders while idle, blood sugar time + editing, USDA proxy, privacy link, desktop layout).
- ✅ **Web version live** at `track-my-meals.roncreator.com` (2026-09-28): unlisted, USDA proxy, desktop layout.
- ✅ **roncreator.com live** (2026-09-28): home + landings (EN/UA), brand from Figma, privacy policy, sticky header with project links.
- ✅ **1.4** (2026-09-26): spreadsheet structure check/repair; keys row + readable-names row.
