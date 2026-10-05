// Item IDs (release 1.6 — see docs/technical-spec.md → "Item IDs and the
// sheet upgrade"). Pure, unit-tested.
//
// Names are labels only; links between rows (meal → item, dish → its
// ingredients, a saved copy → the built-in item it copies) go by ID:
//   B0001…  built-in items, fixed in src/data (never changed, never reused)
//   I1, I2… the user's ingredients (Ingredients tab)
//   D1, D2… the user's dishes (Dishes tab)
//   M1, M2… the user's medicines (Medications tab, 1.7)
// The prefix is the item's kind, never a status: whether a built-in item is
// verified is recorded per part of the entry (1.7), not in its ID.

export type SheetItemKind = "ingredient" | "dish" | "medication";

const PREFIX: Record<SheetItemKind, string> = { ingredient: "I", dish: "D", medication: "M" };

/** Settings-tab keys holding the never-reuse counters (the highest number ever handed out). */
export const ID_COUNTER_KEYS: Record<SheetItemKind, string> = {
  ingredient: "NextIngredientNumber",
  dish: "NextDishNumber",
  medication: "NextMedicationNumber",
};

export function formatItemId(kind: SheetItemKind, number: number): string {
  return `${PREFIX[kind]}${number}`;
}

/** The number in an `I12` / `D3` ID of the given kind, or null if the text isn't one. */
export function parseItemNumber(id: unknown, kind: SheetItemKind): number | null {
  const match = String(id ?? "").trim().match(new RegExp(`^${PREFIX[kind]}(\\d+)$`));
  return match ? Number(match[1]) : null;
}

export function isBuiltInId(id: unknown): boolean {
  return /^B\d{4,}$/.test(String(id ?? "").trim());
}

/**
 * The next free number for a new item: one more than the highest of the
 * numbers already in the tab and the Settings counter (which remembers
 * numbers freed by deleting rows by hand, so they're never handed out again).
 */
export function nextItemNumber(existingIds: readonly unknown[], kind: SheetItemKind, counter: number): number {
  let highest = Number.isFinite(counter) && counter > 0 ? Math.floor(counter) : 0;
  for (const id of existingIds) {
    const n = parseItemNumber(id, kind);
    if (n !== null && n > highest) highest = n;
  }
  return highest + 1;
}

/** IDs that appear more than once (e.g. two devices adding an item in the same second). */
export function findDuplicateIds(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

// Latin letters that look like Cyrillic ones — typed by accident on the
// wrong keyboard layout, they'd make «хлiб» (Latin i) look like a new name.
const LATIN_LOOKALIKES: Record<string, string> = {
  a: "а",
  c: "с",
  e: "е",
  i: "і",
  o: "о",
  p: "р",
  x: "х",
  y: "у",
  k: "к",
  m: "м",
  t: "т",
  b: "в",
  h: "н",
};

/**
 * The form two names are compared in by the duplicate-name check:
 * lowercase, trimmed, repeated spaces collapsed, Latin look-alike letters
 * mapped to Cyrillic — but only in words that contain Cyrillic, so an
 * English name like "corn" stays as it is.
 */
export function normalizeItemName(name: string): string {
  const words = name.trim().toLocaleLowerCase("uk").split(/\s+/).filter(Boolean);
  return words
    .map((word) => (/\p{Script=Cyrillic}/u.test(word) ? [...word].map((ch) => LATIN_LOOKALIKES[ch] ?? ch).join("") : word))
    .join(" ");
}

/** "хліб" → "хліб 2" (or 3, 4… — the first number not already taken). `takenNames` may be in any form. */
export function suggestFreeName(name: string, takenNames: readonly string[]): string {
  const taken = new Set(takenNames.map(normalizeItemName));
  const base = name.trim().replace(/\s+/g, " ");
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(normalizeItemName(candidate))) return candidate;
  }
}

/**
 * Lists built-in items together with the user's sheet rows. A sheet row
 * with `basedOn` = a built-in ID is the user's saved copy of that item (a
 * favourite or edited version) and takes its place in the list. A row
 * without `basedOn` but with the same (normalised) name as a built-in item
 * also replaces it — how copies were stored before 1.6, until the sheet
 * upgrade fills in `basedOn`. Everything else is listed as it is, so the
 * user's own «Яблуко» can sit next to a built-in one. `aliases` are earlier
 * names of built-in items (1.8 renamed them), matched the same way.
 */
export function mergeBuiltInsById<T extends { id: string; basedOn: string; nameUk: string }>(
  builtIns: readonly T[],
  sheetRows: readonly T[],
  aliases: ReadonlyMap<string, readonly string[]> = new Map(),
): T[] {
  const copyOf = new Map<string, T>();
  for (const row of sheetRows) if (row.basedOn) copyOf.set(row.basedOn, row);
  const legacyByName = new Map<string, T>();
  for (const row of sheetRows) if (!row.basedOn) legacyByName.set(normalizeItemName(row.nameUk), row);

  const used = new Set<T>();
  const merged = builtIns.map((item) => {
    const names = [item.nameUk, ...(aliases.get(item.id) ?? [])];
    const replacement = copyOf.get(item.id) ?? names.map((name) => legacyByName.get(normalizeItemName(name))).find((row) => row && !used.has(row));
    if (replacement && !used.has(replacement)) {
      used.add(replacement);
      return replacement;
    }
    return item;
  });
  return [...merged, ...sheetRows.filter((row) => !used.has(row))];
}

/**
 * The existing item whose name matches `name` (normalised — see
 * normalizeItemName), ignoring the item being edited (`excludeId`), or null.
 * Drives the duplicate-name check: an exact (normalised) duplicate can't be
 * saved until she picks «Це він» or «Це інший — назвати «… 2»».
 */
export function findNameMatch<T extends { id: string; nameUk: string }>(
  name: string,
  items: readonly T[],
  excludeId?: string,
): T | null {
  const key = normalizeItemName(name);
  if (!key) return null;
  return items.find((item) => item.id !== excludeId && normalizeItemName(item.nameUk) === key) ?? null;
}
