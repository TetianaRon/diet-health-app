import { describe, expect, it } from "vitest";
import { handleBack, pushBackHandler } from "./backStack";

describe("backStack", () => {
  it("does nothing when nothing is registered", () => {
    expect(handleBack()).toBe(false);
  });

  it("the newest registration answers back (a dialog before the screen under it)", () => {
    const calls: string[] = [];
    const offScreen = pushBackHandler(() => calls.push("screen"));
    const offDialog = pushBackHandler(() => calls.push("dialog"));
    expect(handleBack()).toBe(true);
    offDialog();
    expect(handleBack()).toBe(true);
    offScreen();
    expect(handleBack()).toBe(false);
    expect(calls).toEqual(["dialog", "screen"]);
  });

  it("removing an older registration leaves the newer one in charge", () => {
    const calls: string[] = [];
    const offA = pushBackHandler(() => calls.push("a"));
    const offB = pushBackHandler(() => calls.push("b"));
    offA();
    handleBack();
    offB();
    expect(calls).toEqual(["b"]);
    expect(handleBack()).toBe(false);
  });
});
