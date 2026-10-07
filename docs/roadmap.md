# Roadmap

The planner for Track My Meals / Трекер Харчування and the roncreator.com site. **This file decides what gets built and when.** The *design* of each feature lives in [technical-spec.md](technical-spec.md); the history of what was done lives in [build-log.md](build-log.md).

## How we work

The workflow (intake → release branch → verify → release) and the standing rules are in [../CLAUDE.md](../CLAUDE.md); step-by-step procedures are in [tasks/](tasks/).

**Statuses:** 📝 planned · 🔨 in progress · 👀 in review / testing · ✅ released · ⏸ on hold.

---

## Next session — start here (set 2026-10-07)
1. **2.0 released** to Play's internal testing track and the web (2026-10-06, builds 19–23). Nothing is public; mom is an internal tester, so **an upload is a release to her**. Still worth checking on the developer's devices: the `online` event on a real phone, two tabs, switching sheets.
2. **Plan reviewed with the developer (2026-10-07):** 2.0.1 → 2.0.2 faster food entry → 2.0.3 reminders → 2.0.4 sign-in choices (+ privacy policy) → 2.1 sets → 2.2 mom's data → 2.3 Picker → 2.4 food families → 2.5 label photos → 2.6 GI from ingredients (after the research) → 2.7 AI lookup → 2.8 English → 3.0 public launch.
3. **Now: 2.0.1 — pack values.** Branch `release/2.0.1`; design in the spec ("Pack values: per [n] g and per [n] pieces"). **Waiting for the developer's OK on that design before building.**
4. Chromium issue 569300356: reply sent 2026-10-05 — check for answers now and then.

## Current and upcoming releases

### 2.0.1 — Pack values: per [n] g and per [n] pieces · 🔨 designed, branch `release/2.0.1` (developer, 2026-10-06 — needed in her own use) — spec → "Pack values"
Packs list nutrients per portion (per 30 g) or per piece (dumplings per 12), not always per 100 g. Values are entered exactly as printed.
- **Item editor (products and dishes):** «на … г» and «на … шт.» side by side, with a radio button marking the main one: the amount the values are entered for, required. The other is optional and states the same amount the other way (values per 12 шт. with 200 г: 12 шт. = 200 г, a piece weight of ≈16,7 г). A dish's yield is a weight, a count («Вийшло 10 млинців») or both. The form shows what will be stored.
- **Stored:** grams-main items stay per 100 g as today (every value except GI recalculated). Pieces-main items store values per 1 piece. Either can carry a piece weight. New columns arrive through the silent upgrade; the sync, the duplicates review and the database search learn them.
- **Meal editor:** grams and pieces are linked. Type one and the app fills in the other when a piece weight is known (210 г → 12,6 шт.). Counts allow decimals (7,5). Without a piece weight only the main field shows; a pieces-main entry's weight is unknown, never 0.
- **Maths:** every nutrient, GI and GL work without weight. GL = GI × grams of carbs eaten; a dish's GI is already weighted by carbs; a dish needs only its ingredients' total nutrients and its yield. A pieces-main product goes into a recipe by count.
- **Checks against:** dumplings (pack per 12 шт.), pancakes (dish yield as a count), nuts (per 100 г with 100 г = 20 шт., logged as 3 горіхи), a 30 г portion pack.

### 2.0.2 — Faster food entry · 📝 planned (developer, 2026-10-06/07)
- **Named portion sizes:** up to 3 approximate sizes per product or dish, each a label and grams («скибка ~45 г», «маленьке / середнє / велике яблуко», «чашка ~250 г»); default labels маленька / середня / велика, renamable. The meal editor offers them as one tap plus a count (2 × середнє); grams shown as approximate («≈»). **The verified database ships typical sizes** for common foods, each with a source, reliability, reasoning and date (rule 5; USDA lists portion weights, e.g. "1 medium apple"); her own sizes override or add to them.
- **Common nuts in the verified database:** almonds, pistachios, hazelnuts, cashews, peanuts, and maybe pecans, Brazil nuts, pine nuts, sunflower and pumpkin seeds; **roasted, unsalted and salted** where sources allow (salted pistachios carry far more sodium); walnuts stay raw. Each with the typical weight of one nut («1 мигдалина ≈ 1,2 г»), logged by count (mom eats a few at a time).
- **Save a custom meal entry to «Страви»** («Зберегти в мої страви»): a fixed-value dish (values per portion, weight optional).
- **Maths in value fields:** `200*3/4` or «200 ккал * 3/4», to log part of a meal box. Numbers, `+ − * / ( )`, a decimal comma, unit words ignored; the field shows the result, and the result is stored.

