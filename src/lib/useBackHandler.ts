// What Android's back does while a dialog or sub-screen is shown (backStack.ts).
import { useEffect, useRef } from "react";
import { pushBackHandler } from "./backStack";

/**
 * While `active`, back runs `handler` (the latest one passed — no need to
 * memoise). Registered in mount order, so a dialog opened over a screen
 * answers first. A busy dialog still takes back and ignores it, rather than
 * letting it fall through to the screen behind.
 */
export function useBackHandler(active: boolean, handler: () => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(() => ref.current());
  }, [active]);
}
