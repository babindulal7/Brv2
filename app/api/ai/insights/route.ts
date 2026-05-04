import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server';
import { generateWeeklyInsights } from '@/lib/ai/analytics';

export async function POST() {
  const { data: snapshots } = await supabase
    .from('analytics_snapshots')
    .select('*')
    .eq('granularity', 'weekly')
    .order('period_end', { ascending: false })
    .limit(8);

  const insights = await generateWeeklyInsights(snapshots ?? []);
  return NextResponse.json(insights);
}
