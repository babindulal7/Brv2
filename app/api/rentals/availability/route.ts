import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

type RentalRow = { id: string; rental_items: { equipment_unit_id: string }[] };

export async function POST(req: Request) {
  try {
    const { startDate, endDate, equipmentUnitIds } = await req.json();
    const { data, error } = await supabase
      .from("rentals")
      .select("id,rental_items(equipment_unit_id)")
      .in("status", ["booked", "active"])
      .lte("start_date", endDate)
      .gte("end_date", startDate);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const booked = new Set(
      (data as RentalRow[] ?? []).flatMap((r) => r.rental_items.map((i) => i.equipment_unit_id))
    );
    return NextResponse.json({ available: (equipmentUnitIds as string[]).filter((id) => !booked.has(id)) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
