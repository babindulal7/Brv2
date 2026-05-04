import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/server';

const RentalSchema = z.object({
  tenant_id: z.string().uuid(),
  client_id: z.string().uuid(),
  start_at: z.string(),
  end_at: z.string(),
  subtotal: z.number(),
  total: z.number(),
  items: z.array(z.object({ equipment_id: z.string().uuid(), qty: z.number().int().positive(), price_per_day: z.number(), days: z.number().int().positive(), line_total: z.number() }))
});

export async function POST(req: NextRequest) {
  const payload = RentalSchema.parse(await req.json());
  const overlap = await supabase
    .from('rentals')
    .select('id')
    .lte('start_at', payload.end_at)
    .gte('end_at', payload.start_at)
    .in('status', ['booked', 'active']);

  if ((overlap.data?.length ?? 0) > 0) {
    return NextResponse.json({ error: 'Rental overlap detected' }, { status: 409 });
  }

  const { data: rental, error } = await supabase.from('rentals').insert(payload).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('rental_items').insert(payload.items.map((i) => ({ ...i, rental_id: rental.id })));
  return NextResponse.json({ id: rental.id }, { status: 201 });
}
