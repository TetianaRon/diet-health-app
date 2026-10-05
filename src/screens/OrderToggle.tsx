// «Спочатку нові» / «Спочатку старі» — an arrows button on the screen itself, one per
// screen (Сьогодні, Історія), remembered on the device only: a viewing
// preference, not data, so it's never written to the sheet (release 1.7).
import { useState } from "react";
import { uk } from "../i18n/uk";
import type { DisplayOrder } from "../lib/records";

const STORAGE_PREFIX = "trackmymeals.order.";

function readOrder(screen: string): DisplayOrder {
  try {
    return localStorage.getItem(STORAGE_PREFIX + screen) === "oldest" ? "oldest" : "newest";
  } catch {
    return "newest";
  }
}

/** This screen's display order (default newest first) and a setter that remembers it on the device. */
export function useDisplayOrder(screen: string): [DisplayOrder, (order: DisplayOrder) => void] {
  const [order, setOrder] = useState<DisplayOrder>(() => readOrder(screen));
  const update = (next: DisplayOrder) => {
    setOrder(next);
    try {
      localStorage.setItem(STORAGE_PREFIX + screen, next);
    } catch {
      // storage blocked — the choice just isn't remembered
    }
  };
  return [order, update];
}

/**
 * One small arrows button: tap flips the order. The arrow for the current
 * order is drawn in the accent colour (down = newest first, up = oldest
 * first); the full wording is in the tooltip / screen-reader label.
 */
export default function OrderToggle({ order, onChange }: { order: DisplayOrder; onChange: (order: DisplayOrder) => void }) {
  const next: DisplayOrder = order === "newest" ? "oldest" : "newest";
  const label = uk.order.switchTo(uk.order[order], uk.order[next]);
  return (
    <button type="button" className={`order-toggle order-${order}`} aria-label={label} title={label} onClick={() => onChange(next)}>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path className="order-arrow-down" d="M8 4v15m-4-4 4 4 4-4" />
        <path className="order-arrow-up" d="M16 20V5m-4 4 4-4 4 4" />
      </svg>
    </button>
  );
}
