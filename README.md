# Track My Meals (Трекер харчування)

A Ukrainian-language meal and blood-sugar tracker for people managing type 2 diabetes and related diets. It plans small, frequent meals; tracks carbohydrates, GI, glycemic load and fat per meal; and logs blood sugar, medicine and weight. It runs as a web app and an Android app, and each user's data lives in their own Google Sheet.

It's a calculator on the user's own settings, not a medical app. Every reference value in its food database cites its source, reliability and the date it was verified.

**Status:** releases ship to Google Play and the web (`track-my-meals.roncreator.com`). For what's built, what's next and where to pick up, see [docs/roadmap.md](docs/roadmap.md) → "Next session — start here".

---

## Run it locally

Requires [Node.js](https://nodejs.org/) (LTS).

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your environment file, then fill in the values (Google OAuth client, spreadsheet IDs, USDA API key). [docs/technical-spec.md](docs/technical-spec.md) explains each one.

   ```bash
   cp .env.example .env
   ```

3. Start the dev server at `http://localhost:5173`:

   ```bash
   npm run dev
   ```

Other scripts: `npm run test` (unit tests), `npm run build` (production and PWA build), `npm run build:android` (the web build for the Android app, synced with Capacitor), `npm run lint`.

---

## Docs

- [docs/roadmap.md](docs/roadmap.md): releases, their status, and the intake list for new feedback.
- [docs/technical-spec.md](docs/technical-spec.md): the design of every feature.
- [docs/build-log.md](docs/build-log.md): decisions and verification, in date order. Entries before release 1.5 are in [docs/build-log-archive-2026-04-09.md](docs/build-log-archive-2026-04-09.md).
- [docs/project-brief.md](docs/project-brief.md): health context and nutritional parameters.
- [docs/requirements-open-questions.md](docs/requirements-open-questions.md): the user interview's answers and the questions still open.
- [docs/tasks/](docs/tasks/): step-by-step procedures for recurring work (releasing, testing, changing the food database).
- [tools/verified-db/README.md](tools/verified-db/README.md): how the verified food database is built.
- [docs/automation-candidates.md](docs/automation-candidates.md): patterns from this project worth turning into reusable tools.
- [CLAUDE.md](CLAUDE.md): instructions for Claude Code sessions in this repo.
