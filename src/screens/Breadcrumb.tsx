import { uk } from "../i18n/uk";
import { useBackHandler } from "../lib/useBackHandler";

export interface Crumb {
  label: string;
  onClick: () => void;
}

// The "where am I / how do I go back" trail shown at the very top of every
// editor and add screen, so leaving one never depends on finding a Cancel
// button at the bottom of a long form. Every level above the current one is
// tappable (the first also carries the "‹" back cue); the current screen is
// plain text. Sticks to the top while the form scrolls. Android's back does
// what tapping the level above does.
export default function Breadcrumb({ trail, current }: { trail: Crumb[]; current: string }) {
  // Android's back steps up one level, like tapping the level above (backStack.ts).
  useBackHandler(trail.length > 0, () => trail[trail.length - 1]?.onClick());
  return (
    <nav className="breadcrumb" aria-label={uk.breadcrumb.label}>
      {trail.map((crumb, i) => (
        <span key={`${i}-${crumb.label}`} className="breadcrumb-item">
          <button type="button" className="breadcrumb-link" onClick={crumb.onClick}>
            {i === 0 && <span aria-hidden="true">‹ </span>}
            {crumb.label}
          </button>
          <span className="breadcrumb-sep" aria-hidden="true">
            ›
          </span>
        </span>
      ))}
      <span className="breadcrumb-current" aria-current="page">
        {current}
      </span>
    </nav>
  );
}
