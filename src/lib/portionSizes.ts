// Named portion sizes (release 2.0.2, spec: "Faster food entry"): up to 3 per
// product or dish — a label and an amount in grams or pieces («середнє ≈ 180 г»,
// «порція ≈ 10 шт.»). The verified database ships typical sizes too (with
// sources); hers are added to them, and one of hers with the same label
// replaces the database one. Pure, unit-tested.
import { resolveAmount, type Measure } from "./measure";

export interface PortionSize {
  label: string;
  grams?: number;
  pieces?: number;
  /** Millilitres (2.1.1): «склянка ≈ 250 мл». */
  ml?: number;
  /** A database size (shown with ⓘ), not one she set. */
  fromDatabase?: boolean;
}

/** How many sizes she can set per item. */
export const MAX_OWN_SIZES = 3;

/** Labels offered for a new size, in order. */
export const DEFAULT_SIZE_LABELS = ["маленька", "середня", "велика"] as const;

function positive(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The PortionSizes cell → her sizes (invalid entries dropped). */
export function parsePortionSizes(value: unknown): PortionSize[] {
  try {
    const parsed: unknown = JSON.parse(String(value ?? "") || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((raw): PortionSize | null => {
        const item = raw as { label?: unknown; grams?: unknown; pieces?: unknown; ml?: unknown };
        const label = typeof item.label === "string" ? item.label.trim() : "";
        const grams = positive(item.grams);
        const pieces = positive(item.pieces);
        const ml = positive(item.ml);
        if (!label || (grams === undefined && pieces === undefined && ml === undefined)) return null;
        return grams !== undefined ? { label, grams } : ml !== undefined ? { label, ml } : { label, pieces: pieces as number };
      })
      .filter((s): s is PortionSize => s !== null)
      .slice(0, MAX_OWN_SIZES);
  } catch {
    return [];
  }
}

/** Her sizes → the PortionSizes cell ("" when there are none). */
export function serializePortionSizes(sizes: readonly PortionSize[]): string {
  const own = sizes.filter((s) => !s.fromDatabase).slice(0, MAX_OWN_SIZES);
  if (own.length === 0) return "";
  return JSON.stringify(
    own.map((s) => (s.grams !== undefined ? { label: s.label, grams: s.grams } : s.ml !== undefined ? { label: s.label, ml: s.ml } : { label: s.label, pieces: s.pieces })),
  );
}

const key = (label: string) => label.trim().toLowerCase();

/** The database's sizes followed by hers; hers replaces a database size with the same label. */
export function mergePortionSizes(database: readonly PortionSize[], own: readonly PortionSize[]): PortionSize[] {
  const ownKeys = new Set(own.map((s) => key(s.label)));
  return [...database.filter((s) => !ownKeys.has(key(s.label))).map((s) => ({ ...s, fromDatabase: true })), ...own];
}

/** A size times a count, as an amount for this item; null when the item can't use it (pieces without a piece weight, or the reverse). */
export function sizeAmount(
  size: PortionSize,
  count: number,
  measure: Measure,
): { grams: number | null; pieces: number | null; ml: number | null } | null {
  const amount =
    size.grams !== undefined ? { grams: size.grams * count } : size.ml !== undefined ? { ml: size.ml * count } : { pieces: (size.pieces ?? 0) * count };
  const resolved = resolveAmount(measure, amount);
  return resolved ? { grams: resolved.grams, pieces: resolved.pieces, ml: resolved.ml } : null;
}

/** «2 × середнє», or «мигдалина × 10» for a one-piece size («1 мигдалина»); just the label for one. */
export function sizeLabel(size: PortionSize, count: number): string {
  if (count === 1) return size.label;
  const n = String(count).replace(".", ",");
  const onePiece = size.label.match(/^1\s+(.+)$/);
  return onePiece ? `${onePiece[1]} × ${n}` : `${n} × ${size.label}`;
}
