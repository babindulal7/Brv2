import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateWeeklyInsights(payload: {
  week: string;
  utilizationByCategory: Record<string, number>;
  revenueByWeek: Array<{ week: string; revenue: number; expense: number }>;
  idleEquipment: Array<{ name: string; idleDays: number }>;
  bundlePairs: Array<{ pair: string; frequency: number }>;
}) {
  const prompt = `Analyze aggregated weekly rental business data only and return JSON with insights, alerts, recommendations, actionSuggestions. Data: ${JSON.stringify(payload)}`;
  const response = await client.responses.create({ model: "gpt-4.1-mini", input: prompt, text: { format: { type: "json_object" } } });
  return JSON.parse(response.output_text);
}
