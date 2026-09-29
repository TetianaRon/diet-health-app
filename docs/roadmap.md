# Roadmap

The planner for Track My Meals / Трекер Харчування and the roncreator.com site. **This file decides what gets built and when.** The *design* of each feature lives in [technical-spec.md](technical-spec.md); the history of what was done lives in [build-log.md](build-log.md).

## How we work (since 2026-09-29)

- **Small, numbered releases.** Each release has a clear scope, its own branch (`release/x.y` or `feature/...`), and ships only when finished and checked. `main` is what's live (Vercel deploys the web app from it; Android releases are built from it).
- **New feedback goes to the Intake list first**, gets a short note, and is placed into a release or the backlog — it is **not** built on the spot. Exceptions: something live is broken, or the developer explicitly asks to do it now.
- **Statuses:** 📝 planned · 🔨 in progress · 👀 in review / testing · ✅ released · ⏸ on hold.
- **Data rules** (all releases): every value — calories, macros **and GI** — carries its source, reliability, the reasoning behind the match/choice, and a verified date. The verified food database will be **published on roncreator.com** for other users, so every entry must stand on its own and never imply a medical claim.

---

## Current and upcoming releases

### 1.5 — Reminders, blood sugar, web version · 👀 in review
Built 2026-09-28 (versionCode 8), uploaded to Play **Internal testing**.
- Meal reminder fires with the phone idle (`allowWhileIdle`) + notice when notification / exact-alarm access is missing
- Blood sugar: grouped by day, editable measurement time, today's readings editable
- Food search through the USDA proxy (key off the device); new privacy link; desktop layout (tablets)
- ✅ 1.5 installed on the developer's Pixel (2026-09-29; new screens visible).
- **To finish (next session):** on the Pixel — reminder with the app closed (re-test on 1.5), food search, blood sugar time + edit, privacy link → promote to mom's track → merge `release/1.5` into `main`.

### 1.6 — Foundations for verified data · 📝 planned
Everything the data import (1.7) and most later features stand on.
- **Verified food database format** (`src/data/`): per entry — family + state (raw / boiled / baked / canned…), Ukrainian + English names, values per 100 g, **source** (dataset + ID + description), reliability + **reasoning**, verified date; **GI with its own source** (study/table + entry), reliability, reasoning, date. Replaces the unsourced 60-item starter list (to be re-checked, not copied).
- **Item IDs** on Ingredients/Dishes + `ItemId` on meal entries; **duplicate-name check** (spec: "Label photos, drafts…" → Item IDs).
- **"Неперевірено" label + ⓘ source** everywhere a value is shown; a way to mark a user's own item as unverified.
- **New tabs added silently** (mechanism needed by 1.7's new columns and 1.8's tabs).

### 1.7 — Mom's data, verified · 📝 planned (after 1.6)
Spec rules: memory of the import decisions (2026-09-29) + the review page.
- **Database content:** every item of hers with a genuine match (~90, incl. olives black + green, trout + salmon, beef/pork heart raw + boiled, cocoa), under proper names — **plus the raw/cooked partner** of each wherever the source has both.
- **Ingredients her dishes likely need** — estimated from each dish, added to the database so she can compose them later. **Her dishes themselves are not recalculated:** her value is kept and the dish is flagged «потрібно скласти рецепт».
- **Her own sheet:** branded packaging items (her values) and values we couldn't verify (kept as she has them, marked «неперевірено»); her dishes with the flag. **Not added:** items without a genuine match and the dropped ones (кукурудза варена, гірчиця американська, тунець, fructose sweets, calculation leftovers).
- Import mechanism (how the rows get into her sheet) to be decided at the start of this release.

### 1.8 — Medicine log · 📝 planned
Spec: "Planned: medication log". Two tabs (`Medications`, `MedicationLog`), «Додати ліки» on Цукор, readings and intakes in one day list. Simple first; refine with mom while she uses it. Could move before 1.7 if she needs it sooner.

