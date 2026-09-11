# Technical Spec

> **Status:** 🟢 All four screens built, Android app built/signed/tested, interview completed 2026-09-07 (targets tuned from her answers) — see [requirements-open-questions.md](requirements-open-questions.md) for the interview record and `docs/build-log.md` for the full build history.

## Architecture

```
┌─────────────────────────────┐
│   PWA (React + Vite + TS)   │  installable on mobile + Windows desktop
│   src/lib/sheets.ts  ───────┼──► Google Sheets API v4 (user's own OAuth token)
│   src/lib/nutrition.ts ─────┼──► 1. bundled starter data (src/data/starter-foods.ts) — checked first
│                             │    2. USDA FoodData Central API — only if not in the bundle
└─────────────────────────────┘
```

- Single codebase serves phone browser, "Add to Home Screen" (mobile), and "Install app" (Windows desktop) — same PWA, no separate native build.
- Google Sheets is both the database and the sync layer: any signed-in device reads/writes the same spreadsheet.
- No serverless proxy needed for nutrition lookup: USDA FoodData Central is a free public-data API with no billing risk, so it's safe to call directly from the browser with its API key (unlike the Anthropic key, which the earlier design had to hide server-side).

## Google Sheets structure

Spreadsheet ID stored in `VITE_SPREADSHEET_ID`. Tabs:

**Schema resilience:** two independent mechanisms keep an existing spreadsheet readable across app releases and manual edits, without any version-tracking or migration-script system:
1. **Additive-only columns** — every schema change so far has appended new trailing columns (Favorite, GlycemicFlag, GiVerified, MealId), never inserted or removed one; a missing cell parses to a safe default. See the `dev-feedback-patterns` memory.
2. **Header-name-based column resolution** (`src/lib/sheetRow.ts`, added 2026-09-11) — `ingredients.ts`/`dishes.ts`/`dailyLog.ts`/`bloodSugar.ts` read/write each row by looking up the *actual* column position of each header name in row 1, not a fixed index. This makes a **reordered** sheet — a deliberate future schema change, or someone manually dragging a column in the Sheets UI — parse correctly too, which positional reads couldn't handle. (`settings.ts` never needed this: it's already key/value rows keyed by matching column A's text against a known key, not position.) Every `rowToX`/`xToRow` function takes an optional `columnIndex` param defaulting to each module's own canonical header order (`INGREDIENTS_HEADERS`/`DISHES_HEADERS`/`DAILY_LOG_HEADERS`/`BLOOD_SUGAR_HEADERS`, also imported by `spreadsheetInit.ts` so the header list is defined once, not duplicated) — real reads/writes always fetch and pass the live sheet's actual current header row instead.

### Ingredients
Raw foods only — always the uncooked/unprepared state, values per 100g. Anything requiring cooking or preparation belongs in Dishes instead (see below), even a single-ingredient one like cooked rice — cooking changes carbs/100g too much (water dilution) to treat as the same row. `GI` here is carried over from the food's published GI (which is normally measured on the cooked/eaten form) purely so Dishes has a value to pull from when computing a prepared dish's GI — it's not claiming the raw form itself has been measured.

| Column | Notes |
|---|---|
| NameUk | Ukrainian name — the primary label, always shown to mom |
| NameEn | English name (used to query USDA). Also shown in the UI as a subtle, secondary line next to NameUk — not something mom needs to read, but a visible fallback/cross-check so any variant detail (fat %, cut, etc.) that didn't make it into the Ukrainian name is still there for the developer or a translator to catch, per the dairy fat-% gap found in testing |
| Carbs_g | |
| GI | Glycemic Index — from the bundled static table, not an API (see below) |
| Fiber_g | |
| Sugars_g | |
| Protein_g | |
| Fat_g | |
| Calories_kcal | |
| Sodium_mg | |
| Source | `starter` (bundled), `usda` (fetched), or `manual` |
| DateAdded | ISO date |
| Favorite | `TRUE`/`FALSE` — marks an ingredient for quick access; favorited ingredients sort to the top wherever Ingredients are browsed or picked from (the main Foods list, and the ingredient picker when composing a custom Dish). Appended as the last column rather than inserted mid-schema, so existing rows need no migration — a blank cell reads as not-favorited |
| GlycemicFlag | `none` / `watch` / `avoid` — mom's own manual "should I be careful with this" marker, independent of GI/GL. See "Glycemic flag (watch/avoid)" below. Appended as column N, same additive pattern as Favorite — a blank cell reads as `none` |

