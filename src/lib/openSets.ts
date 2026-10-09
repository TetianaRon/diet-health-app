// A request to open «Продукти» → «Набори з бази» from outside the screen (the
// first-run offer, 2.2). The app switches tabs; FoodsScreen takes the request
// when it shows.
const listeners = new Set<() => void>();
let pending = false;

export function requestOpenSets(): void {
  pending = true;
  for (const listener of listeners) listener();
}

/** True once per request: FoodsScreen opens the sets and clears it. */
export function takeOpenSetsRequest(): boolean {
  const was = pending;
  pending = false;
  return was;
}

export function onOpenSetsRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
