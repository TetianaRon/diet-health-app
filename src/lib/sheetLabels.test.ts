import { describe, expect, it } from "vitest";
import { labelFor } from "./sheetLabels";
import { PRODUCTS_HEADERS } from "./products";
import { DAILY_LOG_HEADERS } from "./dailyLog";
import { BLOOD_SUGAR_HEADERS } from "./bloodSugar";
import { MEDICATIONS_HEADERS, MEDICATION_LOG_HEADERS } from "./medications";
import { WEIGHT_HEADERS } from "./weight";
import { DELETED_HEADERS } from "./deletions";

describe("readable column names", () => {
  // 2.1 and 2.1.1 added columns without one, so their name cells showed the key («YieldMl»).
  it("every column of every tab has a Ukrainian name", () => {
    const all = [PRODUCTS_HEADERS, DAILY_LOG_HEADERS, BLOOD_SUGAR_HEADERS, MEDICATIONS_HEADERS, MEDICATION_LOG_HEADERS, WEIGHT_HEADERS, DELETED_HEADERS].flat();
    expect(all.filter((h) => labelFor(h) === h || labelFor(h).trim() === "")).toEqual([]);
  });

  it("replaces names the app wrote (earlier names, bare keys) but never a person's own", async () => {
    const { staleLabelColumns } = await import("./sheetLabels");
    const index = new Map([["YieldMl", 0], ["Basis", 1], ["NameUk", 2]]);
    expect(staleLabelColumns(["YieldMl", "Значення на (100g — 100 г, piece — 1 шт.)", "Моя назва"], index, ["YieldMl", "Basis", "NameUk"])).toEqual([0, 1]);
  });
});
