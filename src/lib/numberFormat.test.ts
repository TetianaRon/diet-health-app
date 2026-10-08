import { describe, expect, it } from "vitest";
import { fieldDecimal, formatDecimal, parseDecimal } from "./numberFormat";

describe("decimal comma", () => {
  it("shows a value with a comma", () => {
    expect(formatDecimal(6.2)).toBe("6,2");
  });

  it("fills a field the way she types it (2.1), and reads either separator back", () => {
    expect(fieldDecimal(37.13)).toBe("37,13");
    expect(fieldDecimal(100)).toBe("100");
    expect(fieldDecimal(0.12345)).toBe("0,1235");
    expect(parseDecimal(fieldDecimal(37.13))).toBe(37.13);
    expect(parseDecimal("7.8")).toBe(7.8);
  });
});
