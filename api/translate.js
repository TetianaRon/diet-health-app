// Vercel Function: Google Cloud Translation proxy, so the API key stays on
// the server (env var GOOGLE_TRANSLATE_API_KEY) — same reason as api/usda.js.
// Replaced the free MyMemory service in 1.5.2, whose tiny anonymous daily
// limit made the add-food search fail (docs/roadmap.md, 1.5.1 / 1.5.2).
//
// POST /api/translate  { q: string[] | string, source: "uk"|"en", target: "uk"|"en" }
//   -> 200 { translations: string[] }        same order as q
//   -> 429 { error: "limit" }                Google's daily cap reached (see below)
//
// Cost safety lives in three places: the project's quota in Google Cloud
// ("v2 and v3 general model characters per day" = 15,000, which keeps a
// 31-day month under the 500,000 free characters), a per-device daily limit
// in the app (src/lib/nutrition.ts), and the small request limits here, so
// one call can't use much of the day. Only food names are ever sent.

const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";
const LANGUAGES = new Set(["uk", "en"]);
const MAX_TEXTS = 6; // the search word, or the top 5 result names
const MAX_TEXT_LENGTH = 200;
const MAX_TOTAL_LENGTH = 800;

// Browsers always send Origin on a cross-origin or POST fetch, so requests
// from other websites are refused. (Not a lock against scripts — the Google
// quota is the real guarantee.)
function allowedOrigins() {
  const origins = new Set([
    "https://track-my-meals.roncreator.com",
    "https://localhost", // Android app (Capacitor WebView)
    "capacitor://localhost",
  ]);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) origins.add(`https://${host}`); // this deployment's own preview address
  }
  return origins;
}

function isAllowedOrigin(origin) {
  return allowedOrigins().has(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
}

export default async function handler(req, res) {
  const origin = req.headers.origin ?? "";
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });
  if (!isAllowedOrigin(origin)) return res.status(403).json({ error: "origin not allowed" });

  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    console.error("translate: GOOGLE_TRANSLATE_API_KEY is not set");
    return res.status(500).json({ error: "not configured" });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body ?? {};
  const { source, target } = body;
  const q = (Array.isArray(body.q) ? body.q : [body.q]).map((t) => (typeof t === "string" ? t.trim() : ""));
  if (!LANGUAGES.has(source) || !LANGUAGES.has(target) || source === target) {
    return res.status(400).json({ error: "source and target must be uk/en and differ" });
  }
  if (q.length === 0 || q.length > MAX_TEXTS || q.some((t) => !t || t.length > MAX_TEXT_LENGTH)) {
    return res.status(400).json({ error: `1-${MAX_TEXTS} non-empty texts of up to ${MAX_TEXT_LENGTH} characters` });
  }
  if (q.reduce((sum, t) => sum + t.length, 0) > MAX_TOTAL_LENGTH) {
    return res.status(400).json({ error: "request too long" });
  }

  try {
    const upstream = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q, source, target, format: "text" }),
    });
    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      // The daily quota answers 403 (dailyLimitExceeded) or 429 depending on
      // the API version — both mean "no more translation today".
      const reasons = (data?.error?.errors ?? []).map((e) => e.reason).join(",");
      if (upstream.status === 429 || /limit|quota/i.test(reasons) || /quota/i.test(data?.error?.message ?? "")) {
        return res.status(429).json({ error: "limit" });
      }
      console.error("translate: upstream error", upstream.status, data?.error?.message);
      return res.status(502).json({ error: "translation failed" });
    }

    const translations = (data?.data?.translations ?? []).map((t) => t.translatedText);
    if (translations.length !== q.length) return res.status(502).json({ error: "translation failed" });
    return res.status(200).json({ translations });
  } catch (err) {
    console.error("translate: upstream request failed", err);
    return res.status(502).json({ error: "translation failed" });
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
