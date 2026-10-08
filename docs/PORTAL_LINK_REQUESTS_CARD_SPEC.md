# Pending portal link requests — the staff card on Clients

**Status:** SPEC ONLY — deliberately not built (RUN_PROMPT Task 3, 31 Aug 2026).
**Blocked on:** migration `0072_portal_email_binding_policies.sql` being applied (it creates
`portal_link_requests`); nothing can be wired before that, and 0072 itself awaits explicit
approval per CLAUDE.md.
**Ruling:** D2, 30 Aug 2026 — `docs/booqable/REFERENCE_SPEC_v2.5.md` Appendix A0.

## What it is

A card on `/clients` (the directory screen, above the table, beside the existing intel cards)
showing self-registered portal accounts that bound to nothing: their email matched no client,
matched more than one, or matched a client already claimed. D2's words: an unmatched or
unverified account "appears to staff as a pending link request".

## A. Structure

- Card title `Portal link requests`, count badge = open rows (`resolved_at is null and voided_at is null`).
- Row: email (verbatim, as submitted) · requested date (BS + AD, Law 7 render) · one row action.
- Empty state: the nothing-yet kind — "No one is waiting to be linked." The card still renders;
  a count of zero is information, not absence.
- ≤5 rows + `View all` when more; no pagination inside a card.

## B. Function

| Control | Type | Destination / effect | Roles |
|---|---|---|---|
| row | link | opens the client search pre-filtered to the request's email | Owner · Admin · Manager · Coordinator |
| `Link…` | button (44×44 row action) | staff resolve: picks a client, writes `portal_users` (invite-path shape) + `resolved_at` | Owner · Admin |
| `Reject` | button in the Link dialog, never bare on the row | sets `voided_at` + `void_reason` (required, Law 3 — void, never delete) | Owner · Admin |

Staff linking is a manual override of the exact-email rule and therefore carries a reason and
an audit row — it is the one path that can bind without an email match, which is exactly why it
is staff-only and logged.

## C. Interaction

- `[ruled]` One row = one link = one tab stop (L6); the row action is a visible 44×44 control,
  never hover-revealed.
- `[ruled]` The email renders as text, not a mailto — clicking the row must not open a mail app
  on the bench.

## D. Backend data link

```
source    portal_link_requests (0072) — staff SELECT policy
count     open rows; the same query the card lists, so badge and list cannot disagree
resolve   UPDATE resolved_at/portal_user_id + INSERT portal_users — via an action
          (actions/clients/resolvePortalLink.ts, to be written), audited
reject    UPDATE voided_at/void_reason — same action file, audited
money     none anywhere on this card
engine    lib/bs (dates) · lib/audit (the resolve/reject rows)
```

## E. Open decisions

1. Which roles may staff-link (Owner+Admin proposed above; Coordinator sees but cannot bind) —
   mirror the RLS on `portal_users_staff_write` when ruling it (capability-matrix rule).
2. Whether rejecting notifies the requester by email, silently expires, or both.
