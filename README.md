# Diabetes Tracker

A Ukrainian-language nutrition and health tracking web app, built for a Type 2 diabetic with Stage 3 gastritis and no gallbladder. Helps plan small frequent meals, track carbs/GI/GL/fat per meal, and log blood sugar readings. Installable as a PWA on both mobile and Windows desktop, synced across devices via Google Sheets.

## Status

Skeleton app scaffolded; the requirements interview with the end user (mom) hasn't happened yet, so exact targets and food lists are still open. See [docs/build-log.md](docs/build-log.md) for the current state and next steps.

## Getting started

Requires [Node.js](https://nodejs.org/) (LTS).

```bash
npm install
cp .env.example .env   # then fill in the values, see docs/technical-spec.md
npm run dev
```

Other scripts: `npm run test` (unit tests), `npm run build` (production + PWA build), `npm run lint`.

The app runs without `.env` values filled in, but Google Sheets sync won't work until the Google OAuth client is set up, and USDA food lookup needs a free `VITE_USDA_API_KEY` — see [docs/technical-spec.md](docs/technical-spec.md).

## Docs

- [docs/project-brief.md](docs/project-brief.md) — goal, health context, architecture, tech decisions
- [docs/requirements-open-questions.md](docs/requirements-open-questions.md) — interview questions and answers
- [docs/technical-spec.md](docs/technical-spec.md) — implementation spec (architecture decided, targets pending mom's interview)
- [docs/build-log.md](docs/build-log.md) — development journal
- [CLAUDE.md](CLAUDE.md) — instructions for Claude Code when working in this repo (dev mode / interview mode)
