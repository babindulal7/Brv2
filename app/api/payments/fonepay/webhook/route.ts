import { NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const invoiceNumber = payload.prn as string;
    const status = payload.status === "SUCCESS" ? "paid" : "failed";
    const { error: invoiceError } = await supabase
      .from("invoices")
      .update({ payment_status: status })
      .eq("invoice_number", invoiceNumber);
    if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });
    const { error: paymentError } = await supabase
      .from("payments")
      .insert({ provider: "fonepay", provider_ref: payload.refId, amount: Number(payload.am), status, payload });
    if (paymentError) return NextResponse.json({ error: paymentError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
