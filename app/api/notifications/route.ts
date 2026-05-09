import { NextResponse } from "next/server";
import { sendEmail, sendWhatsApp } from "@/lib/integrations/notifications";

export async function POST(req: Request) {
  try {
    const { type, to, message, subject } = await req.json();
    if (type === "email") await sendEmail(to, subject ?? "Babin Rentals Update", message);
    else if (type === "whatsapp") await sendWhatsApp(to, message);
    else return NextResponse.json({ error: `Unknown notification type: ${type}` }, { status: 400 });
    return NextResponse.json({ sent: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
