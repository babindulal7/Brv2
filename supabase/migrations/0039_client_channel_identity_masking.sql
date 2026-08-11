-- ============================================================================
-- 0039_client_channel_identity_masking.sql
--
-- Closes the "PII-masking-adjacent" bucket from PLAN.md §6.12/§6.25 — the
-- last of the three well-defined buckets left over from the original
-- 92-table RLS gap (the other two, portal_* auth and the items-blocked
-- trio, need their own separate kind of work, not this shape of migration).
--
-- `client_channel_identities` (0005_clients.sql) was deliberately excluded
-- from 0025's clients-child batch because its own column comment already
-- states a requirement a plain `auth_is_staff()` policy can't satisfy:
--
--   "address ... E.164 number or email address. Masked to last four for
--    every role below Manager/Accounts."
--
-- WHY THIS IS A DIFFERENT SHAPE OF MASK THAN 0019/0021 ET AL
-- ------------------------------------------------------------
-- Every money-masking view this thread has written so far (0019, 0021,
-- 0034-0038) follows Foundation §8.3: a gated column resolves to NULL for
-- an excluded role — "the field is absent, not masked-and-shown." This
-- table's own design comment asks for something else on purpose: a
-- *partial* value (last four characters), not an absent one. That is a
-- real, stated exception for this one column, not an inconsistency with
-- the money convention — the two requirements come from different specs
-- (Law 6 for money; this table's own contact-privacy comment for `address`)
-- and are implemented differently on purpose.
--
-- MECHANISM — same idiom as every prior masking view in this thread
-- ------------------------------------------------------------
-- Row visibility is unchanged from what this table's clients-child siblings
-- already get (0025): `auth_is_staff()` to read the row, the same
-- `('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse')` tier to write
-- it — masking `address` is a column concern, not a row one. `address`
-- itself is revoked at the column level from `authenticated` outright, so
-- the only path back to any value — full or masked — is through
-- `client_channel_identities_v`. As with `products_v`/`booking_lines_v`
-- (0019), this means `select *` against the base table now raises
-- "permission denied for column address" for every role; Phase 2's data
-- layer must query the view, or list every column except `address`
-- explicitly, exactly the same requirement 0019 already established for
-- money columns.
--
-- "Manager/Accounts" tier: no existing named gate function fits ("business
-- 9" excludes Coordinator/Warehouse/Technician/Driver/Client from this one
-- but auth_can_view_money() is money-specific and includes Coordinator,
-- which this comment does not ask for). Used the one precedent already in
-- this schema for exactly this four-role set — 0018's
-- `payment_reversals_select` — rather than inventing a new named function
-- for a single column in a single table.
-- ============================================================================

begin;

drop policy if exists client_channel_identities_select on client_channel_identities;
create policy client_channel_identities_select on client_channel_identities
  for select
  using (auth_is_staff());

drop policy if exists client_channel_identities_all on client_channel_identities;
create policy client_channel_identities_all on client_channel_identities
  for all
  using (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'))
  with check (auth_user_role() in ('Owner', 'Admin', 'Manager', 'Coordinator', 'Warehouse'));

comment on policy client_channel_identities_all on client_channel_identities is
  'Mirrors client_contacts_all (0025) exactly -- this is a child of clients, not a new tier. The address mask below is a separate, column-level concern.';

revoke select (address) on client_channel_identities from authenticated;

create or replace view client_channel_identities_v as
select
  id, client_uuid, client_id, contact_id, channel,
  case
    when auth_user_role() in ('Owner', 'Admin', 'Manager', 'Accounts') then address
    else '•••• ' || right(address, 4)
  end as address,
  is_on_whatsapp, is_active, deactivated_at, deactivation_reason,
  created_at, created_by
from client_channel_identities;

grant select on client_channel_identities_v to authenticated;

comment on view client_channel_identities_v is
  'Column-masked read surface for client_channel_identities -- query this, never the base table (address is column-revoked there). Unlike products_v/booking_lines_v (0019), the masked value is a partial reveal (last four characters), not NULL -- this table''s own column comment asks for "masked to last four", not "absent", for every role below Manager/Accounts.';

commit;
