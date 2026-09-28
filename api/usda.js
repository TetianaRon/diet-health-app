// Vercel Function: USDA FoodData Central search proxy, so the USDA API key
// stays on the server (env var USDA_API_KEY) instead of being baked into the
// public JavaScript of the web app and the Android APK.
//
// GET /api/usda?query=...&pageSize=...&dataType=...
// Only the three parameters the app uses are forwarded; anything else is
// dropped. Responses are public nutrition data, so they're cached at the edge
// for a day to spare the key's rate limit.
//
// Called same-origin by the web app (track-my-meals.roncreator.com) and
// cross-origin by the Android app, whose WebView origin is https://localhost
// (Capacitor's default), hence the small CORS allow-list.

const USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const ALLOWED_ORIGINS = new Set(["https://localhost", "capacitor://localhost", "http://localhost"]);
const ALLOWED_DATA_TYPES = new Set(["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"]);

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET");
    return res.status(204).end();
  }
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error("usda: USDA_API_KEY is not set");
    return res.status(500).json({ error: "not configured" });
  }

  const query = String(req.query.query ?? "").trim().slice(0, 200);
  if (!query) return res.status(400).json({ error: "query is required" });
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 200);
  const dataType = String(req.query.dataType ?? "Foundation,SR Legacy")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => ALLOWED_DATA_TYPES.has(t))
    .join(",");

  const params = new URLSearchParams({ query, pageSize: String(pageSize), api_key: apiKey });
  if (dataType) params.set("dataType", dataType);

  try {
    const upstream = await fetch(`${USDA_SEARCH_URL}?${params}`);
    const body = await upstream.text();
    if (upstream.ok) res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
    return res.status(upstream.status).send(body);
  } catch (err) {
    console.error("usda: upstream request failed", err);
    return res.status(502).json({ error: "USDA request failed" });
  }
}
