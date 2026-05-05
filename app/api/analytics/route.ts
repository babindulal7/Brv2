import { NextResponse } from "next/server";
import { generateWeeklyInsights } from "@/lib/ai/analytics-engine";

export async function POST(req: Request) {
  const body = await req.json();
  const insights = await generateWeeklyInsights(body);
  return NextResponse.json(insights);
}
