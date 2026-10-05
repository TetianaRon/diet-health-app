# Roadmap

The planner for Track My Meals / Трекер Харчування and the roncreator.com site. **This file decides what gets built and when.** The *design* of each feature lives in [technical-spec.md](technical-spec.md); the history of what was done lives in [build-log.md](build-log.md).

## How we work (since 2026-09-29)
- **Testing never waits on mom's phone** (developer, 2026-10-02): she lives separately and only reports bugs she happens to notice. Releases are checked on the developer's Pixel (USB / Play installs), the emulator, and test sheets and settings that mimic her setup (Ukrainian-locale sheet, Ukrainian Gboard). Her reports go to Intake, or are fixed at once if something live is broken.

- **Small, numbered releases.** Each release has a clear scope, its own branch (`release/x.y` or `feature/...`), and ships only when finished and checked. `main` is what's live (Vercel deploys the web app from it; Android releases are built from it).
- **New feedback goes to the Intake list first**, gets a short note, and is placed into a release or the backlog — it is **not** built on the spot. Exceptions: something live is broken, or the developer explicitly asks to do it now.
- **Statuses:** 📝 planned · 🔨 in progress · 👀 in review / testing · ✅ released · ⏸ on hold.
- **Data rules** (all releases): every value — calories, macros **and GI** — carries its source, reliability, the reasoning behind the match/choice, and a verified date. The verified food database will be **published on roncreator.com** for other users, so every entry must stand on its own and never imply a medical claim.

---

## Next session — start here (set 2026-10-04)
1. **1.7 released** (2026-10-04). **1.7.1 released** (connecting a spreadsheet). **1.8 released** (verified food database, 2026-10-05). Next: 1.9 (search, GI suggestions); sets moved to the local-first design (2.x). Earlier plan for 1.8: — verified food database:** the format (`verified-foods.json`, categories for sets, verification per part of an entry), then re-check the 57 built-in foods and the 12 cooked dishes against USDA (entry numbers already found for 10 of the 12 dishes — see 1.7), with GI from the tables; developer reviews on a review page.
2. Note from 1.6: the next Play update on the developer's phone is a chance to confirm the stale-screens fix (new version on first open).

## Current and upcoming releases

### 1.5 — Reminders, blood sugar, web version · ✅ superseded by 1.5.1
Built 2026-09-28 (versionCode 8), uploaded to Play **Internal testing**.
- Meal reminder fires with the phone idle (`allowWhileIdle`) + notice when notification / exact-alarm access is missing
- Blood sugar: grouped by day, editable measurement time, today's readings editable
- Food search through the USDA proxy (key off the device); new privacy link; desktop layout (tablets)
- ✅ 1.5 installed on the developer's Pixel (2026-09-29; new screens visible).
- **Not promoted to mom** — superseded by 1.5.1, which includes everything here. Its remaining checks move to 1.5.1's test list.

