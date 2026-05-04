# Babin Rentals v2

Production SaaS operating system for cinematic film equipment rentals.

## Stack
- Next.js App Router + TypeScript
- Supabase PostgreSQL + Edge Functions
- OpenAI analytics engine
- Twilio WhatsApp + Nodemailer
- PDFKit invoice/quotation/packing list
- Fonepay webhook payment confirmations

## Implemented Architecture
- `supabase/migrations/20260504_initial_schema.sql`: normalized schema for inventory, rentals, CRM, finance, maintenance, depreciation, analytics, recommendations.
- `app/api/*`: module APIs for dashboard KPIs, bookings, and AI insights.
- `lib/ai`, `lib/pricing`, `lib/bundles`: intelligent analytics and pricing/bundle logic.
- `components/dashboard/*`: cinematic dashboard primitives.

## Next Build Steps
1. Add authentication + row-level security policies.
2. Complete module APIs (`clients`, `expenses`, `documents`, `fonepay`, `notifications`).
3. Add server-generated PDF endpoints and storage integration.
4. Add Supabase Edge functions for async analytics and webhook handling.
