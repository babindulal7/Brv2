# Apply 0148 (security hardening) — 3 Oct 2026

Status: written and verified in PGlite only. Not applied anywhere.

## Order
1. Backup (scripts/backup-db.ps1).
2. Apply on a STAGING copy of live first. If 0129 is not yet applied there, apply 0125–0147 then 0148 in one run; 0148 must not come after anyone can use audit_logs.
3. `npm run check:anon` (PGlite) and the three curl checks below against staging with only the anon key.
4. Then live.

## Checks with only the anon key (expect 401/403/empty, never data)
- GET  $URL/rest/v1/audit_logs?select=id&limit=1
- GET  $URL/rest/v1/staff_directory_v?select=id&limit=1
- POST $URL/rest/v1/rpc/cancel_booking  body {"p_booking_id":"<uuid>","p_reason":"probe probe probe","p_actor_id":"<uuid>"}   (use a STAGING booking id)

## What changes for the app
Nothing in src/. cancelRental / extendRental / voidInvoice keep working for signed-in staff; an `actorId` sent in the payload is now ignored for API callers (the session identity is used).
First time extend_booking and void_invoice can succeed at all — smoke test one of each on staging.

## Rollback
Re-create the previous definitions from 0109 (cancel_booking), 0111 (extend_booking), 0121 (void_invoice); `grant execute on function ... to anon` for the 12 functions listed in 0148; `grant select on <view> to anon` for the views you need.

## Known limits
- PGlite simulates PostgREST with `set local role` + request.jwt.claim.sub. Real Supabase is unverified.
- The new gate's allow-list (21 functions) must be updated deliberately when a public function is added.