### Dishes
Anything requiring preparation — from a single cooked ingredient (e.g. "Гречка варена") to a real multi-ingredient recipe (e.g. borscht) — auto-computed from Ingredients, never hand-typed. This is the counterpart to Ingredients being *always raw*: a food that changes meaningfully when cooked (grains/legumes absorbing several times their dry weight in water) belongs here, not as a separate "cooked" Ingredients row. Values are **per 100g of the finished/cooked product**, matching Ingredients' per-100g convention — mom logs a dish by portion grams exactly like an ingredient.

Schema is deliberately kept consistent with Ingredients: `NameUk`/`NameEn` first and `Source`/`DateAdded` last match exactly, same nutrient column names in between — only `IngredientsJson`/`YieldGrams` are Dish-specific, inserted in the middle.

| Column | Notes |
|---|---|
| NameUk | Ukrainian, shown to mom |
| NameEn | English label — like Ingredients, shown as a subtle secondary line in the UI, not something mom needs to read |
| IngredientsJson | `[{nameUk, grams}]` — raw ingredient names (must match an Ingredients row) and the raw grams used |
| YieldGrams | Total finished weight after cooking (e.g. 100g dry buckwheat → ~360g cooked). This is what makes per-100g values correct — cooking water adds mass but no calories |
| Carbs_g … Sodium_mg | Computed: `Σ(ingredient_nutrient_per_100g × grams_used / 100) / YieldGrams × 100` |
| GI | Computed as a **carb-contribution-weighted average** of the ingredients' GI (`Σ(carb_contribution_i × GI_i) / Σ(carb_contribution_i)`) — an approximation, not a lab-measured value (true GI isn't simply additive), but the standard practical simplification when no GI database entry exists for the exact prepared dish. For a single-ingredient dish this reduces to that ingredient's own GI. |
| Source | `starter` (bundled) or `manual` (custom-composed, once that feature exists) |
| DateAdded | ISO date |
| GlycemicFlag | `none` / `watch` / `avoid` — same three states as Ingredients, but set **independently**: a dish's own flag is never overwritten by its ingredients' flags. Appended as column O. See "Glycemic flag (watch/avoid)" below |

Implemented in `src/lib/dishes.ts` (`computeDishNutrition`, pure and unit-tested).

### DailyLog
Every meal entry — one row per logged item (an ingredient or dish portion).

| Column | Notes |
|---|---|
| Timestamp | |
| MealType | Сніданок / Обід / Вечеря / Перекус |
| ItemName | ingredient or dish name |
| PortionGrams | |
| Carbs_g … Sodium_mg | computed for the portion |
| GL | computed: `GI × Carbs_g / 100` |
| Notes | |
| MealId | Ties multiple item-rows eaten in one sitting together as a single meal *occasion*, distinct from MealType — added 2026-09-11 per mom's real-usage feedback: MealType alone can't tell two same-day snacks apart, and without a shared identifier a multi-dish meal only ever displayed as several unrelated items instead of one meal with a combined total. Generated once per "add meal" form session (`AddLogEntryForm` in `TodayScreen.tsx`) and reused across every item saved in that session; a fresh form open (after "Зберегти запис") starts a new meal. Additive column (same pattern as Favorite/GlycemicFlag elsewhere) — a blank cell (rows logged before this existed) falls back to that row's own Timestamp, so old rows each remain their own single-item meal exactly as they already behaved. See `groupIntoMeals()` in `src/lib/dailyLog.ts`. |

### BloodSugar
| Column | Notes |
|---|---|
| Timestamp | |
| ValueMmolL | |
| Context | fasting / after-meal / other |
| Notes | |

### Settings
Key/value rows, pre-filled with Project Brief defaults; mom's interview tunes the values, not the schema.

