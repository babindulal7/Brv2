# Live snapshot — 8 September 2026, before applying migrations 0079-0103

PHASE-0-PLAN Step 0 asks for a `pg_dump`. That could not be run from this session:
the database password is not available here, so there is no direct Postgres
connection — only the Supabase MCP SQL channel.

What exists instead:

1. **Schema `backup_2026_09_08` on the live database.** A data-only copy of every
   non-empty `public` table, made with `create table ... as select *`:

       audit_events 5424 · clients 366 · bookings 246 · products 204 ·
       external_refs 171 · booking_lines 92 · number_sequences 11 ·
       inventory_categories 6 · users 5 · expense_categories 4 ·
       storage_zones 3 · warehouses 2 · bank_accounts 2 · branches 2 ·
       fiscal_periods 1        (6 539 rows)

2. **`bookings_no_map.json` in this directory.** The `id -> booking_no` map for all
   246 bookings as they stood before `0085_booking_numbers_bare` rewrote the column.
   This is the off-database copy, and it is what makes the renumber reversible.

## What this is NOT

It captures **rows only**. It does not capture schema, functions, triggers, RLS
policies, grants, roles, sequences or storage objects. If a migration corrupts
structure rather than data, this cannot restore it. A real `pg_dump` plus a
restore drill (Step 0.1-0.3) is still owed.
