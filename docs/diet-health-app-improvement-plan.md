# Diet Health App Improvement Plan
**Created:** 2026-10-05
**Status:** In progress — Phase 2 complete 2026-10-05
**Session context:** After installing the claude-governance plugin, the developer asked for a full review of the project's workflow and documentation; this plan comes from a build-standards Improve-mode audit against the project and common standards.

---

## North Star

- **A new session can start correctly from the repo alone.** Everything a session needs in order to work the way the developer expects lives in versioned repo files: how releases run, where feedback goes, what the app must never claim. Machine-local memory holds only facts about the developer as a person.
- **`CLAUDE.md` is a thin, current map:** what the project is, how work flows (roadmap → release branch → verify → release), which task file to read for each recurring job, which skills it uses, and the standing rules. It holds no workflow steps and no stale facts.
- **Recurring jobs have one written procedure each,** read only when that job runs: releasing, changing the verified food database, testing on a device. Sessions stop reconstructing them from memory.
- **Docs have one owner per fact.** The roadmap decides what gets built when, the spec holds the design, the build log is the journal, and the README is a short human-facing entry point. Nothing is stated in two places that can drift apart.
- **The repo reproduces its own data.** The scripts that build the committed verified food database are versioned next to it.
- **Line endings are stable.** A build or `cap sync` leaves no line-ending-only diffs.

---

## Current State

- **`CLAUDE.md` (79 lines):**
  - Has identity, a docs list, a code map, a default role, and Interview Mode (a full workflow, run once on 2026-09-07).
  - States "the interview with mom has not happened yet".
  - The code map points to `src/data/starter-foods.ts` (removed in 1.8) and describes `gi-table.ts` as a static reference table (it now reads the verified database).
  - It doesn't mention the verified database, the Android build, the release process, `contributions/`, or the branch workflow.
  - It has no skill declaration, no issues-log declaration and no version line.
- **Working rules live only in machine-local memory** (13 files, in `~/.claude/projects/…/memory/`):
  - the branch workflow;
  - plan-before-building (roadmap intake);
  - English-only Play release notes;
  - no testing on mom's phone;
  - not a medical app, with sources and dates on every value;
  - the user-data reconciliation rules;
  - explicit outcome-naming buttons;
  - no automated Sheets structure edits.
