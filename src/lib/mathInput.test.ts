import { describe, expect, it } from "vitest";
import { evaluateInput, isCalculation } from "./mathInput";

describe("evaluateInput", () => {
  it("reads plain numbers with a comma or a point", () => {
    expect(evaluateInput("150")).toBe(150);
    expect(evaluateInput("7,5")).toBe(7.5);
    expect(evaluateInput("7.5")).toBe(7.5);
    expect(evaluateInput("")).toBeNull();
  });

  it("calculates, with the usual order and brackets", () => {
    expect(evaluateInput("200*3/4")).toBe(150);
    expect(evaluateInput("150+30")).toBe(180);
    expect(evaluateInput("(100+50)/3")).toBe(50);
    expect(evaluateInput("2 × 180")).toBe(360);
    expect(evaluateInput("2 х 180")).toBe(360);
    expect(evaluateInput("300 ÷ 2")).toBe(150);
    expect(evaluateInput("12,5 * 2")).toBe(25);
  });

  it("ignores unit words", () => {
    expect(evaluateInput("200 ккал * 3/4")).toBe(150);
    expect(evaluateInput("200cal*3/4")).toBe(150);
    expect(evaluateInput("45 г")).toBe(45);
  });

  it("gives nothing for what isn't a calculation", () => {
    expect(evaluateInput("ккал")).toBeNull();
    expect(evaluateInput("2 *")).toBeNull();
    expect(evaluateInput("10/0")).toBeNull();
    expect(evaluateInput("(2+3")).toBeNull();
  });
});

describe("isCalculation", () => {
  it("tells a calculation from a plain number", () => {
    expect(isCalculation("200*3/4")).toBe(true);
    expect(isCalculation("200 ккал * 3/4")).toBe(true);
    expect(isCalculation("150")).toBe(false);
    expect(isCalculation("7,5")).toBe(false);
    expect(isCalculation("-5")).toBe(false);
  });
});
