import { describe, expect, it } from "vitest";
import { cycleGlycemicFlag, toGlycemicFlag } from "./glycemicFlag";

describe("toGlycemicFlag", () => {
  it("passes through recognized values", () => {
    expect(toGlycemicFlag("watch")).toBe("watch");
    expect(toGlycemicFlag("avoid")).toBe("avoid");
    expect(toGlycemicFlag("none")).toBe("none");
  });

  it("defaults unrecognized or missing values to none", () => {
    expect(toGlycemicFlag("weird")).toBe("none");
    expect(toGlycemicFlag(undefined)).toBe("none");
    expect(toGlycemicFlag("")).toBe("none");
  });
});

describe("cycleGlycemicFlag", () => {
  it("cycles none -> watch -> avoid -> none", () => {
    expect(cycleGlycemicFlag("none")).toBe("watch");
    expect(cycleGlycemicFlag("watch")).toBe("avoid");
    expect(cycleGlycemicFlag("avoid")).toBe("none");
  });
});
