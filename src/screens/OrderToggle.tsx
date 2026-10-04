// «Спочатку нові» / «Спочатку старі» — a toggle on the screen itself, one per
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

export default function OrderToggle({ order, onChange }: { order: DisplayOrder; onChange: (order: DisplayOrder) => void }) {
  return (
    <div className="order-toggle" role="group" aria-label={uk.order.label}>
      {(["newest", "oldest"] as const).map((value) => (
        <button
          key={value}
          type="button"
          className={order === value ? "order-option active" : "order-option"}
          aria-pressed={order === value}
          onClick={() => onChange(value)}
        >
          {uk.order[value]}
        </button>
      ))}
    </div>
  );
}
