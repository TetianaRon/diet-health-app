import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error — plain JS Vercel function, no type declarations
import handler from "../api/translate.js";

function call(body: unknown, { origin = "https://track-my-meals.roncreator.com", method = "POST" } = {}) {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    payload: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.payload = value;
      return this;
    },
    end() {
      return this;
    },
  };
  return Promise.resolve(handler({ method, headers: { origin }, body }, res)).then(() => res);
}

describe("api/translate", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("translates through Google and returns the texts in order", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { translations: [{ translatedText: "corn" }, { translatedText: "carrot" }] } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await call({ q: ["кукурудза", "морква"], source: "uk", target: "en" });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ translations: ["corn", "carrot"] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      q: ["кукурудза", "морква"],
      source: "uk",
      target: "en",
      format: "text",
    });
  });

  it("refuses other websites", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const res = await call({ q: ["x"], source: "uk", target: "en" }, { origin: "https://example.com" });
    expect(res.statusCode).toBe(403);
  });

  it("accepts the Android app and local development", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { translations: [{ translatedText: "a" }] } }) }));
    expect((await call({ q: ["a"], source: "en", target: "uk" }, { origin: "https://localhost" })).statusCode).toBe(200);
    expect((await call({ q: ["a"], source: "en", target: "uk" }, { origin: "http://localhost:5173" })).statusCode).toBe(200);
  });

  it("limits what one request may ask for", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await call({ q: Array(7).fill("a"), source: "en", target: "uk" })).statusCode).toBe(400);
    expect((await call({ q: ["a".repeat(201)], source: "en", target: "uk" })).statusCode).toBe(400);
    expect((await call({ q: Array(5).fill("a".repeat(170)), source: "en", target: "uk" })).statusCode).toBe(400);
    expect((await call({ q: ["a"], source: "en", target: "en" })).statusCode).toBe(400);
    expect((await call({ q: ["a"], source: "de", target: "uk" })).statusCode).toBe(400);
    expect((await call({ q: [""], source: "en", target: "uk" })).statusCode).toBe(400);
  });

  it("turns Google's daily quota error into 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: "Daily Limit Exceeded", errors: [{ reason: "dailyLimitExceeded" }] } }),
      }),
    );
    const res = await call({ q: ["a"], source: "en", target: "uk" });
    expect(res.statusCode).toBe(429);
  });

  it("reports other Google failures as 502", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { message: "Bad key" } }) }));
    expect((await call({ q: ["a"], source: "en", target: "uk" })).statusCode).toBe(502);
  });

  it("fails clearly when the key isn't configured", async () => {
    vi.stubEnv("GOOGLE_TRANSLATE_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    expect((await call({ q: ["a"], source: "en", target: "uk" })).statusCode).toBe(500);
  });
});