| Key | Default |
|---|---|
| DailyCarbsTarget | 130–150 (g) |
| FatPerMealLimit | 15–20 (g) |
| DailyCaloriesTarget | 1400–1600 |
| MealsPerDay | 5–6 |
| MaxGapHours | 2.5–3 |
| BloodSugarMin | 4.0 |
| BloodSugarMax | 7.8 |
| WakeTime | 06:30 |
| SleepTime | 00:00 |
| DailyGlycemicLoadTarget | 80 (top of the diabetes-specific 60–80/day range mom's own old spreadsheet cites, via prodiabet.ua) |
| ShowCarbsProgress | FALSE |
| ShowCaloriesProgress | TRUE |
| ShowGlycemicLoadProgress | TRUE |
| ShowFatTotal | FALSE |
| ShowSugarsTotal | FALSE |
| ShowProteinTotal | FALSE |
| ShowSodiumTotal | FALSE |

## Google Sheets API integration

Client-side only — no custom backend for data storage. Uses Google Identity Services (OAuth) so the app acts as the signed-in user (mom or the developer), reading/writing her own spreadsheet.

**One-time setup (manual, in Google Cloud Console — done by the project owner, not by Claude):**

1. Create a Google Cloud project.
2. Enable the **Google Sheets API** and the **Google Drive API** (the latter added 2026-09-11, needed only for the "create a new spreadsheet from the app" flow below).
3. Configure the **OAuth consent screen** — External, in Testing mode; add both Google accounts (mom's and the developer's) as **test users** (avoids the app-verification process needed for a two-person app). On the **Data Access** tab, the configured scopes must include both `.../auth/spreadsheets` and `.../auth/drive.file` — a scope the code requests but the consent screen doesn't list is rejected by Google, not silently ignored.
4. Create an **OAuth Client ID** (type: Web application), with the app's dev/prod URLs as authorized origins.
5. Copy the Client ID into `.env` as `VITE_GOOGLE_CLIENT_ID`.
6. Either connect an existing spreadsheet (reuse mom's, restructured into the tabs above, or a freshly blank one — see "Connecting a brand-new blank spreadsheet" below) and copy its ID into `.env` as `VITE_SPREADSHEET_ID`, or use the app's own "Створити нову таблицю" button (Settings screen) to create one from scratch — see "Creating a new spreadsheet from the app" below.

**`drive.file` re-consent note:** adding this scope means every existing signed-in device (mom's phone, the developer's) needs to sign in again once to grant it — a stored access/refresh token from before this scope existed doesn't retroactively cover it. This is a one-time re-consent, not a recurring thing.

`src/lib/sheets.ts` wraps: `initGoogleAuth()`, `signIn()`, `signOut()`, `readRange(tab, range)`, `writeRange(tab, range, values)` — thin wrappers over the Sheets REST API using the OAuth access token.

**Creating a new spreadsheet from the app:** `createSpreadsheetInAppFolder(name)` in `sheets.ts` uses the Drive API to create a blank spreadsheet inside a single app-owned Drive folder ("Track My Meals" in Drive root, created on first use), using the `drive.file` scope — the narrowest scope that can do this, since it only grants access to files the app itself creates (it does not grant broader Drive access, and doesn't change how the existing "connect an existing spreadsheet by pasting a link" flow works — that still relies entirely on the `spreadsheets` scope). The caller then calls `initializeSpreadsheet()` (see below) to populate the new file's tabs, same as any other blank spreadsheet. The Settings screen exposes this as a name field + "Створити" button, alongside the existing "paste a link" flow for an existing spreadsheet and the Mom's/test-sheet shortcut buttons.

**Connecting a brand-new blank spreadsheet** (step 6 above doesn't require restructuring an existing sheet by hand): a genuinely blank Google Sheet has none of the 5 tabs above, which would otherwise make every read fail. `src/lib/spreadsheetInit.ts` (`checkSpreadsheetTabs()`, `initializeSpreadsheet()`) creates whichever tabs are missing and fills each with its header row (Settings also gets its full set of default key/value rows, since — unlike the other 4, which are append-only — a Settings tab with just a header row would silently reject every future save). Wired into the Settings screen's spreadsheet-connect flow: it checks automatically once signed in and offers an "Ініціалізувати таблицю" button when tabs are missing.

**Topping up an existing tab that's missing some columns** (one level finer than the whole-tab case above — e.g. an Ingredients tab set up before `GiVerified` existed): `checkSchemaGaps()`/`topUpSchemaGaps()` in `spreadsheetInit.ts` diff each already-existing tab's live header row against its canonical header list (only run once `checkSpreadsheetTabs()` confirms no tabs are missing entirely) and, for `Settings` specifically, diff its actual Key column against the full set of expected keys (the row-based analog, since Settings is key/value pairs, not columns). Same additive-only, always-safe-to-run philosophy as the whole-tab case: missing columns get appended right after a tab's current last column (never touching or reordering anything already there, including a column this app doesn't recognize — e.g. a personal note column someone added), and missing Settings keys get appended as new rows with their default values. Deliberately does **not** attempt to fix a genuinely mismatched/renamed header (ambiguous whether it's a typo, a deliberate rename, or someone's own column) — that case only ever gets surfaced, never auto-corrected, matching this project's "never let a wrong guess look authoritative" pattern. Wired into the same Settings screen check: once tabs are confirmed present, it shows either "✓ all found" or a warning naming the specific gaps with an "Оновити структуру" button.

**Three spreadsheets, three roles** (settled 2026-09-11): mom's real sheet (`VITE_DEFAULT_SPREADSHEET_ID`, her actual logged data — never experimented on), a **test** sheet (`VITE_SPREADSHEET_ID`, what real testers connect to via the "Підключити тестову таблицю" button — kept matching whatever schema the *currently-released* app build expects), and a **dev** sheet (`VITE_DEV_SPREADSHEET_ID`, "Підключити dev-таблицю" — where actual schema/data changes get tried during active development). The dev/test split exists specifically so in-progress schema work (like the reorder-resilience refactor above) never risks breaking what a real tester's already-released app is reading from. **Rule going forward: any schema experiment (new column, reordering test, tab restructuring) targets the dev sheet, never test or mom's**, until the corresponding app release actually ships and test can be safely brought up to match.

## Nutrition lookup: bundled data + USDA FoodData Central

Lookup order, implemented in `src/lib/nutrition.ts`:

1. **Bundled starter dataset** (`src/data/starter-foods.ts`) — 60 common Ukrainian/Eastern European staples (grains, dairy, common proteins, vegetables, fruits), each with both `nameUk`/`nameEn` and full nutrient values including GI. Curated once, shipped with the app, not fetched at runtime. Covers the large majority of mom's actual day-to-day foods (per the health context, her diet leans toward simple home-cooked staples, not a huge rotating variety).
2. **Static GI reference table** (`src/data/gi-table.ts`) — since no free API provides Glycemic Index at all (it comes from academic studies, not nutrition labels), GI is always looked up locally, never fetched. Covers the same foods as the starter dataset, plus any commonly-needed extras.
3. **Translation** (`translateUkToEn` in `src/lib/nutrition.ts`) — only when a food isn't in the bundle. Mom only ever *types* a Ukrainian name (she's never asked to supply or understand English — confirmed necessary after live testing showed she doesn't speak English); it's translated via [MyMemory](https://mymemory.translated.net/) (free, no API key) before querying USDA. The resolved English name is displayed afterward as a subtle secondary line next to the Ukrainian name wherever foods are listed — not something she needs to read, but a visible fallback in case a detail the numbers depend on (fat %, cut, etc.) didn't make it into the Ukrainian name.
4. **USDA FoodData Central API** — queried with the translated name. Free, no cost, requires a free API key (`api.data.gov`, no card needed) stored as `VITE_USDA_API_KEY`. Returns carbs/protein/fat/fiber/sugar/calories/sodium per 100g (no GI — falls back to a manual GI entry).
5. **Manual entry** — always available regardless of the above, if nothing is found anywhere (translation unavailable, or USDA has no match); mom or the developer can type values in directly (`Source = manual`).

Only USDA FoodData Central is wired up initially — Open Food Facts (better for packaged/branded goods via barcode) was considered but deferred since mom's diet is mostly whole/home-cooked foods; add it later only if real usage shows gaps.

Flow: mom types a Ukrainian name → checked against the bundle first → if not found, translated to English and queried against USDA → show the estimate (GI filled from the static table if available, else flagged for manual entry) → mom approves → app writes the row to the Ingredients tab.

## Ingredient & Dish availability: bundle merge

The bundled starter data (`src/data/starter-foods.ts`, `src/data/starter-dishes.ts`) is usable everywhere ingredients or dishes are browsed or picked from — the Продукти tab's lists, the Dish composer's ingredient picker, and the Today screen's meal-logging picker — **without first being individually saved to the Ingredients/Dishes sheet**. `mergeWithStarterFoods()` (`src/lib/ingredients.ts`) and `mergeWithStarterDishes()` (`src/data/starter-dishes.ts`, to avoid a circular import with `lib/dishes.ts`) merge the bundle with whatever's actually in the personal sheet at read time, keyed by name — a sheet row (an edit, or a favorited entry) always overrides the bundle default for the same name. Nothing needs "approval" to be *used* this way; approval (the flow above) is only needed for a genuinely new food not in the bundle, or to make a bundle item's row permanent — e.g. to edit its values, or to favorite it (see below).

A Dish composed from a bundle-only ingredient (never saved to the Ingredients sheet) is allowed — its `IngredientsJson` reference may not resolve to an actual Ingredients row if read back later, but nothing re-resolves it after the Dish is saved (its nutrition is computed once, at save time, and stored as static columns), so this is a harmless, accepted gap rather than a bug.

## Favorites

`Ingredient.favorite` (Ingredients tab column M, `TRUE`/`FALSE`) marks an ingredient for quick access — favorited ingredients sort to the top wherever Ingredients are listed (`sortFavoritesFirst()` in `src/lib/ingredients.ts`). Only an actual sheet row can hold the flag, so favoriting a bundle-only ingredient (one that only exists via the merge above) saves it to the sheet as a side effect — the *only* implicit "add" the app performs, and only in response to that explicit favorite action, never automatically.

## Glycemic flag (watch/avoid)

`glycemicFlag: "none" | "watch" | "avoid"` (`src/lib/glycemicFlag.ts`) is a manual "should mom be careful with this" marker, set independently on `Ingredient` (Ingredients column N) and `Dish` (Dishes column O) — separate from GI/GL, which are computed. Shown as a small cycling badge (○ → △ → ✕, `cycleGlycemicFlag()`) wherever ingredients/dishes are listed, same interaction as the ★/☆ favorite toggle; flagging a bundle-only item implicitly saves it first, reusing the favorite mechanism above.

**No automatic propagation in either direction:**
- **Ingredient → Dish** is a *derived, non-persisted* hint only: `dishContainsFlaggedIngredient()` (`src/lib/dishes.ts`) checks a dish's stored `IngredientsJson` against current ingredient flags at read time and surfaces a separate "contains a flagged ingredient" note in the Foods screen — it never overwrites the dish's own explicit `glycemicFlag`. Other ingredients in a dish can compensate for one flagged one, and sometimes the combination or cooking method is the actual problem even when every ingredient is individually fine, so the dish's flag stays independently settable.
- **Dish → Ingredient** is a manual suggestion, not automatic: flagging a dish (watch/avoid) surfaces its ingredient list right there in the Foods screen, with an optional (not forced) prompt to also flag specific ones.

## Meals-before-reading review

The Blood Sugar screen lets mom expand any reading to see the last 6 `DailyLog` entries at or before that reading's timestamp, most-recent-first, with time-before-reading shown per item (`mealsBeforeTimestamp()` in `src/lib/dailyLog.ts`). Pure timestamp filter/sort — ISO strings already sort correctly lexically — with no correlation or statistics computed; mom reviews the list herself to spot patterns. Deliberately scoped down from a full food/blood-sugar analytics feature (see `docs/build-log.md`'s 2026-09-07 design entry).

## Google auth on Android: system browser + PKCE, not GIS

The web/PWA sign-in (`src/lib/sheets.ts`'s GIS token-client flow, described above) **cannot complete inside the Android build** — confirmed live as "Error 400" during the 2026-09-10 Android session. Google deliberately blocks OAuth sign-in from inside an embedded WebView (an anti-phishing policy that applies to every app, not something specific to this one), and a default Capacitor app renders in exactly that kind of WebView.

**Fix, Android-only, web path untouched**: `initGoogleAuth()`/`signIn()` in `sheets.ts` branch on `Capacitor.isNativePlatform()`. On native, sign-in uses the system browser (`@capacitor/browser`, which launches Chrome Custom Tabs — a real browser context Google will authorize) with the Authorization Code + PKCE flow (RFC 8252, Google's own recommended pattern for installed apps):

1. Generate a PKCE `code_verifier`/`code_challenge` (Web Crypto, no library).
2. Open `https://accounts.google.com/o/oauth2/v2/auth` in the system browser via `Browser.open()`.
3. The redirect (`ca.roncreator.trackmymeals:/oauth2redirect` — a single slash, opaque URI with no host/authority, deliberately) is caught by an intent-filter on `MainActivity` (`AndroidManifest.xml`, matched on `android:scheme` alone since there's no host to match on) and delivered to the app via `@capacitor/app`'s `appUrlOpen` event.
4. Exchange the returned `code` for an access token via a direct `fetch()` to `https://oauth2.googleapis.com/token` (no `client_secret` param — see below) — no library needed, same as every other Sheets API call in this codebase.

**A second OAuth client was required** — the existing Web application client (`VITE_GOOGLE_CLIENT_ID`) can't be reused, because a "Web application" client's redirect URIs must be pre-registered HTTPS/localhost origins, incompatible with a custom URI scheme redirect.

**Getting the working client configuration took three rounds of live-testing-driven correction** — worth recording all three since each looked like "the fix" until the next test disproved it:

1. **"Desktop app" type client, rejected**: Error 400 (`invalid_request`, citing Google's "secure response handling" policy) — custom URI scheme redirects are only accepted for "Android" or "iOS" type clients, since only those let Google verify which app owns the scheme (via package name + signing certificate); a "Desktop app" client has no such binding.
2. **"Android" type client, still rejected on the double-slash redirect URI**: switching client type alone wasn't enough — `ca.roncreator.trackmymeals://oauth2redirect` parses as having an authority component (`oauth2redirect` as host), which the validator for this client type doesn't accept. Fixed by using the single-slash opaque form instead (matches the convention Google's own AppAuth-Android library uses).
3. **"Custom URI scheme is not enabled for your Android client"**: a specific, actionable error pointing at a Console-only setting — Google added an explicit opt-in toggle for custom-scheme redirects on Android OAuth clients (pushing Android App Links as the more-secure default). No code change, just enabling that toggle on the client's edit page.

**Final working setup**: `VITE_GOOGLE_ANDROID_CLIENT_ID`, an "Android" type client registered with package name `ca.roncreator.trackmymeals`, the SHA-1 fingerprint of the signing certificate (from `./gradlew signingReport`, run with `JAVA_HOME` pointed at Android Studio's bundled JDK since a plain terminal doesn't have Java on `PATH` by default), and the custom-URI-scheme toggle enabled. "Android" type clients issue **no client secret at all** (verification is via package+signature instead), so this path is fully secret-free, same as the web flow.

**Correction, found once the release keystore was actually generated**: Google Cloud Console's Android client edit page has **one** SHA-1 field, not a multi-fingerprint list — there is no "+ Add fingerprint" option. Once the release keystore existed (see the Phase 1 entry below), its SHA-1 simply **replaced** the debug one on this same client, rather than being added alongside it. This means **only the release build can sign in from that point on** — a deliberate, accepted tradeoff, since mom only ever runs the signed release build and debug was purely a testing vehicle. If debug-build sign-in testing is ever needed again, it would need its own separate Android-type client (same package name, debug SHA-1), not a second fingerprint on this one.

**Also found and fixed in the same live-testing pass**: the app's CSS had never accounted for Android's edge-to-edge system bars (status bar over the top, gesture/nav bar over the bottom) — bad enough that the bottom tab bar was unusable on a real device. `src/index.css`'s `.app-content`/`.tab-bar` now add `env(safe-area-inset-top)`/`env(safe-area-inset-bottom)` padding, which is `0px` (a no-op) on web/desktop.

## Meal-time reminder (Android/Capacitor)

The web/PWA codebase is also wrapped as an Android app via [Capacitor](https://capacitorjs.com) (`capacitor.config.ts`, `android/`) — additive to, not replacing, the browser/PWA path, which keeps working exactly as before. App ID `ca.roncreator.trackmymeals`. Full design rationale (why Capacitor over a backend/push service, cross-device staleness tradeoff, Phase 2 ideas) is in `docs/build-log.md`'s 2026-09-09 "Scoped the meal-time reminder" entry — this section just documents the mechanism as built.

- **Pure scheduling logic** (`src/lib/reminders.ts`, unit-tested): `computeReminderTime(lastMealTime, maxGapHours)` and `shouldScheduleReminder()`/`isWithinQuietHours()` — a reminder due inside the `[SleepTime, WakeTime)` window is skipped entirely, not deferred to wake time.
- **Platform glue** (`src/lib/reminderScheduler.ts`, not unit-tested — thin IO wrapper, same convention as `sheets.ts`): `initMealReminders()` (requests notification permission, creates a high-importance/lock-screen-visible channel — call once at app startup) and `scheduleMealReminder(lastMealTime, settings)` via `@capacitor/local-notifications`. Both are no-ops outside a native build (`Capacitor.isNativePlatform()`), so calling them from the shared React code is always safe.
- **Trigger points**: `TodayScreen` reschedules whenever its most-recent `DailyLog` entry or `Settings` change — this covers both "just logged a meal" and "reopened the app" (a `@capacitor/app` `resume` listener re-reads the sheet on foreground, refreshing a possibly-stale cached state — see the build-log entry for the accepted cross-device gap this doesn't fully close). Tapping the notification (`localNotificationActionPerformed`, handled in `App.tsx`) deep-links into Today's quick-add form.
- **Android manifest** (`android/app/src/main/AndroidManifest.xml`): `POST_NOTIFICATIONS` (Android 13+ runtime permission), `SCHEDULE_EXACT_ALARM` (Android 12+, for on-time delivery), `RECEIVE_BOOT_COMPLETED`.
- **Release signing**: `android/app/build.gradle` reads `android/keystore.properties` (gitignored) if present, else falls back to debug signing. See `android/keystore.properties.example` for the one-time `keytool` setup — needs a JDK, so it's done once on whichever machine has Android Studio, not regenerated per build.
- **Resolved 2026-09-10**: `./gradlew assembleRelease` needs a JDK + Android SDK (Android Studio), which the primary dev machine lacks — but access to a separate Android Studio machine was available the same day this was written, and the release keystore, signed builds, and on-device testing have all been done from there since.

## Glycemic Load calculation

```
GL = (GI × Carbs_g_in_portion) / 100
```
Implemented as a pure function in `src/lib/health.ts`.

## Per-meal fat limit logic

Compare a meal's total `Fat_g` against `Settings.FatPerMealLimit`; warn (not block) when exceeded, since the limit exists due to no gallbladder.

## Meal timing logic

Track time since the last logged meal; warn when approaching `Settings.MaxGapHours` (gastritis requires eating every 2.5–3 hrs).

## New product validation flow

App suggests (bundle match or USDA lookup) → mom reviews the estimate → mom approves → row saved to Ingredients with `Source = starter`/`usda`/`manual` as appropriate. Never auto-saves without approval.

## Daily summary and progress indicators

Today screen shows: running totals vs. Settings targets (carbs, calories), time-until-next-meal-warning, most recent blood sugar reading vs. target range.

## UI/UX: screen structure, navigation

4-tab shell, Ukrainian labels:

- **Сьогодні** (Today) — daily log, quick-add meal, progress vs. targets
- **Продукти** (Foods) — Ingredients + Dishes, search/add/edit
- **Цукор** (Blood Sugar) — log + history
- **Налаштування** (Settings) — targets, meal schedule, Google account

## Deployment and access

- Hosted on Vercel as a static PWA — no serverless functions needed now that nutrition lookup doesn't require hiding a paid API key.
- Mom opens the same URL in her phone browser and installs it to her home screen; on Windows, the developer (or mom) installs it from the browser's "Install app" menu.
- No app store, no separate installer.
