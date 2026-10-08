# Contract: RentalFinancialRail

**Component**: `src/modules/rentals/booking/RentalFinancialRail.tsx`
**Exported via**: `src/modules/rentals/booking/index.ts`
**Date**: 2026-10-06

## Props

```typescript
interface RentalFinancialRailProps {
  pricing: PricingPipelineResult;
  vatOn: boolean;
  vatRatePercent: number;
  onToggleVat: (on: boolean) => void;
  canCrewMoney: boolean;
  canViewMoney: boolean;
  isDesktop: boolean;
  inputStyle: CSSProperties;
  discountPct: number;
  discountCap: number;
  onDiscountPct: (n: number) => void;
  onSelectDiscountPreset: (pct: number, reason?: string) => void;
  manualDiscountReason: string;
  onManualDiscountReason: (v: string) => void;
  manualDiscountAuthorizedBy: string;
  onManualDiscountAuthorizedBy: (v: string) => void;
  womenDopEligible: boolean;
  onWomenDopEligible: (v: boolean) => void;
  isStudentBundle: boolean;
  promoCodeInput: string;
  onPromoCodeInput: (v: string) => void;
  promoCodeApplied: string | null;
  onApplyPromo: (code: string) => void;
  onRemovePromo: () => void;
  promoNotice: { tone: 'success' | 'danger'; text: string } | null;
  manualDepositOverride: boolean;
  onManualDepositOverrideChange: (on: boolean) => void;
  manualDepositAmount: string;
  onManualDepositAmount: (v: string) => void;
  depositOverrideReason: string;
  onDepositOverrideReason: (v: string) => void;
  depositAuthorizedBy: string;
  onDepositAuthorizedBy: (v: string) => void;
}
```

## Rules

- Read-only totals: equipment / crew / transport / sub-rental, discount,
taxable, VAT 13%, rental total. No arithmetic inside; values come from
`pipeline` (engine-computed, paisa integers).
- Deposit card is liability-isolated (Law 5): shows deposit separately,
never added to total, never reducing outstanding. Reason field mandatory when
audit requires it.
- Law 6: when `canViewMoney` is false, component returns `null` (absent, not
masked, not disabled).
- Formatting via `money.ts` only (`formatMoney`, lakh grouping); touch targets
>=44px; errors inline, success via toast.
- Confirm / Save Draft CTAs are NOT part of this contract: the orchestrator
header owns the single Save Draft (`NewRental.tsx` §58) and the confirm
dispatch. The rail owns section inputs only (discount, promo, VAT, deposit).
- Promo validation stays orchestrator-side: the rail forwards the code via
`onApplyPromo` and renders the resulting `promoNotice`; same for the deposit
override prefill/clear via `onManualDepositOverrideChange`.
