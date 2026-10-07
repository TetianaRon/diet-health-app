import { describe, expect, it } from "vitest";
import { isStale, STALE_AFTER_MS } from "./sync";

describe("isStale", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  it("treats a copy never pulled, or with an unreadable time, as stale", () => {
    expect(isStale(null, now)).toBe(true);
    expect(isStale("not a date", now)).toBe(true);
  });
  it("refreshes after five minutes, not before", () => {
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS + 1000).toISOString(), now)).toBe(false);
    expect(isStale(new Date(now.getTime() - STALE_AFTER_MS).toISOString(), now)).toBe(true);
  });
});
