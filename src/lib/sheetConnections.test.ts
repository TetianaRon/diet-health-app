import { describe, expect, it } from "vitest";
import { addRecentSheet, connectOptions, forgetRecentSheet, knownSheetIds, MAX_RECENT_SHEETS, renameRecentSheet, type RecentSheet } from "./sheetConnections";

const at = (iso: string) => new Date(iso);

describe("recent sheets", () => {
  it("puts the connected sheet first, without repeats", () => {
    let list: RecentSheet[] = [];
    list = addRecentSheet(list, { id: "a", title: "A" }, at("2026-10-01T10:00:00Z"));
    list = addRecentSheet(list, { id: "b", title: "B" }, at("2026-10-02T10:00:00Z"));
    list = addRecentSheet(list, { id: "a", title: "A" }, at("2026-10-03T10:00:00Z"));
    expect(list.map((s) => s.id)).toEqual(["a", "b"]);
    expect(list[0].lastUsed).toBe("2026-10-03T10:00:00.000Z");
  });

  it("keeps a known title when reconnecting without one (pasted link)", () => {
    const list = addRecentSheet([{ id: "a", title: "Мамина", lastUsed: "" }], { id: "a", title: "" });
    expect(list[0].title).toBe("Мамина");
  });

  it("keeps at most MAX_RECENT_SHEETS", () => {
    let list: RecentSheet[] = [];
    for (let i = 0; i < MAX_RECENT_SHEETS + 3; i++) list = addRecentSheet(list, { id: `s${i}`, title: "" });
    expect(list).toHaveLength(MAX_RECENT_SHEETS);
    expect(list[0].id).toBe(`s${MAX_RECENT_SHEETS + 2}`);
  });

  it("renames in place and forgets", () => {
    const list: RecentSheet[] = [
      { id: "a", title: "A", lastUsed: "1" },
      { id: "b", title: "B", lastUsed: "2" },
    ];
    expect(renameRecentSheet(list, "b", "B2").map((s) => s.title)).toEqual(["A", "B2"]);
    expect(renameRecentSheet(list, "b", "")).toEqual(list);
    expect(forgetRecentSheet(list, "a").map((s) => s.id)).toEqual(["b"]);
  });
});

describe("knownSheetIds", () => {
  it("drops blanks and repeats, and accepts comma lists", () => {
    expect(knownSheetIds(["m", "", undefined, "t", "m", " x , y ,"])).toEqual(["m", "t", "x", "y"]);
  });
});

describe("connectOptions", () => {
  it("shows each sheet once, in the first section it belongs to, without the connected one", () => {
    const result = connectOptions({
      currentId: "cur",
      found: [
        { id: "cur", title: "Current" },
        { id: "f", title: "Found" },
      ],
      recent: [
        { id: "f", title: "Found", lastUsed: "" },
        { id: "r", title: "Recent", lastUsed: "" },
      ],
      known: [
        { id: "r", title: "Recent" },
        { id: "k", title: "Known" },
        { id: "cur", title: "Current" },
      ],
    });
    expect(result.found.map((s) => s.id)).toEqual(["f"]);
    expect(result.recent.map((s) => s.id)).toEqual(["r"]);
    expect(result.known.map((s) => s.id)).toEqual(["k"]);
  });

  it("works with nothing connected", () => {
    expect(connectOptions({ currentId: "", found: [{ id: "f", title: "" }], recent: [], known: [] }).found).toHaveLength(1);
  });
});
