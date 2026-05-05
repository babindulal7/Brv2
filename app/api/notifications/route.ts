import { NextResponse } from "next/server";
import { sendEmail, sendWhatsApp } from "@/lib/integrations/notifications";

export async function POST(req: Request) {
  const { type, to, message, subject } = await req.json();
  if (type === "email") await sendEmail(to, subject ?? "Babin Rentals Update", message);
  if (type === "whatsapp") await sendWhatsApp(to, message);
  return NextResponse.json({ sent: true });
}
