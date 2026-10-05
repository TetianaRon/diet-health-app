import { describe, expect, it } from "vitest";
import { uk } from "./uk";

// Ukrainian readers write a decimal comma; numbers in UI strings must never show "0.2".
describe("numbers in UI strings", () => {
  it("use a decimal comma", () => {
    expect(uk.today.mealGapWarning(115.08)).toContain("115,1 год");
    expect(uk.today.mealStat.fat(0.18)).toBe("Жири: 0,2 г");
    expect(uk.today.recommendation.fat(0.18, 18)).toBe("Жири: 0,2 г (ліміт на прийом 18 г)");
    expect(uk.today.recommendation.basis(6, 25, 8.333)).toContain("перекус — 8,3 %");
    expect(uk.today.carbsValue(1.67)).toBe("1,7 г вуглеводів");
  });
});
