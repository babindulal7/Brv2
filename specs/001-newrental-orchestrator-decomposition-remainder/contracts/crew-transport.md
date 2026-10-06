# Contract: CrewAndTransportSection

**Component**: `src/modules/rentals/booking/CrewAndTransportSection.tsx`
(consolidation of existing `CrewSection.tsx` + `DeliverySection.tsx` concepts;
fold into `CrewSection` if smaller diff — contract identical either way)
**Exported via**: `src/modules/rentals/booking/index.ts`
**Date**: 2026-10-06

## Props

```typescript
interface CrewAndTransportSectionProps {
  crew: BookingCrewAssignment[];
  transport: TransportDetails;
  onUpdateCrew: (crewId: string, updates: Partial<BookingCrewAssignment>) => void;
  onRemoveCrew: (crewId: string) => void;
  onClearCrew: () => void;
  onUpdateTransport: (updates: Partial<TransportDetails>) => void;
  canCrewMoney: boolean;
  readOnly?: boolean;
}
```

## Rules

- Renders assigned crew table (role badges, per-row expanders for
overtime/meals/accommodation paisa), `CrewSearch` add path, clear-crew action,
and vehicle/driver + transport summary. No crew/transport markup remains in
`NewRental.tsx`.
- Law 6: when `canCrewMoney` is false, day rate / days / amount / expander
inputs / crew subtotal are omitted from DOM (no lock-icon placeholder).
- All paisa inputs are integer inputs with validation in engine/guards, not in
markup. Accessibility: labelled controls (`useId` or `aria-label`), native
`<button>`, >=44px targets.
- Transport return-pickup schema extension (§4.58) is out of scope; transport
shape unchanged.
