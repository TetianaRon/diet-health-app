import { beforeEach, describe, expect, it, vi } from "vitest";

const native = { value: false };
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.value } }));

const { rememberMe, rememberedEmail, setRememberMe, setRememberedEmail } = await import("./rememberMe");

describe("«Запам'ятати мене на цьому пристрої»", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    native.value = false;
  });

  it("is off on the web and on in the app until changed (developer, 2026-10-08)", () => {
    expect(rememberMe()).toBe(false);
    native.value = true;
    expect(rememberMe()).toBe(true);
    setRememberMe(false);
    expect(rememberMe()).toBe(false);
  });

  it("keeps the address for «Продовжити як …» only while it's on, and forgets it when turned off", () => {
    setRememberedEmail("a@example.com");
    expect(rememberedEmail()).toBeNull(); // off on the web: nothing stored
    setRememberMe(true);
    setRememberedEmail("a@example.com");
    expect(rememberedEmail()).toBe("a@example.com");
    setRememberMe(false);
    expect(rememberedEmail()).toBeNull();
    setRememberMe(true);
    expect(rememberedEmail()).toBeNull(); // turning it back on doesn't bring the old address back
  });
});
