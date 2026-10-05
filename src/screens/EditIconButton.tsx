// The pencil button that opens an entry for editing (release 1.7) — an icon
// instead of the word «Редагувати», to keep lists clean. The full wording
// (what is being edited) is the tooltip and the screen-reader label.
export default function EditIconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
        <path d="m13.5 6.5 4 4" />
      </svg>
    </button>
  );
}