### 2.0.3 — Reminders · 📝 planned
- **Follow-ups:** the reminder + 1–2 follow-ups (e.g. +30 and +60 min), cancelled by logging a meal, none in quiet hours, all scheduled ahead so they survive a restart. Open: how many / how far apart; keep or drop the re-fire on opening.
- **Missed during a phone restart:** `@capacitor/local-notifications` 8.3.1's restore receiver drops a one-shot whose time passed while the phone was off. Patch it (patch-package): one due after the last boot started counts as missed and shows 15 s after boot; report upstream.
- **Easy to miss:** a new channel with vibration on (a channel's sound and vibration can't change after creation), maybe a more noticeable sound; check mom's notification volume.
- **Two permission asks feel like one failed:** one short explanation screen, then both permissions one after the other; the notice only if exact alarms are still off (since 2.0 build 22 the app never opens the alarm settings by itself).

### 2.0.4 — Sign-in choices · 📝 planned (developer, 2026-10-07)
The person decides where their data lives, with plain wording about each choice.
- **«Запам'ятати мене на цьому пристрої»** at sign-in. On: the device keeps its copy of the sheet until «Вийти». Off: sign in every time, and the copy is cleared when the session ends (the web's behaviour today).
- **Web:** one tap «Продовжити як …» on each visit (Google skips the password while the person is signed in to Google in that browser); no long-lived pass is stored (developer: works for now). **Android:** already remembered; this adds the choice not to.
- **Without Google (Android):** before starting, an acknowledgement that the data lives only on that phone and anyone with access to it can read it, with a button naming the outcome.
- Also ends the dev server's sign-in on every reload.
- **The privacy policy update ships with it** (roncreator.com).

### 2.1 — Sets, clean start, moving mom over · 📝 planned
The verified database offered as sets; new data starts empty; built-in items she used become her rows; the generalised update offer.
- **A base ingredients set** (2026-10-07): kinds of flour, sugars, starches, seeds, oils — for recipes, and needed by 2.6.

### 2.2 — Mom's data, verified · 📝 planned — **after local-first** (developer, 2026-10-05)
Her import comes **after local-first (2.0) and sets (2.1)**, as sets plus her own rows, so it's built once (developer chose this over an earlier import into the bundled database, 2026-10-05). The release number stays; it ships after local-first.
Spec rules: memory of the import decisions (2026-09-29) + the review page.
- **Database content:** every item of hers with a genuine match (~90, incl. olives black + green, trout + salmon, beef/pork heart raw + boiled, cocoa), under proper names — **plus the raw/cooked partner** of each wherever the source has both.
- **Ingredients her dishes likely need** — estimated from each dish, added to the database so she can compose them later. **Her dishes themselves are not recalculated:** her value is kept and the dish is flagged «потрібно скласти рецепт».
- **Her own sheet:** branded packaging items (her values) and values we couldn't verify (kept as she has them, marked «неперевірено»); her dishes with the flag. **Not added:** items without a genuine match and the dropped ones (кукурудза варена, гірчиця американська, тунець, fructose sweets, calculation leftovers).
- Import mechanism (how the rows get into her sheet) to be decided at the start of this release.

### 2.3 — Google Picker · 📝 planned (needed for the public launch)
- **The connected sheet in the connect window** (developer, 2026-10-06): listed first, marked «Підключена зараз», with no connect button. Today it's left out, so it looks missing.
Spec: "Planned: spreadsheet detection + Google Picker". Detection and removing the test-sheet fallback moved to 1.7.1; left here: the Picker for sheets the app didn't create (replaces pasting a link), then dropping the `spreadsheets` scope. Research first: Picker inside the Android WebView. Needs Google Cloud setup by the developer.

### 2.4 — Food families in the dish composer · 📝 planned
Spec: "Planned: food families with cooking states". Raw weight + state in the finished dish; carbs by mass balance, GI from the cooked state; published whole-dish GI shown only as a check. The data already exists from 1.8/2.0.
- **Dry products get their GI through the family** (developer, 2026-10-05): until 2.4, dry grains, pasta and legumes carry the GI of their cooked form (labelled «після варіння»), so dishes composed from pack values keep a GI. With families, the composer asks how the product is cooked and takes the GI from the family's cooked entry; the dry entries then stop storing a GI of their own (one source per value).

### 2.5 — Reading labels from a photo · 📝 planned
- A photo of the pack → the nutrition table and «Склад» are read on the device (text recognition, free and offline) → she checks every value before saving; «неперевірено» stays.
- Merges the two label-reading entries (2026-10-05 intake; "Label photos + zoom → drafts → 3-day update window", spec: "Label photos, drafts and the 3-day update window", which records the reading options, costs, privacy and boundaries).
- Ukrainian breads were the trigger: too many brands to add to the database, and mom picks the rye bread with the lowest sugar on the label.

