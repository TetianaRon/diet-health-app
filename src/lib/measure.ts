// How an item is measured (release 2.0.1, spec: "Pack values"). Two separate
// things:
//   • what amount the values are for — typed exactly as the pack prints them
//     («на 30 г», «на 12 шт.»), stored per 100 g (`Basis` 100g) or per 1 piece
//     (`Basis` piece), with the typed amount kept (`ValuesPer`) so the editor
//     reopens as entered;
//   • how much pieces weigh — any count weighed («12 шт. = 300 г»,
//     `WeighedPieces` / `WeighedGrams`), which links grams and pieces.
// Pure, unit-tested.
import type { IngredientNutrition } from "./dishes";
import { evaluateInput } from "./mathInput";

export type Basis = "100g" | "piece";

export interface Measure {
  basis: Basis;
  /** The amount the values were typed for (30 for «на 30 г», 12 for «на 12 шт.»); null = 100 g or 1 piece. */
  valuesPer: number | null;
  /** A weighed count of pieces and its weight («12 шт. = 300 г»); both null when unknown. */
  weighedPieces: number | null;
  weighedGrams: number | null;
}

/** An amount eaten or put in a recipe: grams, pieces, or both. */
export interface Amount {
  grams?: number | null;
  pieces?: number | null;
}

export const PER_100G: Measure = { basis: "100g", valuesPer: null, weighedPieces: null, weighedGrams: null };

export function toBasis(value: unknown): Basis {
  return String(value ?? "").trim() === "piece" ? "piece" : "100g";
}

/** A positive number (typed plainly or as a calculation, «12*2»), or null: blank, zero, negative or not a number. */
export function positiveOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const n = evaluateInput(String(value));
  return n !== null && n > 0 ? n : null;
}

/** The weight of one piece, when a weighed count is known. */
export function pieceGrams(measure: Measure): number | null {
  return measure.weighedPieces && measure.weighedGrams ? measure.weighedGrams / measure.weighedPieces : null;
}

/** The amount the values were typed for: 100 g / 1 piece unless the pack said otherwise. */
export function valuesAmount(measure: Measure): number {
  return measure.valuesPer ?? (measure.basis === "piece" ? 1 : 100);
}

/** Multiplier from the stored values (per 100 g or per 1 piece) to the amount they were typed for. */
export function packFactor(measure: Measure): number {
  return measure.basis === "piece" ? valuesAmount(measure) : valuesAmount(measure) / 100;
}

/**
 * Turns an amount into the factor applied to the stored values, plus both
 * sides of the amount where they can be known. Null when the amount can't be
 * used for this item: pieces of a per-100 g item, or grams of a per-piece
 * item, without a piece weight.
 */
export function resolveAmount(measure: Measure, amount: Amount): { factor: number; grams: number | null; pieces: number | null } | null {
  const perPiece = pieceGrams(measure);
  let grams = amount.grams && amount.grams > 0 ? amount.grams : null;
  let pieces = amount.pieces && amount.pieces > 0 ? amount.pieces : null;
  if (grams === null && pieces !== null && perPiece !== null) grams = pieces * perPiece;
  if (pieces === null && grams !== null && perPiece !== null) pieces = grams / perPiece;
  if (measure.basis === "piece") {
    if (pieces === null) return null;
    return { factor: pieces, grams, pieces };
  }
  if (grams === null) return null;
  return { factor: grams / 100, grams, pieces };
}

/** Stored values times a factor; GI doesn't scale. */
export function scaleNutrition(values: IngredientNutrition, factor: number): IngredientNutrition {
  return {
    carbsG: values.carbsG * factor,
    gi: values.gi,
    fiberG: values.fiberG * factor,
    sugarsG: values.sugarsG * factor,
    proteinG: values.proteinG * factor,
    fatG: values.fatG * factor,
    caloriesKcal: values.caloriesKcal * factor,
    sodiumMg: values.sodiumMg * factor,
  };
}

/** Values typed for the pack amount → what's stored (per 100 g or per 1 piece), to 4 decimals. */
export function toStoredValues(typed: IngredientNutrition, measure: Measure): IngredientNutrition {
  const scaled = scaleNutrition(typed, 1 / packFactor(measure));
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  return {
    carbsG: round4(scaled.carbsG),
    gi: scaled.gi,
    fiberG: round4(scaled.fiberG),
    sugarsG: round4(scaled.sugarsG),
    proteinG: round4(scaled.proteinG),
    fatG: round4(scaled.fatG),
    caloriesKcal: round4(scaled.caloriesKcal),
    sodiumMg: round4(scaled.sodiumMg),
  };
}

/** Stored values → the values for the pack amount, as the editor shows them. */
export function toTypedValues(stored: IngredientNutrition, measure: Measure): IngredientNutrition {
  return scaleNutrition(stored, packFactor(measure));
}

/** Rounded for display and for meal rows (stored item values keep 4 decimals). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
