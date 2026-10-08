// «Вага штук (необов'язково)» (release 2.0.1/2.0.2): any count of pieces
// weighed together — «12 шт. = 300 г», «10 млинців = 400 г» — which gives a
// product or a dish its piece weight, so it can be logged by count and by
// weight. The whole batch never has to be counted.
import { uk } from "../i18n/uk";
import { positiveOrNull, round2 } from "../lib/measure";

const t = uk.foods.pack;

/** The weighed pair, or the problem to show when only half of it is filled in. */
export function weighedPair(pieces: string, grams: string): { weighedPieces: number | null; weighedGrams: number | null } | { problem: string } {
  const p = positiveOrNull(pieces);
  const g = positiveOrNull(grams);
  if ((pieces.trim() !== "" || grams.trim() !== "") && (p === null || g === null)) return { problem: t.weighedIncomplete };
  return { weighedPieces: p, weighedGrams: g };
}

export default function WeighedPiecesFields({
  pieces,
  grams,
  onChange,
  hint = t.weighedHint,
}: {
  pieces: string;
  grams: string;
  onChange: (pieces: string, grams: string) => void;
  hint?: string;
}) {
  const p = positiveOrNull(pieces);
  const g = positiveOrNull(grams);
  const weight = p !== null && g !== null ? g / p : null;
  return (
    <fieldset className="pack-fields">
      <legend>
        {t.weighedLegend} <span className="pack-optional">{t.optional}</span>
      </legend>
      <div className="pack-amounts">
        <label>
          {t.weighedPiecesLabel}
          <input type="text" inputMode="decimal" value={pieces} onChange={(e) => onChange(e.target.value, grams)} />
        </label>
        <label>
          {t.weighedGramsLabel}
          <input type="text" inputMode="decimal" value={grams} onChange={(e) => onChange(pieces, e.target.value)} />
        </label>
      </div>
      <p className="food-form-hint">{weight !== null ? t.pieceWeight(round2(weight)) : hint}</p>
    </fieldset>
  );
}
