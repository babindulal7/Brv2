# Babin Rentals v2

Production-grade cinematic film equipment rental operating system.

## Core Modules
- Dashboard command center with KPI + AI panel
- Inventory and unit-level availability
- Rental booking + live pricing
- Client CRM with risk/VIP
- Finance + expenses + depreciation + ROI
- Maintenance/cleaning/damage workflows
- Bundle + pricing intelligence engine
- Invoice/PDF + Fonepay + WhatsApp/email automation

## Next.js App Structure
- `app/(dashboard)/*` module pages
- `app/api/*` domain APIs
- `components/*` UI components
- `lib/*` db, AI, pricing, integration services
- `supabase/migrations` SQL schema
- `supabase/functions` edge function stubs

## APIs Implemented
- `POST /api/analytics` aggregated AI insight generation
- `POST /api/rentals/availability` booking conflict prevention
- `POST /api/payments/fonepay/webhook` payment status ingestion
- `POST /api/notifications` unified WhatsApp/email dispatch
