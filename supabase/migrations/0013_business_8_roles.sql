-- ============================================================================
-- 0013_business_8_roles.sql
-- Role vocabulary: the Foundation 6 → the business 8.
--
-- Ruled 8 Aug 2026. Foundation §14.2 named the role set as the one open item
-- that "blocks the schema"; this closes it.
--
--   Owner · Admin · Coordinator · Warehouse · Technician · Accounts · Driver · Client
--
-- WHY RENAME RATHER THAN REPLACE THE TYPE
-- ---------------------------------------
-- 0011_rls_policies.sql contains 22 policy expressions that name role literals.
-- Dropping and recreating `system_role` would invalidate every one of them and
-- force a blind rewrite of the entire authorization layer — the highest-risk
-- change we could make to this database.
--
-- `alter type ... rename value` instead rewrites the label in place. Stored
-- policy expressions reference the enum member, not the text, so all 22
-- policies keep working with zero edits and zero behaviour change.
--
-- Three renames plus two additions land exactly on the business 8:
--
--   Manager  → Admin        (the 22 Jul lock: Admin *is* the Ops Manager)
--   Billing  → Coordinator  (the payments-recording role; the coordinator takes
--                            the advance — 22 Jul, "Coordinator ✅ FULL on Payments")
--   Viewer   → Client       (see the note on the fallback below)
--   + Technician                    (AC / prep — shares return triage with Warehouse)
--   + Driver                        (logistics — trips, delivery, handover legs)
--
-- ON THE FALLBACK — read this before changing it
-- ----------------------------------------------
-- `auth_user_role()` falls back to the least-privileged role when a session
-- carries no identified user. That fallback was 'Viewer' and is now 'Client',
-- which is *safer*, not weaker: every Client policy is scoped by a client_id
-- linkage that an unidentified session cannot satisfy, so the fallback now
-- denies by default instead of granting blanket read.
--
-- Client is EXTERNAL. It authenticates through the portal only and must never
-- be granted a staff surface. `auth_is_staff()` in 0014 is the gate for that.
--
-- Case is preserved deliberately ('Admin', not 'admin'): 63 source files carry
-- these literals, and changing case would turn a contained migration into an
-- application-wide rewrite for no gain.
--
-- Enum additions cannot be used in the same transaction that creates them, so
-- the policy and helper work lives in 0014_business_8_policies.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Rename the three that change meaning
-- ---------------------------------------------------------------------------

alter type system_role rename value 'Manager' to 'Admin';
alter type system_role rename value 'Billing' to 'Coordinator';
alter type system_role rename value 'Viewer'  to 'Client';

-- ---------------------------------------------------------------------------
-- 2 · Add the two jobs the Foundation 6 could not represent
--
-- Technician and Driver are real people on the floor. Until now a technician
-- had to sign in as Warehouse and a driver had nowhere to be at all, which is
-- why neither could be given a permission of their own.
-- ---------------------------------------------------------------------------

alter type system_role add value if not exists 'Technician';
alter type system_role add value if not exists 'Driver';

-- ---------------------------------------------------------------------------
-- 3 · Record the change where the next person will look
-- ---------------------------------------------------------------------------

comment on type system_role is
  'The business 8, ruled 8 Aug 2026: Owner · Admin · Coordinator · Warehouse · '
  'Technician · Accounts · Driver · Client. Renamed in place from the Foundation 6 '
  '(Manager→Admin, Billing→Coordinator, Viewer→Client) so the 22 RLS policies in '
  '0011 survived untouched. Client is EXTERNAL — portal only, never a staff surface.';