- **Out-of-date memory:** `project_diet_health_app.md` says "Stage 3 gastritis" (it's 2), describes a 2026-08 "verification phase", and tells sessions to read the README's Status section.
- **README.md Status is about six weeks out of date.** It says reminders aren't built, lists uncommitted changes from August, and lists pending manual sheet edits that the 1.6 silent upgrade made unnecessary.
- **Repeated jobs with no written procedure,** done from memory each time:
  - **Release:** run 6 times this session (1.7, 1.7.1, 1.8, 1.8.1, 1.9 and a hotfix merge into 1.9).
  - **Verified-database change:** builder → review page → review rounds → sweep of explanatory notes.
  - **Device testing:** adb, Git Bash path conversion, dev-server sign-in.
- **Docs sizes:**
  - `docs/build-log.md`: 1,481 lines and growing.
  - `docs/roadmap.md`: 204 lines, keeps resolved intake items in full.
  - `docs/technical-spec.md`: 575 lines.
  - Release summaries are written twice: in the roadmap's *Done* lines and in the build log.
- **`docs/requirements-open-questions.md`:** its header still says "to clarify with mom before development begins".
- **`docs/automation-candidates.md`:** predates the governance plugin, which now covers some of its candidates (plan discipline, issue logging, decision logging).
- **The verified-database builder is unversioned:**
  - `build_verified.py`, `build_review.py`, `gi_*.py`, `usda_search.py` and `review_template.html` live in gitignored `contributions/2026-10-verified-db/`;
  - they were edited this session with no history;
  - they are the only way to rebuild `src/data/verified-foods.json`.
- **Repo hygiene:**
  - No `.gitattributes`: CRLF warnings on most commits, and `cap sync` leaves line-ending-only diffs in two gradle files on every build.
  - `screenshots/` has stayed untracked all session.
  - `.claude/settings.local.json` holds permissions for an unrelated project (pomodoro-guardian).
- **Feedback intake:** `docs/roadmap.md` → Intake serves as the issues log, with no declared identifier.

---

## Gap Analysis

| Area | Current | North Star | Gap |
|---|---|---|---|
| Instruction layer | `CLAUDE.md` holds out-of-date facts, a one-time workflow, no release flow, no skill or issues-log declaration | A thin, current map with routing and standing rules | Rewrite; move Interview Mode out; add routing, skills and issues log (project standard: `CLAUDE.md` components) |
| Working rules | In machine-local memory only | In the repo, versioned | Move project rules into `CLAUDE.md`; reduce memory to person-level facts |
| Recurring workflows | Rebuilt from memory each time | One task file each | Write task files: release, verified-database change, device testing (project standard: task files) |
| README | Status ~6 weeks out of date | Short entry point that points to the roadmap | Rewrite Status as a pointer |
| Roadmap / build log | Release summaries written twice; resolved intake kept in full; build log 1,481 lines | One owner per fact, readable size | Roadmap keeps one line per released item and links to the log; archive older log entries |
| Other docs | Open-questions header and automation candidates out of date | Current | Update headers and statuses |
| Data reproducibility | Builder scripts gitignored | Scripts versioned | Move scripts into the repo (not the PDFs or private data) |
| Repo hygiene | No `.gitattributes`; stray settings; untracked `screenshots/` | Stable line endings, clean tree | Add `.gitattributes` and renormalize; clean up settings; decide on `screenshots/` (common standard: repository setup) |
| UI conventions | Off-screen inline confirmations happened twice (meal editor in 1.8.1, delete in 1.9) | Written convention | Add "confirmations are dialogs" to the spec (passes the rule-writing gate: it recurred, and a reviewer has missed it both times) |

---

## Issue coverage map

This plan works no issues-log entries. The roadmap's open Intake items stay where they are, and Phase 2 only declares that list as the project's issues log.

| Entry | Log now | Decision | Target log | Phase |
|---|---|---|---|---|
| — | `docs/roadmap.md` → Intake | none worked by this plan | — | — |

---

## Improvement Roadmap

### Phase 1 — Repo hygiene and a reproducible database ✅ complete 2026-10-05

- Add `.gitattributes` with the standard minimum lines, plus `*.aab binary`, `*.apk binary`, `*.keystore binary` and `*.jks binary`. Then commit a `git add --renormalize .` on its own.
- Move the verified-database builder into the repo, e.g. `tools/verified-db/`:
  - files: `build_verified.py`, `build_review.py`, `gi_parse.py`, `gi_summaries.py`, `gi_find.py`, `gi_candidates.py`, `usda_search.py`, `review_template.html`;
  - script paths are adjusted so they read the source files from the gitignored `contributions/references/`;
  - the GI supplement PDFs, the parsed `gi-2021-*.json` and mom's data stay out of git.
- Clean the unrelated pomodoro-guardian entries out of `.claude/settings.local.json`.
- Settle `screenshots/`.

**Decisions** (decided 2026-10-05: GI tables stay local; `screenshots/` gitignored):
1. Commit the parsed GI tables (`gi-2021-entries.json`, derived from the paper's supplements) or keep them local? Recommended: keep them local, since they're derived from copyrighted supplements, and document how to regenerate them.
2. `screenshots/`: delete it, gitignore it, or keep specific files?

⏸ HUMAN CHECKPOINT [Governance] — the developer reviews the moved scripts and the `.gitattributes` commit before Phase 2.

### Phase 2 — `CLAUDE.md` rewrite and memory realignment ✅ complete 2026-10-05

- **Rewrite `CLAUDE.md` with these sections:**
  - **Identity:** the developer's mom's health context, current facts only.
  - **Production flow:** intake → roadmap release → `release/x.y` branch → build and verify on the test sheet → release (main, Play) → docs marked released.
  - **Task routing table:** points to Phase 3's task files.
  - **Skill declaration:** the governance skills used, each with when it applies and its gate strength (soft gate unless decided otherwise).
  - **Issues log:** identifier plus `docs/roadmap.md` → Intake.
  - **Standing rules:** moved in from memory.
  - **Corrected code map:** the verified database, `builtInFoods.ts`, `foodSearch.ts` and `numberFormat.ts`, with `starter-foods.ts` removed.
  - **A `**Version:**` line.**
- **Interview Mode:** move it to its own task file. (The CLAUDE.md block itself is only read when the trigger phrase is sent, so it isn't loaded by mistake, but it's 30+ lines in the instruction layer for a workflow that ran once.)
- **Memory:** delete or shrink the files whose rules moved into `CLAUDE.md`. Fix `project_diet_health_app.md` (the gastritis stage, the out-of-date phase notes). Update `MEMORY.md`.

**Decisions** (decided 2026-10-05: `TMM`, Intake stays in the roadmap; rule 3 adapted; per-task soft gates, no startup sequence; Interview Mode → task file):
1. The issues-log identifier, e.g. `TMM`. Also whether Intake stays in the roadmap (recommended, to avoid a second list) or moves to `ISSUES.md`.
2. Interview Mode: keep it as a task file, or retire it now that the interview is done? Recommended: a task file, since a follow-up interview is likely (the open questions list still has unanswered items).
3. The project standard's five default behavioural rules. Rule 3, "confirm before modifying documentation", conflicts with how this project works: docs are updated as part of each release. Adopt it as written, adapt it to "confirm before changing `CLAUDE.md` or memory; release docs are part of the work", or drop it?
4. Startup gate: should sessions load `session-discipline` first (a startup sequence), or declare governance skills only for the tasks that use them?

⏸ HUMAN CHECKPOINT [Governance] — the developer approves the new `CLAUDE.md` text and the memory changes before they're written.

### Phase 3 — Task files for recurring workflows ⏳ pending

- **`docs/tasks/dha-task-release.md`:**
  - release and hotfix branches;
  - the verification on the test sheet;
  - versionName and versionCode;
  - build log and roadmap entries;
  - merge;
  - `build:android` / `cap sync` / `bundleRelease`;
  - checking the bundle (signing key SHA-1, version, content);
  - English release notes;
  - the developer pushes and uploads;
  - marking the release as released;
  - carrying a hotfix into the open release branch.
- **`docs/tasks/dha-task-verified-db-change.md`:**
  - builder → validation test → review page (rounds, reopen logic);
  - sweeping explanatory notes after a structural change;
  - sources, reliability, dates and wording rules.
  - (This absorbs the memory rules on data accuracy and not being a medical app.)
- **`docs/tasks/dha-task-device-testing.md`:**
  - the local dev server and when sign-in is needed;
  - the test sheet versus mom's sheet, and no testing on her phone;
  - adb from Git Bash (`MSYS_NO_PATHCONV=1`), screen recordings, the emulator.
- **`docs/tasks/dha-task-user-data-import.md`:** the reconciliation rules for importing a user's own food data (mom's sheet in 2.0). Added 2026-10-05: these rules live in memory and have no other home.
- (The Interview Mode task file is written in Phase 2.)

**Decision** (decided 2026-10-05: `dha-task-`, in `docs/tasks/`): the file-name prefix. The standard's `[project-id]-task-[artifact].md` gives e.g. `dha-task-release.md`. A folder (`docs/tasks/`) is fine because the project runs only in the repo, with no chat Project.

⏸ HUMAN CHECKPOINT [Governance] — the developer reviews each task file. It's then tried for real on the next release.

### Phase 4 — Docs cleanup ⏳ pending

- **README:** replace the Status section with 3–4 current lines and a link to the roadmap's "start here"; fix the docs list (add the roadmap and this plan; drop "interview mode" from the `CLAUDE.md` line).
- **Roadmap:**
  - resolved intake items shrink to one line each (or move to Released);
  - each released release keeps a 1–2 line summary and a link to its build-log entry instead of repeating it.
- **Build log:** move entries before 1.5 (2026-08 to 2026-09) to `docs/build-log-archive-2026-08-09.md`; the main log keeps 1.5 onward.
- **`requirements-open-questions.md`:** header updated to reflect the interview being done, with the remaining open items listed as open.
- **`automation-candidates.md`:** mark which candidates the governance plugin now covers, and which became this project's task files (the release checklist, the verified-database review).
- **Spec:** add a short UI conventions section: confirmations and questions open as dialogs; decimals always via `formatDecimal`; buttons name their outcome.

**Decision** (decided 2026-10-05: by date): split the build log by date (as above) or by release?

⏸ HUMAN CHECKPOINT [Governance] — the developer reviews the doc changes.

---

## Drafts Inventory

| File | Status | Notes |
|---|---|---|
| `docs/diet-health-app-improvement-plan.md` | ✅ Reviewed | This plan, approved 2026-10-05 |
| `.gitattributes` | ✅ Applied | Phase 1 |
| `tools/verified-db/` (8 scripts + `README.md`) | ✅ Applied | Phase 1; output byte-identical to the committed JSON |
| `CLAUDE.md` (v2.0) | ✅ Applied | Phase 2 |
| `docs/tasks/dha-task-interview.md` | ✅ Applied | Phase 2; adds one line: a follow-up interview starts from the open items |
| Memory (`MEMORY.md` + 4 files) | ✅ Applied | Phase 2; 8 files deleted, 2 kept for Phase 3, 2 kept for good |

---

## Deferred Items

- **Dev sign-in survives page reloads.** Each reload of the local dev server signs out, which cost the developer about 8 extra sign-ins this session. A dev-only token cache (`sessionStorage`, dev builds only) would remove that. It's a code change with a security trade-off, so it goes to the roadmap Intake, not this plan. *Trigger:* the developer agrees to the trade-off.
- **Heredoc commands waiting on stdin.** Twice a Bash command started with a stray `cat > file` that waited for input and hung. This is a watch item, not a rule (a first-order tooling slip). *Trigger:* a third occurrence.
- **Instruction-cleanliness of the docs.** The standard's narrative-marker scan ("no longer", dates, history) applies to instruction files, not to the build log or spec, whose purpose is history and rationale. Only `CLAUDE.md` and the task files get the scan, inside Phases 2–3.
- **Not applicable here:** the chat-Project surface rules, flat file naming for uploads, and the documentation-page hyperlink rule. The project has a single repo surface and no external documentation pages. *Trigger:* a claude.ai Project for this app is created.
- **External bug-report procedure** (Chromium issue): done once. *Trigger:* a second upstream report.

---

## Session Worklog

### Session 1 — 2026-10-05
- Ran a build-standards Improve-mode audit of the project: `CLAUDE.md`, `docs/`, memory, repo configuration and the workflow observed this session. Loaded the project and common standards plus the rule-writing gate.
- Drafted this plan: 4 phases, all ⏳ pending, waiting for the developer's approval.
- **Plan approved** by the developer ("Approved, go with your recommendations"). Decisions, as recommended:
  - **Phase 1:** the parsed GI tables stay local, with regeneration documented; `screenshots/` is gitignored (not deleted).
  - **Phase 2:** issues-log identifier `TMM`, Intake stays in `docs/roadmap.md`. Default rule 3 is adapted to "confirm before changing `CLAUDE.md`, task files or memory; release docs are part of the work". Governance skills are declared per task (soft gates), with no startup sequence. Interview Mode moves to a task file.
  - **Phase 3:** task files use the `dha-task-` prefix in `docs/tasks/`.
  - **Phase 4:** the build log is split by date (entries before 1.5 archived).
- The work runs on branch `chore/governance-cleanup`, merged into `main` when all phases are done. Phase 1 started.
- **Phase 1 work done** (branch `chore/governance-cleanup`):
  - `.gitattributes` added. `git add --renormalize .` changed nothing, because the files in git were already LF. The two gradle files that showed as modified after `cap sync` had no content change; git just hadn't refreshed its record of them.
  - The builder moved to `tools/verified-db/`: generated files go to `contributions/2026-10-verified-db/`, the GI sources stay in `contributions/references/`. `build_verified.py` rebuilt `verified-foods.json` byte-identical, `build_review.py` and `gi_find.py` ran, and a README documents the pipeline.
  - `screenshots/` gitignored; the unrelated pomodoro-guardian permissions removed from `.claude/settings.local.json` (local file, not in git).
  - **Leftover:** git still prints "CRLF will be replaced by LF" for files written on Windows. These are warnings only, and nothing goes into git with CRLF. They come from `core.autocrlf=true` in the machine's git config, which the developer may want to set to `input`; that's local configuration, outside this plan.
- **Phase 1 approved** by the developer ("Approved, start Phase 2"). Phase 2 started: drafting the new `CLAUDE.md` for review before writing it.
- **Phase 2 draft:** a new `CLAUDE.md` (v2.0). Sections: issues log, identity, production flow, task routing (interview only; Phase 3 adds its rows when those files exist), skills (6 governance skills, all soft gates), 8 standing rules, code map, docs list.
  - **Deviations from the standard's default rules, with reasons:** rule 3 is adapted (as decided). Rule 5 (hyperlinks to documentation pages) is dropped: the project has no external documentation pages.
- **Memory plan:**
  - **Delete now** (their rules are in the draft): branch workflow, plan-before-building, no mom testing, release notes in English, Sheets automation, explicit buttons, data-accuracy audits, and the project overview (out of date; its useful point, non-English user paths, moved to Identity).
  - **Keep until Phase 3**, which gives them a task file: not-a-medical-app details, and user-data reconciliation.
  - **Keep:** the designer role and the domains/email setup (both cross-project).
- **Phase 2 text approved** by the developer ("Approved, write it and update memory"): writing `CLAUDE.md` v2.0 and the interview task file, and applying the memory plan.
- **Phase 2 done:**
  - `CLAUDE.md` v2.0 written as approved, and `docs/tasks/dha-task-interview.md` created (Interview Mode as it was, plus one line: a follow-up interview starts from the open items).
  - Memory: 8 files deleted; `MEMORY.md` now lists 4 (two marked to move to Phase 3 task files).
  - The checkpoint passed with the text approval, so the phase is complete. Phase 3 is next.