### 1.9 — Sheet detection + Google Picker · 📝 planned
Spec: "Planned: spreadsheet detection + Google Picker". Auto-detect the user's sheet, Picker for existing ones, remove the shared test-sheet fallback. Research first: Picker inside the Android WebView. Needs Google Cloud setup by the developer.

### 2.0 — Food families in the dish composer · 📝 planned
Spec: "Planned: food families with cooking states". Raw weight + state in the finished dish; carbs by mass balance, GI from the cooked state; published whole-dish GI shown only as a check. The data already exists from 1.7.

### Later (unordered)
- **Label photos + zoom → drafts (photo/name-only, loggable) → 3-day update window → Google Lens** (spec: "Label photos, drafts and the 3-day update window")
- **English version** (spec: "Planned: English version")
- **Public launch prep:** drop the broad `spreadsheets` scope (after Picker), Google OAuth verification, store listing (app-designer wording, no medical claims)
- **Persistent web sign-in** — only with real user volume

---

## roncreator.com site
- 📝 **Public food database pages** — publish the verified database (sources, reliability, reasoning) for other users. Depends on 1.6 format + 1.7 content.
- 📝 **Contact form email** — Resend account + DNS records in Cloudflare + Vercel env vars.
- 📝 **Mom's story** on the Track My Meals landing — draft privately, publish only after her approval.
- 📝 Friendly bilingual 404 page.
- ⏸ Decorative brand shapes — need dedicated design work.
- ⏸ Pomodoro Guardian: second Figma page (inner page design) not reviewed yet.

## Chores
- 📝 **After 1.5 is on mom's phone:** retire the old GitHub Pages privacy page, rename the repo to `track-my-meals`, make it private, rename the local folder (+ move Claude's notes).
- 📝 **Staging address** for signed-in branch testing (`staging` branch + fixed domain + OAuth origin) and tick **Preview** for `USDA_API_KEY` / `VITE_SPREADSHEET_ID` in Vercel.
- 📝 Review page: clear the stale кисляк objection (Г68).

## Intake (new feedback, not yet placed)
- **Android: stale screens after an update** (2026-09-29) — after installing 1.5 the app may keep showing the previous version until restarted/cache cleared; likely the PWA service worker caching inside the Capacitor build. Candidate fix: don't register the service worker in the native build. Place into the next Android release.

- 🔴 **High priority — can't switch the keyboard language inside the Android app** (2026-09-29, developer's Pixel, Gboard): in **all text fields**, long-press on the space bar opens the language list, which flickers, and the keyboard closes. Existed before 1.5. **Works in Chrome on the same phone** → specific to the Android app's WebView/Capacitor. Not reproduced yet: no app lifecycle/focus handler explains it (the "resume" listeners live only on Сьогодні; the activity config is Capacitor's default). **Next:** debug on the Pixel over USB (Chrome remote DevTools + logcat) while reproducing. Target: the next Android release, together with the stale-screens fix.
- 🔴 **Food search on the Android app** (2026-09-29, screenshots): «Кукурудза» (keyboard auto-capital) → MyMemory "Maize" → 1 USDA result (explained; fix: lowercase before translating). But lowercase «кукурудза» shows **«Не знайдено» on the phone**, while the same path from the dev laptop works ("corn" → proxy → 20 results, Android origin accepted). The app shows the same message for "no results" and for a failed request, so a hidden error on the device is likely. **Next:** reproduce during the USB debugging session (Chrome remote DevTools → Network/Console); also make the app distinguish "nothing found" from "search failed".

New items land here with a one-line note, then get placed above.

---

## Released
- ✅ **Web version live** at `track-my-meals.roncreator.com` (2026-09-28): unlisted, USDA proxy, desktop layout.
- ✅ **roncreator.com live** (2026-09-28): home + landings (EN/UA), brand from Figma, privacy policy, sticky header with project links.
- ✅ **1.4** (2026-09-26): spreadsheet structure check/repair; keys row + readable-names row.
