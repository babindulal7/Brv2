import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/server';

export async function GET() {
  const [{ data: rentals }, { data: expenses }] = await Promise.all([
    supabase.from('rentals').select('total,status'),
    supabase.from('expenses').select('amount')
  ]);

  const revenue = rentals?.reduce((a, r) => a + Number(r.total), 0) ?? 0;
  const expense = expenses?.reduce((a, e) => a + Number(e.amount), 0) ?? 0;
  return NextResponse.json({ revenue, expense, profit: revenue - expense });
}
