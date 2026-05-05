import nodemailer from "nodemailer";
import twilio from "twilio";

export async function sendEmail(to: string, subject: string, html: string) {
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: 587, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
}

export async function sendWhatsApp(to: string, body: string) {
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({ from: process.env.TWILIO_WHATSAPP_FROM, to: `whatsapp:${to}`, body });
}
