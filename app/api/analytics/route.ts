import { NextResponse } from "next/server";
import { generateWeeklyInsights } from "@/lib/ai/analytics-engine";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const insights = await generateWeeklyInsights(body);
    return NextResponse.json(insights);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
