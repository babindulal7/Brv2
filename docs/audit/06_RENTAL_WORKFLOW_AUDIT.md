> [!WARNING] HISTORICAL AUDIT — NOT CURRENT APPLICATION STATE
> **Status:** SUPERSEDED / HISTORICAL RECORD ONLY (20-21 Sep 2026)
>
> This document is a point-in-time audit snapshot. Its findings, blockers, test failure counts, and readiness scores represent the system state at that date and **must not be treated as current runtime truth**.
>
> For authoritative implementation state, consult:
> 1. [`docs/00_READ_FIRST.md`](../00_READ_FIRST.md)
> 2. [`docs/CURRENT_STATE.md`](../CURRENT_STATE.md)
> 3. [`PROGRESS.md`](../../PROGRESS.md)
> 4. [`CLAUDE.md`](../../CLAUDE.md)

---

# Rental Workflow Audit

## Verdict

The repository's database lifecycle is the strongest part of the system. PGlite executes the real PL/pgSQL and passes 18/18 lifecycle scenarios. The browser workflow is not equivalently proved, and several operational capabilities are incomplete.

## Authoritative lifecycle

The canonical stored booking stages are narrower than the narrative workflow. Preparation, packing, handover, return, inspection and reset are represented through sessions, items, findings, movements and gates around stage changes rather than by inventing a separate booking status for every UI step. Cancellation is orthogonal/terminal; close is guarded.

| Step | Server protection / evidence | Audit result |
| --- | --- | --- |
| Draft/quote creation | `create_booking`, required client UUID/actor/days, server rates for money-blind callers | PASS in lifecycle foundation |
| Book/confirm | stage transition writes reservations | PASS; exact overlap rejected |
| Preparation/packing | session rows and stage gates | PASS for required floor rows |
| Handover/on-rent | verification/signature/deposit/session rules | PASS in lifecycle path |
| Return | partial return and missing unit modeled | PASS L7 |
| Inspection/damage | findings/cases gate later closure | Schema present; complete browser action set PARTIAL |
| Cleaning/reset | unit state owned by engine; close/release gates | Direct status write refused; browser touch flow unproved |
| Invoice/payment | create/issue immutable snapshot; payment validation/ceiling | PASS L8–L10, L16 |
| Close | settled non-void invoice, deposits, cases and live reservations clear | PASS L11/close checks |

## Availability and double booking

Serialized items use a transactional GiST exclusion over half-open ranges. The lifecycle proves exact overlap rejection and permits a same-instant return/pickup boundary. Quantity stock has a capacity ceiling and rejects excess demand. Bundle availability is derived through component/unit demand in the model, but a complete required/optional/replacement bundle conflict matrix is not present.

AUD-001 is resolved in the working tree: migration `0124` synchronizes every active reservation after pickup/return changes in the same transaction. L18 proves safe changes move the hold and overlapping direct/RPC changes roll back. Live deployment plus quantity/bundle and true multi-session checks remain required.

## Rental day and timezone

`src/lib/operationalDay.ts` correctly models Asia/Kathmandu operational days beginning at 06:00 and has boundary tests. Calendar/Today queries use pickup/return timestamps and the operational window. Pricing uses `rentalDaysBetween`: rounded elapsed milliseconds/24 hours, minimum one. Its own source records that whether pricing should instead count 06:00 boundaries is unresolved. That is AUD-010: a product/finance ruling is required before changing code or repricing history.

## Pricing, discounts, VAT and payments

- Equipment pricing is snapshotted on lines/invoices; migration `0119` applies catalogue rates server-side for money-blind callers.
- Money-visible roles can explicitly override rates and that override is recorded. Discount approval is intentionally broad in current policy; this is a business decision, not an undocumented exploit.
- Discount/VAT checks prevent negative/impossible stored values; issued invoice figures become immutable.
- VAT defaults to 13% in the authoritative invoice migration path.
- Payment validation binds booking/client/invoice, rejects void invoices and enforces the global ceiling; append-only/reversal semantics preserve history.
- Production and reports could not be independently reconciled, so financial integrity is strong in schema tests but not fully attested.

## Closure requirements

Migration `0116` requires at least one non-void invoice, settlement of every invoice, resolved deposit liability, no open case and no live reservation. Stage/session gates also require the physical workflow. L11 confirms premature closure is refused. Live historical closed rows were not available; no claim about a count of invalid production closures is justified.

## Client controls

Client-own RLS exists and L14 proves isolation in PGlite. Credit/KYC/block concepts exist, but several adjustment/override workflows are explicitly not implemented. A complete blocked-client Scenario C with authorized override and immutable audit evidence is missing.

## Operations gaps

- Global scanner can falsely report success (AUD-002).
- Evidence upload/download and product matching are incomplete (AUD-004).
- Case creation/approval, some damage financial handling, receipts and expense reversal are incomplete (AUD-007).
- Save/reload/refresh recovery for every partially completed floor screen is **UNABLE TO VERIFY**.
- Two-user editing, duplicate return/payment and stale version browser feedback lack true multi-session E2E.

## Required workflow acceptance

Run Scenario A end-to-end through Supabase and a browser; exact/partial/contained/date-edit/bundle/concurrent booking conflicts; blocked client; money-blind staff; damage/partial return; partial/refunded/reversed payments; cancellation; iPad floor sequence; phone find/open/operate/confirm; refresh after each save boundary; and network loss before/during/after every terminal action.
