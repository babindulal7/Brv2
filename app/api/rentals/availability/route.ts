import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

export async function POST(req: Request) {
  const { startDate, endDate, equipmentUnitIds } = await req.json();
  const { data } = await supabase
    .from("rentals")
    .select("id,rental_items(equipment_unit_id)")
    .in("status", ["booked", "active"])
    .lte("start_date", endDate)
    .gte("end_date", startDate);
  const booked = new Set((data ?? []).flatMap((r: any) => r.rental_items.map((i: any) => i.equipment_unit_id)));
  return NextResponse.json({ available: equipmentUnitIds.filter((id: string) => !booked.has(id)) });
}
