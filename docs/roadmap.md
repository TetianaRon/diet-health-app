# Roadmap

The planner for Track My Meals / Трекер Харчування and the roncreator.com site. **This file decides what gets built and when.** The *design* of each feature lives in [technical-spec.md](technical-spec.md); the history of what was done lives in [build-log.md](build-log.md).

## How we work

The workflow (intake → release branch → verify → release) and the standing rules are in [../CLAUDE.md](../CLAUDE.md); step-by-step procedures are in [tasks/](tasks/).

**Statuses:** 📝 planned · 🔨 in progress · 👀 in review / testing · ✅ released · ⏸ on hold.

---

## Next session — start here (set 2026-10-06)
1. **2.0 on internal testing** (released 2026-10-06: `main` pushed, which is the web, still limited to Google test users; bundle on Play's internal track, versionCode 19; build 20 the same day: one notice for the sheet update, screens wait for it). A week on the developer's devices and the emulator, checking what the build log lists as not checked (the `online` event on a real phone, two tabs, switching sheets). **Before production and mom:** update the privacy policy on roncreator.com (2.0 keeps a copy on the device, works without Google, makes backup copies in Drive, stores an anonymous account ID on the web).
2. Next build: **2.0.1 — pack values per [n] g and per [n] pieces**.
3. Chromium issue 569300356: reply sent 2026-10-05 (repro APK, videos; Chrome itself now affected too) — check for answers now and then.

## Current and upcoming releases

### 2.0 — Local-first: the device is the app · 👀 internal testing (released 2026-10-06: web + Play internal track; build 20, released the same day, fixes the first-open notices; build 21, released the same day, hides backup copies from the connect window) — production after a week — spec → "Local-first app"
One release (developer, 2026-10-05) combining what was planned as three: reading from the device, offline saving with full sync, and Android without Google. Built on `release/2.0` in three internal checkpoints, each tested before the next starts; nothing ships in between.

**Checkpoint A — reading from the device** · ✅ built and checked on the dev sheet (2026-10-05; build log)
- **Local database:** `@sqlite.org/sqlite-wasm` with the OPFS SAH-pool storage in a worker (the proven spike set-up), on the web and inside the Android app. One table per sheet tab, same fields, plus the bookkeeping fields. One database file per connected spreadsheet.
- **Row IDs for every tab:** new `Id` columns on DailyLog (`L…`), BloodSugar (`S…`), MedicationLog (`T…`) and Weight (`W…`).
- **One sheet upgrade** adds everything 2.0 needs at once: `Id`, `UpdatedAt` on every tab, and the «Видалені» tab. Existing rows get IDs once. Structure changes are tried on the **dev** sheet first.
- **The per-tab modules read the local database;** screens don't change. The old offline read cache in `sheets.ts` goes.
- **Web:** sign-in required. A second tab shows «Застосунок відкрито в іншій вкладці» with «Відкрити тут», which takes the database over.

**Checkpoint B — offline saving and full sync** · ✅ built and checked on the dev sheet (2026-10-06; build log)
- **Every change is written to the device first,** then queued for the sheet.
- **Sync** runs at start, on return after more than 5 minutes, a few seconds after changes, and from «Синхронізувати» (with the last sync time). It's one `batchGet`, then a merge by row (the newer `UpdatedAt` wins), then one `batchUpdate` plus appends.
- **Deletions** go through the «Видалені» tab.
- **Edits made by hand in the sheet** are noticed (row fingerprints).
- **Safeguard:** an automatic backup copy of the sheet («Трекер харчування — копія перед синхронізацією <date>») as a separate file in the app's Drive folder before a device's first sync; moved to Drive's trash automatically after 14 days of working sync, with a note.
- Switching sheet or signing out syncs first, or warns if it can't.

**Checkpoint C — Android without Google** · ✅ built and checked (2026-10-06; build log)
- «Почати без Google» on Android. The web stays sign-in only.
- **No phone backup file** (developer, 2026-10-06: the app's own storage is enough; the .xlsx backup was built, then removed).
- **«Синхронізувати з Google Таблицею»** (developer's redesign, 2026-10-06) opens the usual connect window: a new sheet or an existing one gets the phone's data. Same-name products, dishes and medicines, and a weight on a day the sheet already has, are decided in «Знайдено однакові записи»: keep the sheet's, keep the phone's, or keep both under names she sets.

**Release checks** · ✅ done 2026-10-06 (build log)
- Unit tests for the mapping, merge, deletions, hand-edit detection, backups and the duplicates plan (373).
- In the app: one request per sync instead of one per screen; syncing the phone's data into the dev sheet with duplicates (web and emulator); the emulator offline (saves, a restart, then syncing); the upgrade on the dev sheet.
- **Added during the checks** (developer, 2026-10-06): the web keeps no copy of a sheet between sessions, its connection belongs to one Google account, and closing the tab with saves not yet in the sheet asks first. Android opens signed in without a connection.
- **Safeguard:** a week on Play's **internal testing** track on the developer's devices and the emulator before production. Mom gets it after that.

### 2.0.1 — Pack values: per [n] g and per [n] pieces · 📝 planned (right after 2.0; developer, 2026-10-06 — needed in her own use; pieces added the same day)
Packs list nutrients per portion (per 30 g) or per piece (dumplings per 12), not always per 100 g. Values are entered exactly as printed.
- **Item editor (products and dishes):** «на … г» and «на … шт.» side by side, with a radio button marking the main one: the amount the values are entered for, required. The other is optional and states the same amount the other way (values per 12 шт. with 200 г: 12 шт. = 200 г, a piece weight of ≈16,7 г). A dish's yield is a weight, a count («Вийшло 10 млинців») or both. The form shows what will be stored.
- **Stored:** grams-main items stay per 100 g as today (every value except GI recalculated). Pieces-main items store values per 1 piece. Either can carry a piece weight. New columns arrive through the silent upgrade; the sync, the duplicates review and the database search learn them.
- **Meal editor:** grams and pieces are linked. Type one and the app fills in the other when a piece weight is known (210 г → 12,6 шт.). Counts allow decimals (7,5). Without a piece weight only the main field shows; a pieces-main entry's weight is unknown, never 0.
- **Maths:** every nutrient, GI and GL work without weight. GL = GI × grams of carbs eaten; a dish's GI is already weighted by carbs; a dish needs only its ingredients' total nutrients and its yield. A pieces-main product goes into a recipe by count.
- **Checks against:** dumplings (pack per 12 шт.), pancakes (dish yield as a count), nuts (per 100 г with 100 г = 20 шт., logged as 3 горіхи), a 30 г portion pack.

### 2.1 — Sets, clean start, moving mom over · 📝 planned
The verified database offered as sets; new data starts empty; built-in items she used become her rows; the generalised update offer.

### 2.2 — Mom's data, verified · 📝 planned — **after local-first** (developer, 2026-10-05)
Her import comes **after local-first (2.0) and sets (2.1)**, as sets plus her own rows, so it's built once (developer chose this over an earlier import into the bundled database, 2026-10-05). The release number stays; it ships after local-first.
Spec rules: memory of the import decisions (2026-09-29) + the review page.
- **Database content:** every item of hers with a genuine match (~90, incl. olives black + green, trout + salmon, beef/pork heart raw + boiled, cocoa), under proper names — **plus the raw/cooked partner** of each wherever the source has both.
- **Ingredients her dishes likely need** — estimated from each dish, added to the database so she can compose them later. **Her dishes themselves are not recalculated:** her value is kept and the dish is flagged «потрібно скласти рецепт».
- **Her own sheet:** branded packaging items (her values) and values we couldn't verify (kept as she has them, marked «неперевірено»); her dishes with the flag. **Not added:** items without a genuine match and the dropped ones (кукурудза варена, гірчиця американська, тунець, fructose sweets, calculation leftovers).
- Import mechanism (how the rows get into her sheet) to be decided at the start of this release.

### 2.3 — Google Picker · 📝 planned
Spec: "Planned: spreadsheet detection + Google Picker". Detection and removing the test-sheet fallback moved to 1.7.1; left here: the Picker for sheets the app didn't create (replaces pasting a link), then dropping the `spreadsheets` scope. Research first: Picker inside the Android WebView. Needs Google Cloud setup by the developer.

### 2.4 — Food families in the dish composer · 📝 planned
Spec: "Planned: food families with cooking states". Raw weight + state in the finished dish; carbs by mass balance, GI from the cooked state; published whole-dish GI shown only as a check. The data already exists from 1.8/2.0.
- **Dry products get their GI through the family** (developer, 2026-10-05): until 2.4, dry grains, pasta and legumes carry the GI of their cooked form (labelled «після варіння»), so dishes composed from pack values keep a GI. With families, the composer asks how the product is cooked and takes the GI from the family's cooked entry; the dry entries then stop storing a GI of their own (one source per value).

### Local-first (2.0, 2.1) — design notes · spec → "Local-first app"
**Decided 2026-10-05:** SQLite on every platform (web build proven first), hand edits in the sheet supported, deletions remove the row plus a «Видалені» tab, .xlsx backups (dropped 2026-10-06: the app's storage is enough). The web version always signs in (its local database is a copy of the sheet for one session); working without Google is Android-only. Releases: proof ✅ (spike, 2026-10-05) → 2.0 local-first in one release (reading, offline saving + sync, Android without Google) → 2.1 sets, clean start and moving mom over, then 2.2 (mom's data). Free/paid is decided before the public launch. The notes below are the original idea, kept for the parts the spec doesn't cover yet (free/paid, payments).
- **Local-first storage:** the app keeps its data on the device (IndexedDB in the WebView, or a native SQLite plugin for robustness), reads instantly and offline; Google Sheets becomes an optional **sync target** (send changes, fetch others' changes) instead of being read on every screen. Removes the read-limit problem at the root.
- **Sync engine** — the hard part: phone + computer on one sheet, offline edits on both, deletions. 1.6's permanent IDs are the foundation; also needs per-row "last changed" times and deletion markers; "latest edit of a row wins" suits mostly-append data (meals, readings). A series of releases, not one.
- **Fully local version without Google sign-in:** data only on the phone → needs **export/backup** (file, Android backup) against loss; the web version can't share data without sync.
- **Free vs paid** (only what costs the developer goes paid): free = local app, our verified database as sets (built in the local-first version, kept on the device; Ukrainian search from 1.9), manual entry, meals, blood sugar, reminders; paid = USDA search with translation (Translation API), AI label reading, and sync across devices (Sheets itself costs nothing — a product choice). Payments: **Google Play billing** first (Android only, 15%); a paid web version would need its own accounts and payments.
- **Database sets — built here, once** (moved from 1.9 on 2026-10-05; design from 2026-10-04):
  - Built-in items stop being "invisible": today they live only inside the app and appear in her lists without being in her data, while users (mom included) expect to see them in the spreadsheet.
  - **Sets on our server:** the verified database as a static file on the existing Vercel site (practically free), split by category; updates without an app release; the roncreator.com public pages built from the same file. Downloaded sets are kept on the device.
  - **Clean start:** new data starts empty; the app offers sets («Додати набори: Крупи, Овочі, Молочні продукти…»), also later from Продукти.
  - **Everything she adds becomes her row** — a whole set or a single item — linked to the database (`BasedOn = B…`, the 1.6 mechanism), synced to Sheets.
  - **Database updates for her copies** («Оновлення бази: 12 продуктів мають уточнені значення — оновити?») — the 1.8 update offer, generalised.
  - **Moving mom over:** built-in items she already used (in meals or recipes) become her rows; the rest is offered as sets — nothing she's used to disappears.
  - **Size** isn't a concern: a 2,000-entry documented database ≈ 1–2 MB, a few hundred KB compressed.
- **Open questions:** storage technology; sync rules and conflicts; backup format; exact free/paid split; subscription vs one-time; public launch prep (OAuth verification, store listing, privacy policy).

### Later (unordered)
- **Label photos + zoom → drafts (photo/name-only, loggable) → 3-day update window → Google Lens** (spec: "Label photos, drafts and the 3-day update window")
  - *Reading the label:* Google Lens copy/paste, or **AI label reading** (Gemini paid / free on a separate project / on-device Nano, or Vision OCR) — options, costs, privacy and boundaries recorded in the spec (2026-10-02); decide when this work starts.
- **English version** (spec: "Planned: English version")
- **Public launch prep:** drop the broad `spreadsheets` scope (after Picker), Google OAuth verification, store listing (app-designer wording, no medical claims)
- **Persistent web sign-in** — only with real user volume

---

## roncreator.com site
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
- **Reminder follow-ups** (2026-09-30, nice to have, not urgent): today one reminder fires per meal gap; if ignored, nothing more until the app is opened (then the overdue rule re-fires it ~5 s after opening, which may feel odd inside the app) or a meal is logged. Idea: schedule the reminder + 1–2 follow-ups (e.g. +30 and +60 min), cancelled by logging a meal, none in quiet hours, all scheduled ahead so they survive a phone restart. Open: how many / how far apart; keep or drop the re-fire on opening.
- **Reminder missed if due during a phone restart** (2026-09-30, developer's Pixel, 1.5.1 debug build): a reminder due while the phone is off/booting is silently dropped. Cause: in `@capacitor/local-notifications` 8.3.1, `LocalNotificationRestoreReceiver` skips one-shots whose time has passed as "triggered" (`isTriggered()` = `at <= now`) before its own "show what was missed while off" branch, which is never reached for one-shots. A reminder due *after* the restart is restored fine (verified: exact `RTC_WAKEUP` alarm back after unlock, fired on time without opening the app). Fix idea: patch the plugin (patch-package) so a one-shot due after the last boot started (`currentTimeMillis − elapsedRealtime`) counts as missed and is shown 15 s after boot; report upstream.
- **Reminder is easy to miss: quiet sound, no vibration** (2026-09-30): Android played the channel's default sound (`notification_alert` beep=1) at the phone's notification volume (3/7 on the Pixel), but the `meal-reminders` channel was created with vibration off. Fix idea: a new channel with vibration on (channel sound/vibration can't be changed after creation; users' manual channel tweaks would reset), maybe a more noticeable sound; check mom's notification volume at setup.
- **Test sheet in the Ukrainian locale** (2026-10-01, chore): the 1.5.3 bug only appeared in Ukrainian-locale sheets; keep a test sheet with that locale for every release check.
- **Android: two permission asks in a row feel like one failed** (2026-10-04, developer, fresh install of the 1.7.1 debug build): the system "allow notifications?" prompt appears on opening (it works — `POST_NOTIFICATIONS` granted), then after sign-in Today shows the «Будильники й нагадування» notice, which sends her to the phone's settings for the separate exact-alarm permission. Looks like the first ask didn't stick. Fix idea: one short explanation screen first, then both permissions one after the other (and the notice only if exact alarms are still off).
- **Read a product's nutrition label from a photo** (2026-10-05, developer): instead of adding Ukrainian breads to the database one by one (too many, and mom doesn't stick to one brand — she picks the rye bread with the lowest sugar on the label), let her photograph the pack's nutrition table and fill the product form from it; the 1.9 GI suggestion then offers the rye GI (checked: «Хліб житній Дарницький», «Хліб бородинський» → B0010 rye-wheat 78 / B0090 wholegrain rye 54). Needs a design: on-device text recognition vs a paid service (the Claude lookup was dropped for cost, 2026-08-13), how values are confirmed before saving, the «неперевірено» label stays.

- **Dev sign-in survives a page reload** (2026-10-05, from the governance review): every reload of the local dev server signs out, which cost about 8 extra sign-ins in one session. Idea: keep the token in `sessionStorage` in dev builds only. Needs a decision on the security trade-off; never in production builds.
- **Food entry gaps** (2026-10-06, developer; the three below 2.0.1 proposed as one release after 2.0.1, "Faster food entry"):
  - ➡️ *Placed in 2.0.1.* **Values per [n] g** in the product/dish form: packs often list nutrients per portion (e.g. per 30 g), not per 100 g. A «на … г» field next to the values; the app recalculates to per 100 g when saving, and the form shows what will be stored.
  - **Save a custom meal entry to «Страви»** for reuse: the meal editor's custom entry (restaurant food, a meal box) gets «Зберегти в мої страви». It's stored as a fixed-value dish (values per portion, weight optional), which the 2026-09-26 design already described.
  - **Maths in value fields:** e.g. `200*3/4` or «200 ккал * 3/4», to log part of a meal box. Numbers, `+ − * / ( )`, a decimal comma, unit words ignored. The field shows the result before saving, and the result is stored, not the formula.
  - **Named portion sizes** (widened 2026-10-06 from "standard portion", which was in the 2026-09-26 design notes but never placed on the roadmap): up to 3 approximate sizes per product or dish, each a label and grams, e.g. «скибка ~45 г», «маленьке / середнє / велике яблуко», «чашка ~250 г». Default labels are маленька / середня / велика, and the person can rename them. The meal editor offers them as one tap, plus a count: 2 × середнє. The grams are shown as approximate («≈»). The verified database ships typical sizes for common foods (decided 2026-10-06: people often can't weigh, and a ready estimate helps). Each size carries a source, reliability, reasoning and date like every reference value (rule 5), and is written for public readers. USDA FoodData Central lists portion weights, e.g. "1 medium apple". A person's own sizes override or add to the database's.
- ➡️ *Placed in 2.0.1 (developer, 2026-10-06).* **Values per [n] pieces** (2026-10-06, developer): many packs list nutrients per piece, or per [n] pieces (dumplings per 12), sometimes with no weight given.
  - **Item editor:** «на … г» and «на … шт.» sit side by side, with a radio button choosing which one the values are entered for (the main one, required). The other is optional and states the same amount the other way: values per 12 шт. plus 200 г means 12 шт. = 200 г. A dish's yield works the same way: a weight, a count («Вийшло 10 млинців») or both.
  - With both filled in, the item has a piece weight (200 ÷ 12 ≈ 16,7 г). Without it, the piece weight can be added later to the item, to one meal entry, or never.
  - **Meal editor:** grams and pieces are linked. Type one and the app fills in the other when the piece weight is known: 210 г → 210 ÷ (200 ÷ 12) = 12,6 шт., so weighing on scales saves counting. Counts allow decimals (7,5).
  - Every nutrient, plus GI and GL, works without weight. GL needs only GI × grams of carbs eaten. A dish's GI is already weighted by carbs, and a dish needs only the ingredients' total nutrients and its yield.
  - Only grams-based figures stay unknown without a piece weight: the meal entry's weight, and logging the item in grams.
  - Named portion sizes (above) cover foods with no fixed piece weight, such as apples.
  - Use cases that shaped it: dumplings (pack values per 12 шт.); pancakes, вареники, сирники, pieces of a cake (a dish's yield as a count); nuts (values per 100 г, with 100 г = 20 шт. counted once at home, then a snack of 3 горіхи is logged by count with no weighing).
- **Common nuts in the verified database** (2026-10-06, developer; mom eats nuts often, a few at a time): only walnuts are in it today (raw). Add almonds, pistachios, hazelnuts, cashews and peanuts, and maybe pecans, Brazil nuts, pine nuts, and sunflower and pumpkin seeds. Preparations (decided 2026-10-06): roasted, both unsalted and salted, where sources allow (salted pistachios carry far more sodium than raw); walnuts are usually eaten raw, so the existing entry stays. Proposed place: with named portion sizes, so each nut ships with the typical weight of one nut («1 мигдалина ≈ 1,2 г») and is logged by count.
- ✅ *Fixed in 2.0 build 21 (2026-10-06).* **Backup copies listed in the connect window** (2026-10-06, developer, internal-testing build): «Знайдено на вашому Google Диску» lists «Трекер харчування — копія перед синхронізацією …» files next to real sheets. Risk beyond looks: connecting one by mistake sends new saves into a copy that the device which made it moves to the trash after 14 days. Fix idea: tag each copy at creation (Drive `appProperties`, e.g. `trackmymealsBackup=1`) and leave tagged files out of the list query; for copies already made, also leave out the name prefix «Трекер харчування — копія перед синхронізацією». Proposed place: before 2.0 goes to production (build 20 if not uploaded yet, else the next build).
- **Android's back button does nothing** (2026-10-06, developer, 2.0 build 20/21 on her phone): the system back (button or gesture) does nothing on any screen, not only in the meal editor: it doesn't go to the previous screen, doesn't close the app, doesn't react at all. To find out first (on the emulator): whether it's dead from the very start or only after the meal editor has been opened (the editor registers a Capacitor `backButton` listener, `MealEditorScreen.tsx`, and the App plugin's native default may not come back after removing it), and what Capacitor 8's App plugin does with no listener. Screens are switched in React state, so the WebView has no history to go back through either: a fix needs the app's own back handling on every screen. Expected: back closes an open dialog or notice, then steps back to the previous screen (a sub-screen to its parent, another tab to Today), and on Today leaves the app. Proposed place: before 2.0 goes to production if mom uses back (she likely does), else 2.0.1.

New items land here with a one-line note, then get placed above.

---

## Released

Full text of each release and resolved intake item: [roadmap-archive.md](roadmap-archive.md).

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
