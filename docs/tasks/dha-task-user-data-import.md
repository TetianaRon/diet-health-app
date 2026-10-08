# Importing a user's own food data

**When:** a user's own food records (products and dishes, never logs or blood sugar) are brought into the app or the database. The first case is mom's old spreadsheet (roadmap 2.3, after local-first and sets).

Her sources are often popular Ukrainian tables, which repeat outdated values (boiled carrot GI ~85 from the early 1980s; current research gives 39) or mix up raw and cooked. Branded packaging values are trustworthy.

## Two destinations, never mixed

- **The verified database:** items verified against a source, under proper, accurate names (not her old names), through `dha-task-verified-db-change.md`.
- **Her own sheet:** her branded packaging items, and values she found that couldn't be verified. They're kept as she has them and labelled «неперевірено».

## Classifying each item

**Generic items** (no brand, fat % or other packaging detail; «домашній» alone doesn't count). Find every plausible variant in the verified source (types, states, canned, frozen, fat levels) and compare both name and values; never take the first name match. Then:

| Case | Outcome |
|---|---|
| Verified match, small difference | The verified value is used |
| Verified match, big difference | Check her value for a known error type (cooking state, unit, outdated source). The verified value is the default either way; she gets one clearly labelled option to keep hers |
| Genuinely unclear which food it is (canned vs boiled corn, tuna in water vs oil) | The only case that becomes a question for her, with explicit options |
| No verified match | Saved as hers, unless it also has no brand (nobody knows what the number describes): then it isn't imported by default, with an option to add it anyway |

Two of her items never share a match unless they really are the same food. If no variant fits, propose nothing for that item.

**Unique items** (a brand, fat % or packaging detail). Her values stay. Fields she lacks (often everything but calories) are proposed from the closest verified match, with its source, and filled in by default; she has an option to refuse.

**Her dishes without a recipe** keep her own values, flagged «потрібно скласти рецепт». They aren't recalculated. Add the ingredients they likely need to the database, so the dish can be composed later.

## Her decisions

- Keep her choices to a minimum. Verified values are the default, and she's asked only where there is real uncertainty. Every item that truly needs her decision comes together, first.
- The review page shows each change with its source, and every button names its outcome (standing rule 7).
- Every item carries a decision record: her value, the candidate with its source and ID, the difference, the outcome and the reasoning.
