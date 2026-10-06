# Data Model: NewRental Orchestrator Decomposition Remainder

**Feature**: `001-newrental-orchestrator-decomposition-remainder`
**Date**: 2026-10-06
**Note**: Frontend refactor — no schema change. Entities below are the in-memory
form slices the orchestrator owns and the section contracts consume. All money
in integer paisa; deposits are liabilities excluded from Rental Total (Law 5).

## RentalLineItem (existing, consumed by RentalLineItemsTree)

- `lineId: string` — stable key for updates/removal
- `productId: string` — catalogue reference (equipment, bundle child, service,
sub-rental, manual)
- `kind: 'equipment' | 'bundle' | 'service' | 'sub-rental' | 'manual' | 'crew' | 'transport'` — drives gating (non-physical kinds exempt per §4.59/0149)
- `qty: number` (>=1), `days: number` (explicit, >=1 per Law 9), `ratePaisa: number`
- `discountPct: number` (0-100 arithmetic only), `amountPaisa: number` (engine-derived)
- `bundleCode?: string`, `collapsed?: boolean` — hierarchy display state
- `availability: 'Available' | 'Conflicted' | 'Sub-rental needed'` — pill state
- Relationships: many lines per draft; bundle children nest under `bundleCode`
- Validation: qty/days >= 1; rate from catalogue or override; Law 6 omits money
columns from DOM when denied

## CrewAssignment (existing, consumed by crew/transport section)

- `crewId: string`, `role: string`, `dayRatePaisa: number`, `days: number`
- `overtimePaisa`, `mealsPaisa`, `accommodationPaisa` — per-diem extras
- Relationships: many per draft; vehicle/driver summary alongside in transport
- Validation: Law 6 — when `canCrewMoney` is false, rates and subtotal omitted
from DOM (not masked with placeholders)

## TransportDetails (existing, consumed by crew/transport section)

- Delivery/pickup mode, addresses, time windows, vehicle/driver assignment,
`chargePaisa` (delivery; return-pickup fields out of scope per §4.58)
- Relationships: one per draft; fee rolls into Transport Total on-page
- Validation: charge in paisa integer; Law 6 gated like crew

## PricingPipelineResult (existing, engine-owned, consumed by rail)

- `equipmentPaisa`, `crewPaisa`, `transportPaisa`, `subRentalPaisa`
- `discountPaisa`, `taxablePaisa`, `vatPaisa` (13% toggle), `rentalTotalPaisa`
- `depositRequiredPaisa`, `depositLiability` — isolated card, never in total
- `appliedPromo: string | null`, `vatEnabled: boolean`
- Validation: computed only by `src/lib/pricingPipeline.ts`; formatted only by
`src/lib/money.ts` (lakh grouping, half-up); reconciliation assertion at module
load

## RentalDraft (existing, orchestrator-owned)

- `draftId: string | null`, `isDirty: boolean`
- `clientId: string | null`, `pickupAt/returnAt: Date`, `effectiveDays: number`
- `lines: RentalLineItem[]`, `crew: CrewAssignment[]`, `transport: TransportDetails`
- `promo`, `vatEnabled`, `pipeline: PricingPipelineResult`
- State transitions: dirty on any slice edit → debounced `persistRentalDraft` →
clean; confirm dispatches `createRental`/`confirmRental` fail-closed RPC (never
queued); errors inline persistent, successes via toast only

## Non-goals (no new entities)

- No new tables, columns, RPCs, or sequences. §4.58 return-pickup columns,
Nepali localization strings, and seed reconciliation are explicitly out of
scope.