### 2.6 — GI from ingredients · 📝 planned — **after the research below confirms the method** (mom's idea, 2026-10-07)
Packs never list GI, but they list «Склад». A packaged product is a dish with an unknown recipe; dishes already get their GI from their ingredients (carb-weighted).
- **The ingredient list:** the app builds it from «Склад»; **she checks it and can edit any ingredient** (developer). Each ingredient is looked up in her products, then the verified database, then USDA; anything still missing is shown for her to add. A missing ingredient with a tiny carbohydrate share is left out (the recipes' rule); otherwise the app says it can't estimate yet.
- **The recipe:** the shares that keep the label's order (largest first) and any stated percentages, and best reproduce the label's nutrition table (fitted on dry weight; baking loses water).
- **The result is a range:** the lowest and highest GI among all recipes that fit («≈ ГІ 55–68, оцінка за складом»), because ingredients that look alike in nutrients can differ a lot in GI. When nothing fits, no number.
- **Next to it, the closest measured product** with its source, chosen by processing cues in the list (закваска, цільнозернове, пластівці) through simple rules.
- Its own reliability level, the ingredients and shares used, and the reasoning are shown and stored (rule 5). It's arithmetic on the label, not a measurement.

### 2.7 — AI looks up GI and nutrients · 📝 planned (developer, 2026-10-07)
- For products not in our database, AI does the work we did by hand for the database: finds published values, gives the source, reliability, reasoning and date, and picks the closest measured product where processing is unclear (for 2.6).
- She confirms; the value is marked as found by AI, not checked by us.
- **Needs a decision on AI costs first:** free/paid, or a daily cap like translation's. Looking up a vendor's own recipe isn't part of it (expensive; people can do that in their own AI assistant).

### 2.8 — English version · 📝 planned (developer, 2026-10-07: before the public launch — she lives in Canada and her own circle is English-speaking)
Spec: "Planned: English version" (the decisions are made: device language first, a switch in Settings, new sheets' readable names in the app's language, meal types kept as stored keys).

### 3.0 — Public launch · 📝 planned
- **Closed testing first:** Play won't publish to a closed track until the Dashboard steps are done — full description and store listing, category and contact details, content rating, target audience, Data safety, financial features, the health declaration, the privacy policy, government apps (found 2026-10-06). Then mom moves to a closed track and internal testing becomes the developer's own.
- New personal Play accounts need a closed test with 12 testers for 14 days before production.
- Google OAuth verification (with the narrower scopes after 2.3), store listing (app-designer wording, no medical claims), a check of the privacy policy, free/paid and payments.

### Research — GI from ingredients, by hand · 📝 any time, no code (developer, 2026-10-07)
Before building 2.6: run the method by hand on products sold in Ukraine that have published GI values, across **different kinds of food, not only bread** (breads, cereals and granola, crackers and biscuits, pasta, sweetened yogurts, snack bars). Record each range against the measured value. If the ranges usually contain it, build 2.6; if not, rethink it first. Needs the base ingredients' values (2.1's set, or researched for the test).

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
- 📝 **Keep a test sheet in the Ukrainian locale** for every release check (2026-10-01): the 1.5.3 decimals bug only showed in Ukrainian-locale sheets.
- 📝 **Now that 1.5.x is released:** retire the old GitHub Pages privacy page, rename the repo to `track-my-meals`, make it private, rename the local folder (+ move Claude's notes).
- 📝 **Staging address** for signed-in branch testing (`staging` branch + fixed domain + OAuth origin) and tick **Preview** for `USDA_API_KEY` / `VITE_SPREADSHEET_ID` in Vercel.
- 📝 Review page: clear the stale кисляк objection (Г68).
- 🔨 **Test devices** — *2026-09-30:* Pixel 10 AVD (Google Play image, Gboard EN+UK) works; Windows hypervisor re-enabled. Still to add: small phone, medium phone, tablet (needs "Android SDK Command-line Tools" installed in Android Studio), and mom's model. Original note: Android Emulator (already installed, but no system images/AVDs yet) — create 2–3 virtual phones via Android Studio → Device Manager, *Google Play* images (include Gboard): a small phone (mom's size — model to confirm), a large phone, a tablet; enable Windows Hypervisor Platform if asked. Lets Claude reproduce app bugs without the developer's phone. Samsung-specific issues still need a real device or Firebase Test Lab (free daily quota, automated only).

## Intake (new feedback, not yet placed)

(empty — everything is placed in the releases above, 2026-10-07)

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
