-- =============================================================================
-- A staff row for the Owner's current auth identity.
--
-- ## Why this is a migration and not seed data
--
-- 0041's identity contract is `auth.users.id` IS `public.users.id`. It is not a
-- foreign key and nothing enforces it, so an auth account created through the
-- Supabase dashboard — the normal way to create one — lands with a fresh UUID
-- and **no staff row**. Every RLS policy then resolves that identity to
-- `Client` and denies everything, silently.
--
-- That happened on 12 Aug 2026: `owner@babinrentals.com` was replaced with
-- `babindulal7@gmail.com`, sign-in worked, a real JWT was issued, and every list
-- in the app was still empty. The auth side was correct; the half of the
-- contract that lives in this schema had nobody to fulfil it.
--
-- ## What this does NOT do
--
-- It does not touch `owner@babinrentals.com`'s staff row (id `…0101`). All 120
-- seeded bookings, invoices and payments carry it as `created_by`/`updated_by`
-- and that attribution stays true — those rows were written by that actor. The
-- row simply has no auth account behind it any more, so it cannot sign in.
--
-- ## Reverting
--
--     update public.users set is_active = false
--      where email = 'babindulal7@gmail.com';
--
-- Preferred over a delete: Law 3 — nothing is deleted, every entity has a named
-- terminal action, and `created_by` references would block the delete anyway
-- once this identity has written a row.
--
-- ⚠ If the auth account is ever recreated it gets a NEW uuid and this row stops
-- matching. The symptom is the one above — signed in, everything empty — and
-- the fix is to re-point `id`, not to add a second row.
--
-- ## Renumbered 0058 → 0060 on 15 Aug 2026
--
-- It shared `0058` with `0058_late_fee_rank_and_approver_is_actor.sql`, and its
-- companion shared `0057`. See the same note in
-- `0059_users_self_read_accepts_auth_uid.sql` — this file follows 0059 because
-- that is the order the two were applied live (versions 20260812170827 then
-- 20260812170856). No SQL below changed and nothing was re-applied.
--
-- ⚠ The live project recorded this migration under its earlier name,
-- `0058_staff_row_for_babindulal7`. Same SQL; the file was renamed afterwards.
-- =============================================================================

begin;

insert into public.users (
  id, client_uuid, employee_code, email, full_name, mobile, primary_role,
  department, branch_id, warehouse_id, is_active
)
select
  '5c72aaa6-d77b-4bc3-a367-bf17c9aa80cb'::uuid,
  -- Law 8, derived rather than random, so re-running is a no-op.
  md5('babin-rentals-os/seed/user:babindulal7@gmail.com')::uuid,
  'EMP-005',
  'babindulal7@gmail.com',
  'Babin Dulal',
  '+977-9800000005',
  'Owner',
  'Executive',
  (select id from branches where branch_code = 'BR-KTM-01'),
  (select id from warehouses where warehouse_code = 'WH-KTM-MAIN'),
  true
on conflict (id) do update set is_active = true, primary_role = 'Owner';

commit;
