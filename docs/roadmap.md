# Roadmap

The planner for Track My Meals / Трекер Харчування and the roncreator.com site. **This file decides what gets built and when.** The *design* of each feature lives in [technical-spec.md](technical-spec.md); the history of what was done lives in [build-log.md](build-log.md).

## How we work

The workflow (intake → release branch → verify → release) and the standing rules are in [../CLAUDE.md](../CLAUDE.md); step-by-step procedures are in [tasks/](tasks/).

**Statuses:** 📝 planned · 🔨 in progress · 👀 in review / testing · ✅ released · ⏸ on hold.

---

## Next session — start here (set 2026-10-05)
1. **Local-first designed and proven** (2026-10-05, spec → "Local-first app"). Next: **2.0 — local-first in one release** (scope below, three internal checkpoints). Mom's data import is 2.2, after sets (2.1).
2. Chromium issue 569300356: reply sent 2026-10-05 (repro APK, videos; Chrome itself now affected too) — check for answers now and then.

## Current and upcoming releases

### 2.0 — Local-first: the device is the app · 🔨 in progress (checkpoints A, B, C done — release checks next) — spec → "Local-first app"
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

**Checkpoint C — Android without Google** · ✅ built and checked in the web app (2026-10-06; build log) — the phone parts go to the release checks
- «Почати без Google» on Android; connecting a sheet later (the first sync uploads everything).
- .xlsx backup and restore, with a reminder after 30 days. The web stays sign-in only.

**Release checks**
- Unit tests for the mapping, merge, deletions, hand-edit detection and backup round-trip.
- In the app: one request per sync instead of one per screen; using it in airplane mode on the phone, then syncing; two tabs; switching sheet; the upgrade on a dev-sheet copy of mom's layout.
- **Safeguard:** a week on Play's **internal testing** track on the developer's devices and the emulator before production. Mom gets it after that.

### 2.0.1 — Values per [n] g · 📝 planned (right after 2.0; developer, 2026-10-06 — needed in her own use)
Packs often list nutrients per portion (e.g. per 30 g), not per 100 g. The product form (add and edit) gets «Значення вказано на … г» (default 100). On saving, the app recalculates every value except GI to per 100 g, and the form shows what will be stored («Буде збережено на 100 г: …»). Stored values stay per 100 g as today, so nothing else changes.

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
**Decided 2026-10-05:** SQLite on every platform (web build proven first), hand edits in the sheet supported, deletions remove the row plus a «Видалені» tab, .xlsx backups. The web version always signs in (its local database is a copy of the sheet); working without Google and backups are Android-only. Releases: proof ✅ (spike, 2026-10-05) → 2.0 local-first in one release (reading, offline saving + sync, Android without Google + backup) → 2.1 sets, clean start and moving mom over, then 2.2 (mom's data). Free/paid is decided before the public launch. The notes below are the original idea, kept for the parts the spec doesn't cover yet (free/paid, payments).
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
- **Values per [n] pieces** (2026-10-06, developer; placement open: 2.0.1 or the release after it): many packs list nutrients per piece, or per [n] pieces (dumplings per 12), sometimes with no weight given.
  - **Item editor:** «на … г» and «на … шт.» sit side by side, with a radio button choosing which one the values are entered for (the main one, required). The other is optional and states the same amount the other way: values per 12 шт. plus 200 г means 12 шт. = 200 г. A dish's yield works the same way: a weight, a count («Вийшло 10 млинців») or both.
  - With both filled in, the item has a piece weight (200 ÷ 12 ≈ 16,7 г). Without it, the piece weight can be added later to the item, to one meal entry, or never.
  - **Meal editor:** grams and pieces are linked. Type one and the app fills in the other when the piece weight is known: 210 г → 210 ÷ (200 ÷ 12) = 12,6 шт., so weighing on scales saves counting. Counts allow decimals (7,5).
  - Every nutrient, plus GI and GL, works without weight. GL needs only GI × grams of carbs eaten. A dish's GI is already weighted by carbs, and a dish needs only the ingredients' total nutrients and its yield.
  - Only grams-based figures stay unknown without a piece weight: the meal entry's weight, and logging the item in grams.
  - Named portion sizes (above) cover foods with no fixed piece weight, such as apples.

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
