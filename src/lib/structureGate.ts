// Screens wait for the sheet check (release 2.0, build 20). On the first open
// after an app update, the screens and the check start together: the screens'
// reads met columns the new version needs before the check had added them,
// and showed «Вкладка … має неправильну структуру…» for something the app was
// fixing that moment. Now sign-in and every check hold ordinary reads until
// the check is done (sheets.ts → readTabs); the check's own reads are fresh
// ones and don't wait. No imports, so any module can use it.

/** A check that never finishes must not freeze the screens. */
const MAX_HOLD_MS = 30_000;

let gate: Promise<void> | null = null;
let release: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Holds ordinary reads until releaseStructureGate() (or MAX_HOLD_MS). */
export function holdReadsForCheck(): void {
  if (gate) return;
  gate = new Promise<void>((resolve) => (release = resolve));
  timer = setTimeout(releaseStructureGate, MAX_HOLD_MS);
}

export function releaseStructureGate(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  release?.();
  release = null;
  gate = null;
}

/** Resolves once no check holds reads. */
export function structureReady(): Promise<void> {
  return gate ?? Promise.resolve();
}
