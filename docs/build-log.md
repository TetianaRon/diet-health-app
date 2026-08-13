# Build Log

Development journal — decisions, changes, and notes in chronological order.

## 2026-04-22 — Project Initialization

**Completed:**

- Defined user health context: Type 2 diabetes, Stage 3 gastritis, no gallbladder
- Agreed on architecture: Google Sheets (database) + Claude Web App (interface)
- Created Notion project documentation: Project Brief, Open Questions, System Prompt, Technical Spec
- Designed two-mode system prompt: Development mode (English) + Interview mode (Ukrainian)
- Set interview trigger phrase: `МАМА: ПОЧАТИ ОПИТУВАННЯ`

**Key decisions:**

- UI language: Ukrainian
- Backend/search language: English (more reliable nutritional data)
- Platform: Web app in phone browser (no install)
- Database: Google Sheets (already familiar to mom)
- Blood sugar units: mmol/L
- Documentation language: English

**Next steps:**

- Run interview with mom via Claude Project
- Fill Technical Spec based on her answers
- Begin MVP development

## 2026-05-06 — Developer's Personal Calorie Counter (parallel build)

**Context:** Developer requested a personal calorie counter app built in parallel while mom's interview is pending. Source spreadsheet analyzed via Google Drive connector (file ID: `1X9wub-hxIcS2iDrPkjA2ivvxg8yii9w_JInp_ydbMBY`).

**What was built:**
Self-contained single-artifact calorie tracker (HTML/CSS/JS + Claude API). Runs in browser, persists via `localStorage`. Three tabs: Today's Log, Food Library, Progress.

**Features (v2):**

- Breakfast / Lunch / Dinner / Snacks structure matching existing spreadsheet
- Fuzzy search across food library with description preview and kcal/100g shown in dropdown
- AI food lookup via Anthropic API when food not in library — auto-saves result with description
- 31 pre-seeded foods extracted from real spreadsheet history
- All library foods have descriptions (what it is, how prepared)
- Food library tab: search, edit name/description/calories, delete, add manually
- Daily calorie progress bar with 1800 kcal/day goal
- Weight logging per day
- Weight trend chart (last 30 days, line)
- Daily calorie chart (last 14 days, bar — red if over goal)
- Stats: current weight, 30-day change, 7-day avg calories
- Export + analyze day via Claude chat

**Architecture decision — Google Sheets sync:**
Decided NOT to sync with existing spreadsheet. It is a pre-filled template, not a clean database. App is self-contained with localStorage — simpler, no auth required. Open question: revisit Sheets sync as a later milestone if developer wants cross-device persistence.

**Developer notes addressed:**

- Fuzzy search with description previews in dropdown ✅
- Library descriptions + edit flow ✅
- Spreadsheet sync — deferred (open)
- Weight progress chart ✅
- Calorie goal set to 1800 kcal/day ✅

**Next steps for this app:**

- Test food lookup and library editing in real use
- Revisit Sheets sync if cross-device data is needed
- Potential: weekly calorie summary, streak tracking

**Status:** Never finished — not used as a base for the diabetes tracker app. Kept here for history only.

## 2026-08-12 — Migrated project into GitHub repo

**Completed:**

- Moved all Notion documentation (Project Brief, Requirements — Open Questions, Technical Spec, Build Log) into `docs/` in this repo
- Converted the Claude Project system prompt into [`CLAUDE.md`](../CLAUDE.md) at the repo root, so Claude Code follows the same dev-mode / interview-mode rules
- Notion remains the source of record for now for the interview-prep pages (Interview Prompt, instructions for mom); this repo is the source of record for code and the docs above going forward

**Next steps:**

- Run the interview with mom (Ukrainian, trigger phrase `МАМА: ПОЧАТИ ОПИТУВАННЯ`)
- Fill in `docs/requirements-open-questions.md` → Mom's Answers
- Fill in `docs/technical-spec.md` and begin scaffolding the actual app
