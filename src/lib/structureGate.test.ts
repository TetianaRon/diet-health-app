import { afterEach, describe, expect, it, vi } from "vitest";
import { holdReadsForCheck, releaseStructureGate, structureReady } from "./structureGate";

afterEach(() => {
  releaseStructureGate();
  vi.useRealTimers();
});

describe("structureGate", () => {
  it("lets reads through when no check holds them", async () => {
    await expect(structureReady()).resolves.toBeUndefined();
  });

  it("holds reads until the check releases them", async () => {
    holdReadsForCheck();
    let passed = false;
    const read = structureReady().then(() => (passed = true));
    await Promise.resolve();
    expect(passed).toBe(false);
    releaseStructureGate();
    await read;
    expect(passed).toBe(true);
  });

  it("holding twice needs one release", async () => {
    holdReadsForCheck();
    holdReadsForCheck();
    const read = structureReady();
    releaseStructureGate();
    await expect(read).resolves.toBeUndefined();
    await expect(structureReady()).resolves.toBeUndefined();
  });

  it("never holds longer than 30 seconds", async () => {
    vi.useFakeTimers();
    holdReadsForCheck();
    let passed = false;
    const read = structureReady().then(() => (passed = true));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(passed).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    await read;
    expect(passed).toBe(true);
  });
});
