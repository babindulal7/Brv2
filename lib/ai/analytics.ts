import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateWeeklyInsights(aggregates: unknown) {
  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: [
      { role: 'system', content: 'Analyze ONLY weekly/monthly aggregates. Return JSON with alerts, recommendations, actionSuggestions.' },
      { role: 'user', content: JSON.stringify(aggregates) }
    ],
    text: { format: { type: 'json_object' } }
  });

  return JSON.parse(response.output_text);
}
