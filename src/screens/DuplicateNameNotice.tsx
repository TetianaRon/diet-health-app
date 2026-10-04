// The duplicate-name check (release 1.6, spec → "Item IDs and the sheet
// upgrade"): shown under a name field when another item already has that
// (normalised) name. Saving stays blocked until she picks one of the two —
// nothing is ever overwritten by name any more, but two items called «хліб»
// would be easy to mix up in a hurry.
import { uk } from "../i18n/uk";

export interface NamedItem {
  id: string;
  basedOn: string;
  nameUk: string;
  caloriesKcal: number;
  source: "starter" | "usda" | "manual";
  kind: "ingredient" | "dish";
}

export default function DuplicateNameNotice({
  match,
  suggestedName,
  onRename,
  onUseExisting,
}: {
  match: NamedItem;
  suggestedName: string;
  onRename: (name: string) => void;
  /** Omitted where "use the existing one" makes no sense (e.g. while editing an item). */
  onUseExisting?: (item: NamedItem) => void;
}) {
  return (
    <div className="duplicate-notice" role="status">
      <p>
        <strong>{uk.duplicateName.exists(match.kind, match.nameUk)}</strong>
      </p>
      <p className="food-form-hint">{uk.duplicateName.card(match.caloriesKcal, uk.foods.form.source[match.source])}</p>
      <div className="food-form-actions">
        {onUseExisting && (
          <button type="button" onClick={() => onUseExisting(match)}>
            {uk.duplicateName.useExisting}
          </button>
        )}
        <button type="button" className="button-secondary" onClick={() => onRename(suggestedName)}>
          {uk.duplicateName.rename(suggestedName)}
        </button>
      </div>
      <p className="food-form-hint">{uk.duplicateName.hint}</p>
    </div>
  );
}