### 1.5.1 — Android fixes: keyboard, food search, stale screens · ✅ released 2026-09-30
Branch `release/1.5.1` from `release/1.5` (1.5 isn't in `main` yet); versionCode 9, versionName "1.5.1". Causes were found on 2026-09-30 (see Intake history below).

**1. Keyboard language switch closes the keyboard** 🔴
- (a) Our own WebView subclass (`KeyboardFriendlyWebView extends CapacitorWebView`) swapped in by overriding Capacitor's `capacitor_bridge_layout_main.xml` in `android/app/src/main/res/layout/`. It doesn't pass "window lost focus" to Chromium while the keyboard is open (the IME's own popup took focus), so the WebView doesn't hide the keyboard. Every other focus change is passed through unchanged.
- (b) ✅ Reported to Chromium 2026-10-04: [issue 569300356](https://issues.chromium.org/issues/569300356) (component Mobile > WebView). Keep (a) until a fixed WebView is widespread; check the issue now and then. **Follow-up 2026-10-05:** Google asked for an APK, a video and device details; replied with a minimal repro app (plain WebView, built outside the repo), two videos, logs and device details. Found while answering: on the developer's Pixel, **Chrome itself** (154.0.8037.92) and Chrome Custom Tabs (e.g. a Claude artifact opened from the Claude app) now have the bug too, with the same client-side hide request. The likely change is Gboard 18.3.2 → 18.4.1 (4 Oct), not confirmed. Our workaround (a) still covers our app; the web version in Chrome is affected and only a Chromium fix can help there.

**2. Food search says «Не знайдено» when the search actually failed** 🔴
- Lowercase and trim the query before translating (`trim().toLocaleLowerCase("uk")`): «Кукурудза» → "Maize" → 1 result is the auto-capital problem; Gboard also leaves a trailing space («Кукурудза »). *Confirmed on the developer's Pixel 2026-09-30: lowercase → "corn" → many results; capitalised → "Maize".*
- Tell failure apart from "nothing found": `lookupExternalCandidates` returns a distinct "unavailable" result when translation or the USDA proxy fails; the screen shows a new message (in `uk.ts`), e.g. «Пошук зараз недоступний — спробуйте пізніше або введіть дані вручну.», instead of «Не знайдено».
- Spend less of the free MyMemory quota: remember translations on the device (query → English, English candidate → Ukrainian), so repeated searches and repeated candidates cost nothing. Unit tests for the lowercase + result kinds.
- **Results layout (developer, 2026-09-30):** only the **top 5** USDA matches are translated and shown as now; the remaining matches follow in a **muted, English-only list** (still selectable), under a note that they aren't translated and that a more specific search word (e.g. «кукурудза варена» rather than «кукурудза») brings closer matches to the top. Cuts translation use from ~21 to ~6 requests per search.
- **English queries skip translation:** a query in Latin letters goes straight to USDA (today it's still sent through the uk→en translator, wasting quota). Only the back-translation of the top 5 names uses the translator, and that is skipped when the limit is reached.
- **Limit notice above the search box** — it's the *translation* that is limited, not the search (developer, 2026-09-30). The free service doesn't tell us how much is left, so we can't warn in advance. As soon as a response says the daily limit is used up (`quotaFinished` / "MYMEMORY WARNING"), the app remembers it for the rest of the day and shows a notice **before the search box**, e.g. «Переклад назв продуктів сьогодні недоступний. Ви можете шукати англійською (наприклад, "corn") або ввести дані вручну.» While it's shown, a Ukrainian query isn't sent to the translator at all (the app says it needs an English word), and results appear in English only. The notice disappears the next day.
- *Decision for the developer:* MyMemory raises its free daily quota when requests carry a contact email (`de=`). Option: send the forwarding-only project address (info@roncreator.com), never the user's own email. Not included unless approved.

**3. Old screens after an update**
- Don't use the PWA service worker inside the Android app: register it only on the web (`Capacitor.isNativePlatform()` check, `injectRegister: null` in `vite.config.ts` + manual registration in `main.tsx`), and in the native app **unregister any existing worker** and clear its caches once, since installed phones already have one. The web version keeps its offline/installable behaviour.

**Device results (2026-09-30, developer's Pixel 10, debug build 1.5.1):** ✅ keyboard language switch works; ✅ «Кукурудза» gives many results, top 5 translated, English search, offline → "unavailable"; ✅ blood sugar time + edit; ✅ privacy link; ✅ reminder with the app closed, and after a restart without opening the app (two new reminder issues → Intake). Released to Play (internal testing; mom's phone updates automatically) and merged into `main` on 2026-09-30. Web build checked locally (app loads, service worker registered by the app, no console errors). ✅ Play install on the developer's Pixel (2026-10-01): keyboard switch works, search shows the top 5 translated + the rest in English. Fix 3 (no stale screens): checked on the developer's own Play updates (does the new version show on first open?), not on mom's phone.

**Tests (Pixel over USB + emulator):**
- Keyboard: long-press space → switch language in Settings, Продукти search, meal editor and blood sugar fields; then check nothing else broke: keyboard hides on leaving a field, app switching with the keyboard open, Google sign-in window, the notification-permission dialog.
- Search: «кукурудза», «Кукурудза», «морква»; offline → "unavailable" message; `npm test`.
- Update: install 1.5 → open → install 1.5.1 over it → new screens show at once (no restart/cache clear).
- 1.5 checks: reminder with the app closed, blood sugar time + edit, privacy link.

### 1.5.2 — Translation via Google Cloud · ✅ released 2026-10-01
Replaces the free MyMemory service, whose small daily limit (5,000 characters, anonymous) caused the «Не знайдено» day. Decided 2026-09-30; simple version first, no per-user accounts.
- **Google Cloud Translation through our server:** new `api/translate.js` on Vercel, next to `api/usda.js`; the API key lives only in Vercel env vars, never in the app. Same origin allow-list as the USDA proxy; a maximum text length and at most ~6 texts per request (the query + the top 5 names), so one call can't use much.
- **Google-side safety (developer sets up, Claude walks through it):** enable billing + the Cloud Translation API on the Google Cloud project; a **daily quota cap of 15,000 characters** (500,000 free per month ÷ 31), which actually stops requests, so we never pay; plus a **budget alert** as an early warning (budgets alone don't stop anything). Check Google's current pricing page first.
- **Per-device daily limit in the app:** a counter in local storage (characters translated today + date), works the same in the Android app and in the browser; at **2,000 characters/day** translation stops and the 1.5.1 notice appears («Переклад назв продуктів сьогодні недоступний…»). Translations remembered on the device (from 1.5.1) don't count. Not tamper-proof by design: the Google cap is the real guarantee; a sign-in-based per-user limit can come later if abuse ever appears.
- **When either limit is hit:** the same notice + English-only search as in 1.5.1.
- **Privacy policy** (roncreator.com, EN + UA): Google Cloud Translation replaces MyMemory; still only food names are sent.
- **Record in `build-log.md`:** why MyMemory was picked originally (live-test quick fix, no server back then, avoiding costs) and that its limit wasn't checked, especially after per-result back-translation multiplied usage ~20×.
- **Result (2026-10-01):** live on the web and released to Play. Verified: live endpoint (site + Android origins work, other sites refused), the Android build on the emulator against it (2 translation requests per search instead of 21), developer tested the web search. Budget alert at $1 set; the API key kept (it was shown once in a session transcript — restricted to Translation and capped, developer chose to keep it). Privacy policy updated on roncreator.com (also corrects the Android sign-in token wording).

### 1.6 — Item IDs, sheet upgrade, notifications · ✅ released 2026-10-04
**Why first (decided 2026-10-01):** the sheet links everything **by name** today — dish recipes list ingredient names, meal rows only carry the item name, edits find rows by name. The verified database (1.7) renames items to proper names, which would cut every dish off from its ingredients unless links go by ID first; mom's data import (1.8) writes rows that need IDs and labels too. The database *file* can be prepared alongside, but its renamed content ships only after this.
Full design: spec → "Item IDs and the sheet upgrade (release 1.6)".
- **IDs that never change and are never reused:** built-in items `B0001…` (fixed in the app's data files; retired ones point to their replacement), the user's items `I1, I2…` (Ingredients) and `D1, D2…` (Dishes), numbered within her sheet. Names stay labels only.
- **Sheet:** `Id` + `BasedOn` on Ingredients and Dishes, `ItemId` in DailyLog, ingredient IDs inside dish recipes; edits, favourites and flags find rows by ID.
- **Lossless, silent upgrade** of existing sheets: new columns/tabs added and IDs filled in without asking (only blank cells are written); recipe ingredients resolved from names to IDs, with unresolved ones reported, never dropped.
- **Duplicate-name check** when naming an item: «Це він — використати наявний» / «Це інший — назвати «… 2»».
- Test on a copy of mom's sheet (the dev sheet) before release.
- **Added during testing (2026-10-04):** read-limit fix (one batch read per check, automatic retry on 429, Ukrainian message); a one-time note after a silent upgrade (what changed + Файл → Історія версій); **one notification standard** — toasts in a single non-overlapping queue, info closes itself, action stays (spec → "App notifications").

### 1.7 — Daily records: medicine, weight, new Today · ✅ released (2026-10-04, Play + web) — mom's request (2026-10-04)
Mom asked to log the medicine she takes alongside blood sugar, and her weight, as soon as possible; the developer adds a UX update so the day reads as one surface. Full design: spec → "Daily records and the new Today (release 1.7)".
- **Navigation:** Сьогодні | Історія | Страви (Settings stays on the gear); the separate Цукор screen goes.
- **Сьогодні:** daily status bars (calories, GL, other limits switched on) → **weight bar** (one weight per day, date only; latest vs the 30-day average; vs the previous measurement when there are fewer than 3 in 30 days; neutral styling) → **records** (blood sugar + medicine in one timeline, one «+ Додати» with a Цукор / Ліки choice in the form, pencil icons for editing; yesterday's last medicine, small, read-only) → **meals** (today's, editable; yesterday's as a compact read-only list of all meals with times and totals).
- **Order toggle** «Спочатку нові» / «Спочатку старі» on the screen itself (default newest first, so yesterday's records sit at the bottom); each screen (Сьогодні, Історія) has its own; saved on the device, not in the sheet.
- **Історія:** read-only, per day — totals, sugar, medicine, weight, meals; 14 days + «Показати ще».
- **Страви:** dishes as the main tab, products secondary.
- **Medicine:** her medicine list (name, usual dose, unit; new one addable from the intake form) + intakes (time editable, dose pre-filled). A diary only — no dose suggestions or warnings.
- **New tabs** `Medications`, `MedicationLog`, `Weight` — added silently (1.6 mechanism) with the one-time upgrade note.
- Tests on the developer's devices / emulator / a Ukrainian-locale test sheet (not mom's phone).

### 1.7.1 — Connecting a spreadsheet · ✅ released (2026-10-04, Play + web)
Simplify the spreadsheet part of Settings and detect the user's sheet. Design: spec → "Connecting a spreadsheet (release 1.7.1)".
- **Settings:** the connected sheet (link + copy-link icon) and «Підключити іншу таблицю»; with none, just «Підключити таблицю».
- **The connect window:** sheets found in her Google Drive (made by the app) → create a new one → sheets connected before on this device (stored only on the device) → built-in sheets (mom's, test, dev) shown only to accounts that can open them → paste a link.
- **No more test-sheet fallback:** without a connected sheet the app says so and offers «Підключити таблицю».
- Brings forward the detection part of 2.1; the Google Picker stays in 2.1.

### 1.8 — Verified food database · ✅ released (2026-10-05, Play + web) — spec → "Verified food database"
*Done:* 96 entries (69 built-in items + types, durum pasta, mashed potatoes, kefir 2.5%) reviewed and accepted in five rounds; the app reads the database (built-in cooked foods are products, no built-in dishes), ⓘ per product, «неперевірено» on her own/changed items, one-time update offer for unchanged saved copies (products and old dish copies), dish GI keeps counting with a small unknown-GI share (≤5% of carbs), USDA-search GI fill-in from the database. Details: build log 2026-10-04/05.
- **Categories in the format** (developer, 2026-10-04): every entry belongs to a category (Крупи, Овочі, Молочні продукти…), so the database can be offered as **sets** (local-first design, 2.x). The file stays the single source for the app and the public pages.
- **Format** (`src/data/verified-foods.json`, also the source of the public pages on roncreator.com later): per entry the permanent `B` ID, family + state (raw / boiled / baked / canned…), Ukrainian + English names, values per 100 g, **nutrient source** (dataset + entry ID + description + version), **GI with its own source** (table + entry), reliability (high / medium / low) + **reasoning in Ukrainian and English**, verified dates. An automatic test refuses any entry missing a source, reliability, reason or date.
- **The 12 built-in cooked dishes** (Гречка варена … Нут варений, `starter-dishes.ts`) are estimates too: raw built-in values ÷ a cooked-weight factor whose source wasn't recorded, GI from an uncited audit (known weak: pearl barley 25 vs 58, millet from the 1981 study). Replace them with USDA's **measured cooked entries** (e.g. "Buckwheat groats, roasted, cooked"), with entry IDs; keep the yield calculation only as a cross-check. Their `B` IDs then point to the replacements (developer's question, 2026-10-04). *Quick USDA check the same day:* 10 of 12 have SR Legacy measured cooked entries (buckwheat #170686, white rice #168878, brown rice #169704, oats with water #173905, millet #168871, pearl barley #170285, pasta #169751/#172014, kidney beans #173792, lentils #172421, chickpeas #173757); our computed carbs match where compared (buckwheat 19.9, white rice 28.2), so the yield factors likely came from these — the work is recording sources properly and choosing variants (salted/unsalted). *Resolved in review (2026-10-05):* semolina porridge = USDA unsalted farina porridge (farina is the same soft-wheat крупа as манка); corn porridge = yellow corn grits (кукурудзяна крупа is grits).
- **The 60 built-in foods re-checked**, not copied: USDA lookups (raw + cooked where the source has both), GI from the tables with reliability; the developer reviews the result on a review page; renamed to proper names (safe after 1.6).
- **Saved copies of built-in items keep their old values** when the built-in values are corrected (they're her rows, `BasedOn = B…`, e.g. made by tapping ★). Decide how to offer the update — e.g. a one-time «Для «Гречка суха» є уточнені значення — оновити вашу копію?» for copies whose values she didn't change herself (developer's question, 2026-10-04).
- **Verification is per part, not per item** (developer, 2026-10-01): an entry can have checked nutrients but no known GI, or GI from a weaker source — each part (nutrients, GI, later others) carries its own source, reliability and status, and an entry may be incomplete (e.g. GI «немає даних»). The app and the public pages show exactly what is verified; nothing is called "verified" as a whole. That's also why IDs carry the prefix `B` (built-in), not a status.
- **ⓘ** next to every built-in value (source, reliability, reason, date) and **«неперевірено»** on everything not from the database (the user's own items, edited copies).
- ✅ *Decided 2026-10-04:* low-carb vegetables get a conventional GI 15 labelled «умовне»; cooked forms use USDA's unsalted entries; GI from the **2021** tables (2008 only as a fallback).

### 1.8.1 — Hotfix: meal editor's Cancel and breadcrumb · ✅ released (2026-10-05, Play + web) — developer's bug report
- On the phone, with an unsaved meal, Cancel and the breadcrumb seemed dead: the "discard changes?" question appeared off-screen (and not at all from the add/edit-dish steps). It's now a centred dialog, from every step; deleting a meal asks the same way. Build log 2026-10-05.

### 1.9 — Search and GI suggestions · 🔨 in progress (started 2026-10-05) — spec → "Search and GI suggestions"
Only what works the same wherever her data lives (the database is bundled in the app); everything tied to storage — sets, a clean start, database updates from a server — moved to the local-first design (2.x), so it's built once (developer, 2026-10-05).
- **Search: our database first (in Ukrainian, no translation needed), then USDA.** Fewer paid translations; works for a free version. Types grouped by family in results (rice → basmati, parboiled…).
- **Suggest the GI for the user's own items** (developer, 2026-10-05): packaged foods come with nutrients on the pack, but no GI. When she adds or edits an item (e.g. pasta with the values from its pack), the app recognises the matching database entry (e.g. «Макарони з твердої пшениці») and offers its GI, with ⓘ (source, reliability, range), for her item. Her dishes made from it then get a GI by themselves. Uses the same matching as the search.
- **Deleting her products and dishes** (developer, 2026-10-05, found while testing — there was no delete at all): removes the row, warns it can't be undone from the app; a product used in dishes points her to edit those dishes first.
- **Database additions shipped with the app:** coffee (see Intake), Ukrainian breads (батон, бородинський…) if wanted — same sources and review as 1.8.

### 2.0 — Mom's data, verified · 📝 planned (after 1.9)
Her import was planned as "add the sets she needs + her own items"; sets now come with local-first (2.x), so decide at the start of this release: import before local-first (verified items into the bundled database, her own items into her sheet) or after it (as sets).
Spec rules: memory of the import decisions (2026-09-29) + the review page.
- **Database content:** every item of hers with a genuine match (~90, incl. olives black + green, trout + salmon, beef/pork heart raw + boiled, cocoa), under proper names — **plus the raw/cooked partner** of each wherever the source has both.
- **Ingredients her dishes likely need** — estimated from each dish, added to the database so she can compose them later. **Her dishes themselves are not recalculated:** her value is kept and the dish is flagged «потрібно скласти рецепт».
- **Her own sheet:** branded packaging items (her values) and values we couldn't verify (kept as she has them, marked «неперевірено»); her dishes with the flag. **Not added:** items without a genuine match and the dropped ones (кукурудза варена, гірчиця американська, тунець, fructose sweets, calculation leftovers).
- Import mechanism (how the rows get into her sheet) to be decided at the start of this release.

### 2.1 — Google Picker · 📝 planned
Spec: "Planned: spreadsheet detection + Google Picker". Detection and removing the test-sheet fallback moved to 1.7.1; left here: the Picker for sheets the app didn't create (replaces pasting a link), then dropping the `spreadsheets` scope. Research first: Picker inside the Android WebView. Needs Google Cloud setup by the developer.

### 2.2 — Food families in the dish composer · 📝 planned
Spec: "Planned: food families with cooking states". Raw weight + state in the finished dish; carbs by mass balance, GI from the cooked state; published whole-dish GI shown only as a check. The data already exists from 1.8/2.0.
- **Dry products get their GI through the family** (developer, 2026-10-05): until 2.2, dry grains, pasta and legumes carry the GI of their cooked form (labelled «після варіння»), so dishes composed from pack values keep a GI. With families, the composer asks how the product is cooked and takes the GI from the family's cooked entry; the dry entries then stop storing a GI of their own (one source per value).

### 2.x — Local-first app, free and paid versions · 💡 idea, design needed (developer, 2026-10-04)
Prompted by the read-limit errors (429) in the 1.6 test. Not scheduled — needs its own design before any building.
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
- ➡️ *Placed in 1.5.1.* **Android: stale screens after an update** (2026-09-29) — after installing 1.5 the app may keep showing the previous version until restarted/cache cleared; likely the PWA service worker caching inside the Capacitor build. Candidate fix: don't register the service worker in the native build. Place into the next Android release.

- ➡️ *Placed in 1.5.1.* 🔴 **High priority — can't switch the keyboard language inside the Android app** (2026-09-29, developer's Pixel, Gboard): in **all text fields**, long-press on the space bar opens the language list, which flickers, and the keyboard closes. Existed before 1.5. **Works in Chrome on the same phone** → specific to the Android app's WebView/Capacitor. Not reproduced yet: no app lifecycle/focus handler explains it (the "resume" listeners live only on Сьогодні; the activity config is Capacitor's default). **Next:** debug on the Pixel over USB (Chrome remote DevTools + logcat) while reproducing. Target: the next Android release, together with the stale-screens fix.
  - *Emulator, 2026-09-30 (Pixel 10 AVD, Android 17, Gboard EN + UK, debug build):* **not reproduced** — long-press on space in the app (Settings field signed out; Продукти search signed in) opens «Змінити клавіатуру», it stays open, and switching works; no focus/blur/visibility events fire. So it depends on something on the real phone: its Android/WebView/Gboard version, the release (Play) build, or a specific screen. Next: Pixel over USB with the same event logger; note the phone's Android + Gboard versions.
  - ✅ **Cause found (2026-09-30, developer's Pixel 10 over USB, debug build, Java debugger):** reproduced. Gboard's «Змінити клавіатуру» list is its own dialog window, so opening it takes window focus from the app. **Android System WebView** reacts to losing window focus by hiding the keyboard (`WebView.onWindowFocusChanged(false)` → Chromium `ImeAdapterImpl.onWindowFocusChanged` → `InputMethodManager.hideSoftInputFromWindow`), and hiding the keyboard closes the list with it: the "flicker". Not our JS (no blur fires) and not Capacitor. Phone: Android 16, WebView 154.0.8037.57, Gboard 18.3; the emulator (WebView 149, Gboard 18.0, Android 17) doesn't do it, so it's likely a recent WebView change; Chrome itself isn't affected. **Fix options (1.5.1):** (a) our own WebView subclass (override Capacitor's `capacitor_bridge_layout_main` layout) that doesn't pass the focus loss to Chromium while the keyboard is open, needs careful testing (app switching, dialogs); (b) report to Chromium and wait for a WebView update, unreliable for mom's phone. Recommended: (a) + (b).
- ➡️ *Placed in 1.5.1.* 🔴 **Food search on the Android app** (2026-09-29, screenshots): «Кукурудза» (keyboard auto-capital) → MyMemory "Maize" → 1 USDA result (explained; fix: lowercase before translating). But lowercase «кукурудза» shows **«Не знайдено» on the phone**, while the same path from the dev laptop works ("corn" → proxy → 20 results, Android origin accepted). The app shows the same message for "no results" and for a failed request, so a hidden error on the device is likely. **Next:** reproduce during the USB debugging session (Chrome remote DevTools → Network/Console); also make the app distinguish "nothing found" from "search failed".
  - *Emulator, 2026-09-30:* lowercase «кукурудза» works in the app (→ "corn" → 20 results, shown correctly). **Likely cause on the phone: MyMemory's free daily quota.** Every search makes ~21 MyMemory calls (1 to translate the query + 1 back-translation per result), and the anonymous quota is small, so a few test searches can use up the day. When the quota runs out MyMemory still answers 200 with a "MYMEMORY WARNING" text; `translate()` returns null → `lookupExternalCandidates` returns `[]` → «Не знайдено». Fix ideas for 1.5.1: lowercase the query; tell "translation unavailable" apart from "nothing found"; back-translate lazily or cache back-translations; consider adding an email to MyMemory requests (raises the free quota) or a server-side translation cache in the proxy.

- **Reminder follow-ups** (2026-09-30, nice to have, not urgent): today one reminder fires per meal gap; if ignored, nothing more until the app is opened (then the overdue rule re-fires it ~5 s after opening, which may feel odd inside the app) or a meal is logged. Idea: schedule the reminder + 1–2 follow-ups (e.g. +30 and +60 min), cancelled by logging a meal, none in quiet hours, all scheduled ahead so they survive a phone restart. Open: how many / how far apart; keep or drop the re-fire on opening.

- **Reminder missed if due during a phone restart** (2026-09-30, developer's Pixel, 1.5.1 debug build): a reminder due while the phone is off/booting is silently dropped. Cause: in `@capacitor/local-notifications` 8.3.1, `LocalNotificationRestoreReceiver` skips one-shots whose time has passed as "triggered" (`isTriggered()` = `at <= now`) before its own "show what was missed while off" branch, which is never reached for one-shots. A reminder due *after* the restart is restored fine (verified: exact `RTC_WAKEUP` alarm back after unlock, fired on time without opening the app). Fix idea: patch the plugin (patch-package) so a one-shot due after the last boot started (`currentTimeMillis − elapsedRealtime`) counts as missed and is shown 15 s after boot; report upstream.
- **Reminder is easy to miss: quiet sound, no vibration** (2026-09-30): Android played the channel's default sound (`notification_alert` beep=1) at the phone's notification volume (3/7 on the Pixel), but the `meal-reminders` channel was created with vibration off. Fix idea: a new channel with vibration on (channel sound/vibration can't be changed after creation; users' manual channel tweaks would reset), maybe a more noticeable sound; check mom's notification volume at setup.

- ➡️ *Placed in 1.7.1 (the button is replaced by the connect window).* **«Підключити мамину таблицю» points to her old sheet** (2026-10-01): mom created a new sheet via the app; the button (`VITE_DEFAULT_SPREADSHEET_ID` / build-time ID) still opens the old one. Decide which sheet is hers going forward; ties into 2.0 (sheet detection + Picker), which removes these build-time IDs anyway.
- **Test sheet in the Ukrainian locale** (2026-10-01, chore): the 1.5.3 bug only appeared in Ukrainian-locale sheets; keep a test sheet with that locale for every release check.

- ✅ *Fixed in 1.5.4.* **Web: after the sign-in expires, the app just fails to reach the sheet** (2026-10-01, developer): a web page left open past the ~1-hour Google access token keeps acting signed in, but every sheet request fails, with no prompt to sign in again. Likely cause: on a 401 `authorizedFetch` tries `refreshAccessToken()`, which is a no-op on the web (no refresh token there by design), then throws a generic error while the UI still shows the user as signed in. Fix idea: on a web 401, first try a silent new token from Google Identity Services (no popup if the Google session is still active); if that fails, switch the app to signed-out and show «Увійти через Google» with a short note instead of failing quietly.
- **Android: two permission asks in a row feel like one failed** (2026-10-04, developer, fresh install of the 1.7.1 debug build): the system "allow notifications?" prompt appears on opening (it works — `POST_NOTIFICATIONS` granted), then after sign-in Today shows the «Будильники й нагадування» notice, which sends her to the phone's settings for the separate exact-alarm permission. Looks like the first ask didn't stick. Fix idea: one short explanation screen first, then both permissions one after the other (and the notice only if exact alarms are still off).
- **Database: add coffee** (2026-10-05, developer — mom drinks it every morning): black coffee from USDA (practically no carbohydrate → GI «не застосовується»); check how she takes it (milk, sugar, instant or brewed) — with milk or sugar it's coffee + those as separate items, or a ready entry per way if USDA/the GI tables have it. Placed in 1.9 (database additions shipped with the app).
- **Read a product's nutrition label from a photo** (2026-10-05, developer): instead of adding Ukrainian breads to the database one by one (too many, and mom doesn't stick to one brand — she picks the rye bread with the lowest sugar on the label), let her photograph the pack's nutrition table and fill the product form from it; the 1.9 GI suggestion then offers the rye GI (checked: «Хліб житній Дарницький», «Хліб бородинський» → B0010 rye-wheat 78 / B0090 wholegrain rye 54). Needs a design: on-device text recognition vs a paid service (the Claude lookup was dropped for cost, 2026-08-13), how values are confirmed before saving, the «неперевірено» label stays.

New items land here with a one-line note, then get placed above.

---

## Released
- ✅ **1.6** (2026-10-04): permanent item IDs (built-in `B…`, the user's `I…`/`D…`), linked copies of built-in items, recipe ingredient IDs, meal `ItemId`; silent lossless sheet upgrade with a one-time note; duplicate-name check; one notification standard (toast queue); read-limit fix (batch reads, retry on 429).
- ✅ **1.5.4** (2026-10-04): when the Google sign-in expires (~1 h on the web; a dead refresh token on Android) a banner asks to sign in again instead of requests failing silently; screens keep what's on them and reload after signing in.
- ✅ **1.5.3** (2026-10-01): urgent fix — decimals (blood sugar 6.2, carbs, GL, settings) read as 0 from Ukrainian-locale sheets; the app now reads stored values instead of display text.
- ✅ **1.5.2** (2026-10-01): Google Cloud Translation through our own `api/translate`, 15,000 characters/day project cap (inside the free tier), 2,000/day per device, translations remembered on the device.
- ✅ **1.5.1** (2026-09-30): keyboard language switch, food search (capitals, failures, translation limit, top-5 layout), no service worker in the Android app. Includes 1.5 (reminders while idle, blood sugar time + editing, USDA proxy, privacy link, desktop layout).
- ✅ **Web version live** at `track-my-meals.roncreator.com` (2026-09-28): unlisted, USDA proxy, desktop layout.
- ✅ **roncreator.com live** (2026-09-28): home + landings (EN/UA), brand from Figma, privacy policy, sticky header with project links.
- ✅ **1.4** (2026-09-26): spreadsheet structure check/repair; keys row + readable-names row.
