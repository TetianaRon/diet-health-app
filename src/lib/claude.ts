// Thin client for nutrition lookups. Always goes through the serverless proxy
// (api/lookup-food.ts) — never call the Anthropic API directly from here,
// it would expose the API key to the browser.

export interface FoodEstimate {
  nameEn: string;
  carbsG: number;
  gi: number;
  fiberG: number;
  sugarsG: number;
  proteinG: number;
  fatG: number;
  caloriesKcal: number;
  sodiumMg: number;
}

export async function lookupFood(nameEn: string): Promise<FoodEstimate> {
  const response = await fetch("/api/lookup-food", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nameEn }),
  });
  if (!response.ok) {
    throw new Error(`lookupFood failed: ${response.status}`);
  }
  return response.json();
}
