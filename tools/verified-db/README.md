# Verified food database builder

These scripts build `src/data/verified-foods.json` (nutrients from USDA FoodData Central SR Legacy, GI from the 2021 international GI tables) and the review page used to accept each entry. The JSON is committed; the scripts are its source.

Generated files and the GI sources are local and gitignored:

- `contributions/references/`: the GI tables' supplement files and their text extracts.
- `contributions/2026-10-verified-db/`: parsed tables, USDA candidates, the build report and `review.html`.

The parsed tables come from the paper's supplements, so they aren't committed. Regenerate them from the source files with steps 1–2 below.

## Pipeline

1. **Get the GI sources.** Download the supplement of Atkinson et al. 2021, *International tables of glycemic index and glycemic load values 2021* (Am J Clin Nutr, mmc1). ScienceDirect blocks scripted downloads, so download it in a browser. Unzip it into `contributions/references/`, then extract each table with `pdftotext -raw`, saving the results as `gi-2021-st1.raw.txt` and `gi-2021-st2.raw.txt`.
2. **Parse the tables:**
   - `python tools/verified-db/gi_parse.py` writes `gi-2021-entries.json`;
   - `python tools/verified-db/gi_summaries.py` writes `gi-2021-summaries.json`.
   - `python tools/verified-db/gi_find.py "<regex>"` searches the parsed entries.
3. **Find USDA candidates** (optional, for new items): `python tools/verified-db/usda_search.py [B-ids]`. It needs `USDA_API_KEY` or `VITE_USDA_API_KEY` in `.env`.
4. **Build the database:** `python tools/verified-db/build_verified.py`. Item definitions, overrides and review-round additions live in this script. It fetches each USDA entry by ID and rewrites `src/data/verified-foods.json`. Then run `npx vitest run src/data/verifiedFoods.test.ts`; the format guard must pass.
5. **Build the review page:** `python tools/verified-db/build_review.py` writes `review.html`. Republish it to the review artifact; decisions are kept in the artifact's own storage.

On Windows, set `PYTHONIOENCODING=utf-8` so Ukrainian text prints.
