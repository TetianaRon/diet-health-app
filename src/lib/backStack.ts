// Android's back button and gesture (release 2.0, build 22). The app switches
// screens itself (no browser history), so back did nothing at all. Now every
// place that can be "left" registers what back does there; the newest
// registration wins, so an open dialog answers before the screen under it:
//   dialog → its close / cancel; sub-screen → its breadcrumb's parent;
//   History, Foods, Settings → Today (App.tsx); Today → leaves the app.
// No imports from the app, so it's unit-testable.

type BackHandler = () => void;

const stack: { id: number; handler: BackHandler }[] = [];
let nextId = 0;

/** Registers what back does here, until the returned function is called. */
export function pushBackHandler(handler: BackHandler): () => void {
  const id = nextId++;
  stack.push({ id, handler });
  return () => {
    const i = stack.findIndex((entry) => entry.id === id);
    if (i !== -1) stack.splice(i, 1);
  };
}

/** Runs the newest handler. False when nothing registered (the caller decides: Today, or leave). */
export function handleBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.handler();
  return true;
}
