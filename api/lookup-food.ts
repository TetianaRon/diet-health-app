// Serverless proxy for nutrition lookups. Keeps ANTHROPIC_API_KEY server-side —
// the frontend (src/lib/claude.ts) only ever talks to this endpoint.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LOOKUP_PROMPT = (nameEn: string) => `
Estimate nutritional values per 100g for: "${nameEn}".
Respond with ONLY a JSON object, no prose, matching exactly this shape:
{"nameEn": string, "carbsG": number, "gi": number, "fiberG": number, "sugarsG": number, "proteinG": number, "fatG": number, "caloriesKcal": number, "sodiumMg": number}
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { nameEn } = req.body ?? {};
  if (typeof nameEn !== "string" || nameEn.trim().length === 0) {
    res.status(400).json({ error: "nameEn is required" });
    return;
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: LOOKUP_PROMPT(nameEn) }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    res.status(502).json({ error: "No text response from model" });
    return;
  }

  try {
    const estimate = JSON.parse(textBlock.text);
    res.status(200).json(estimate);
  } catch {
    res.status(502).json({ error: "Model response was not valid JSON", raw: textBlock.text });
  }
}
