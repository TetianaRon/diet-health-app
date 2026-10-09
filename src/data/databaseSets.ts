// The database offered as sets (release 2.2, spec → "Sets and the clean
// start"). Sets are their own list (database-sets.json), not the database's
// categories: a set names whole categories («categories», so it grows with
// the database) and/or single items («items»), and one product can be in
// several sets. Sets sit in groups — by kind of food, cuisines, dishes
// (developer, 2026-10-09); a group with no sets yet isn't shown.
import file from "./database-sets.json";
import verifiedFile from "./verified-foods.json";
import type { VerifiedFoodsFile } from "./verifiedFoods";

export interface SetGroup {
  id: string;
  nameUk: string;
  nameEn: string;
}

export interface SetDefinition {
  id: string;
  group: string;
  nameUk: string;
  nameEn: string;
  descriptionUk?: string;
  categories?: string[];
  items?: string[];
}

export interface SetsFile {
  groups: SetGroup[];
  sets: SetDefinition[];
}

export interface DatabaseSet {
  id: string;
  group: string;
  nameUk: string;
  descriptionUk: string;
  itemIds: string[];
}

const DATABASE = verifiedFile as VerifiedFoodsFile;

/** A set's active database items: its categories' entries in database order, then its single items; once each. */
export function setItemIds(set: SetDefinition, database: VerifiedFoodsFile = DATABASE): string[] {
  const active = database.entries.filter((e) => e.status === "active");
  const fromCategories = active.filter((e) => (set.categories ?? []).includes(e.category)).map((e) => e.id);
  const single = (set.items ?? []).filter((id) => active.some((e) => e.id === id));
  return [...new Set([...fromCategories, ...single])];
}

/** What's wrong with the sets file (empty = fine): unknown groups, categories or items; empty or repeated sets. */
export function validateSets(sets: SetsFile, database: VerifiedFoodsFile = DATABASE): string[] {
  const problems: string[] = [];
  const groups = new Set(sets.groups.map((g) => g.id));
  const categories = new Set(database.categories.map((c) => c.id));
  const ids = new Set<string>();
  for (const set of sets.sets) {
    if (ids.has(set.id)) problems.push(`set ${set.id}: the ID is used twice`);
    ids.add(set.id);
    if (!groups.has(set.group)) problems.push(`set ${set.id}: unknown group "${set.group}"`);
    if (!set.nameUk.trim() || !set.nameEn.trim()) problems.push(`set ${set.id}: both names are required`);
    for (const c of set.categories ?? []) if (!categories.has(c)) problems.push(`set ${set.id}: unknown category "${c}"`);
    for (const id of set.items ?? []) {
      const entry = database.entries.find((e) => e.id === id);
      if (!entry) problems.push(`set ${set.id}: unknown item ${id}`);
      else if (entry.status !== "active") problems.push(`set ${set.id}: item ${id} isn't active`);
    }
    if (setItemIds(set, database).length === 0) problems.push(`set ${set.id}: no items`);
  }
  return problems;
}

const SETS = file as SetsFile;

/** The sets with their items, in file order (a set left without items isn't offered). */
export const DATABASE_SETS: readonly DatabaseSet[] = SETS.sets
  .map((set) => ({ id: set.id, group: set.group, nameUk: set.nameUk, descriptionUk: set.descriptionUk ?? "", itemIds: setItemIds(set) }))
  .filter((set) => set.itemIds.length > 0);

/** The groups that have sets, each with its sets, in file order. */
export const SET_GROUPS: readonly (SetGroup & { sets: readonly DatabaseSet[] })[] = SETS.groups
  .map((group) => ({ ...group, sets: DATABASE_SETS.filter((set) => set.group === group.id) }))
  .filter((group) => group.sets.length > 0);
