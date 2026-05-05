import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

export async function POST(req: Request) {
  const payload = await req.json();
  const invoiceNumber = payload.prn as string;
  const status = payload.status === "SUCCESS" ? "paid" : "failed";
  await supabase.from("invoices").update({ payment_status: status }).eq("invoice_number", invoiceNumber);
  await supabase.from("payments").insert({ provider: "fonepay", provider_ref: payload.refId, amount: Number(payload.am), status, payload });
  return NextResponse.json({ ok: true });
}
