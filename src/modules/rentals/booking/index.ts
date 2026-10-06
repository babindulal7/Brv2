/**
 * The New Booking client-selection stack ("New Booking" spec §7–14, §20, §64).
 *
 * One barrel so `NewRental.tsx` imports from `./booking` and never reaches into
 * a file path — the folder can be reorganised without touching the page.
 *
 * Nothing here routes, and nothing here writes. The page owns selection,
 * routing and persistence; these components raise callbacks. That is what keeps
 * §11's and §20's "does not navigate away" true no matter how the page changes.
 */

/* The health engine — pure, no JSX. Everything else reads its verdict. */
export {
  CLIENT_HEALTH_THRESHOLDS,
  HEALTH_RANK,
  clientHealth,
  // Replaced `creditUtilisation`, which returned `number | null` and so could
  // not tell "no limit to exceed" apart from "nobody computed the usage" —
  // the second of which was silently reading as the first. See `creditCheck`.
  creditCheck,
  deriveClientHealthSignals,
  healthAccessibleName,
  healthPresentation,
} from './clientHealth'
export type {
  ClientHealthLevel,
  ClientHealthReason,
  ClientHealthSeverity,
  ClientHealthSignals,
  ClientHealthVerdict,
  CreditCheck,
} from './clientHealth'

/* Presentation of that verdict — chip, reason list, and the §11 eye control. */
export { ClientHealthChip, ClientHealthEye, ClientHealthReasons, TOUCH } from './ClientHealthChip'
export type { ClientHealthChipProps, ClientHealthEyeProps } from './ClientHealthChip'

/* §8–10, §64 — the searchable selector that replaces the plain <select>. */
export { ClientCombobox } from './ClientCombobox'
export type { ClientComboboxProps } from './ClientCombobox'

/* §11, §14 — the quick view the eye opens. */
export { ClientQuickView } from './ClientQuickView'
export type { ClientQuickViewProps } from './ClientQuickView'

/* §20 — the drawer the existing "Client History" button opens. */
export { ClientHistoryDrawer } from './ClientHistoryDrawer'
export type { ClientBookingSummary, ClientHistoryDrawerProps } from './ClientHistoryDrawer'

/* The shared drawer shell, exported so a sibling booking panel reuses it
   rather than growing a third variation of the same sheet. */
export { Drawer, DrawerRow, DrawerSection, DrawerUnavailable } from './Drawer'
export type { DrawerProps } from './Drawer'

/* §15–19 — the Add Client dialog the combobox's `onCreateNew` opens.
 *
 * RESOLVED (was a TODO(decision) collision): `./AddClientModal` briefly shipped
 * its own four-band health engine (`deriveClientHealth`, `'good' | 'new' |
 * 'watch' | 'risk'`) alongside the three-band `./clientHealth` §13 mandates.
 * That second engine has been deleted — the modal now renders `clientHealth()`
 * through `ClientHealthChip` / `ClientHealthReasons` like every other surface,
 * so the barrel still offers exactly one health API and a client cannot read
 * "Watch" in this dialog and "Warning" one row away. */
export { AddClientModal } from './AddClientModal'
export type { AddClientModalProps } from './AddClientModal'

/* ── §23–35 — the Add Item stack ──────────────────────────────────────────
 *
 * Same shape as the client stack above: a pure engine (`itemCatalogue`), the
 * panel that renders it, and the preview dialog the panel opens. Nothing here
 * writes to the booking — `AddItemPanel` raises `onAdd(lines, source)` with
 * ready-to-append `BookingLineDraft`s and `NewRental.tsx` decides. Pricing
 * stays the page's (§67): a draft carries a rate, never an amount. */
export {
  DERIVED_CATEGORIES,
  EQUIPMENT_RESULTS,
  NO_WINDOW,
  OMITTED_SORTS,
  SERVICES_UNAVAILABLE_REASON,
  SORT_OPTIONS,
  addBundleToBooking,
  bundleAvailability,
  bundleResults,
  componentSummaryOf,
  equipmentConflicts,
  equipmentLineDraft,
  equipmentResultsFrom,
  groupEquipmentResults,
  inCategory,
  normalise,
  runQuery,
} from './itemCatalogue'
export type {
  AddBundleOptions,
  AddBundleResult,
  AvailabilityLevel,
  AvailabilityVerdict,
  BookingLineDraft,
  BookingWindow,
  BundleResult,
  CatalogueResult,
  ConflictCheckLine,
  EquipmentAvailabilitySource,
  EquipmentConflict,
  EquipmentConflictSummary,
  EquipmentModelGroup,
  EquipmentResult,
  LiveEquipmentRow,
  QueryGroup,
  QueryOptions,
  QueryOutcome,
  ResultKind,
  SortKey,
  SortOption,
} from './itemCatalogue'

export { AddItemPanel } from './AddItemPanel'
export type { AddItemPanelProps, AddItemSource } from './AddItemPanel'

export { AvailabilityChip, BundlePreview } from './BundlePreview'
export type { BundlePreviewProps } from './BundlePreview'

/* redesign v1 §4 — typeable date + time with a calendar and a time-list
   popover, BS rendered under AD. No date/time picker existed anywhere in the
   repo before this one. */
export { DateTimeField, parseDateInput, parseTimeInput } from './DateTimeField'
export type { DateTimeFieldProps } from './DateTimeField'

/* Quick date presets for New Rental — one-tap common durations. */
export { DatePresets, DEFAULT_PRESETS, usePricingHints } from './DatePresets'
export type { DatePreset, DatePresetsProps } from './DatePresets'

/* redesign v1 §5 — draft-only email composer. Comms are never auto-sent
   (21 Jul lock). No email backend exists in this build, so the send control
   is Unavailable with the named reason below — the draft is reviewable and
   editable, and nothing pretends to queue. */
export { DraftEmailModal, EMAIL_SEND_UNAVAILABLE_REASON } from './DraftEmailModal'
export type { DraftEmailModalProps } from './DraftEmailModal'

/* Form controls and widgets for rental booking */
export {
  AddClientButton,
  Field,
  MoneyRow,
  NumberStepper,
  RowMenu,
  Section,
  TouchInset,
  inputStyle,
  srOnly,
} from './BookingFormWidgets'

export { VatToggle } from './VatToggle'
export type { VatToggleProps } from './VatToggle'

export { DISCOUNT_PRESETS, DiscountChips } from './DiscountChips'
export type { DiscountChipsProps, DiscountPresetMeta } from './DiscountChips'

export {
  CrewSearch,
  ROLES_ACCEPTED_BY_DB,
  dbRejectsRole,
  rejectionNote,
} from './CrewSearch'
export type { CrewSearchProps, RoleRejectedByDb } from './CrewSearch'

export {
  PRODUCT_ID_RE,
  SHOOT_PRESETS,
  bookingDays,
  bookingInstant,
  stableJson,
} from './newRentalUtils'

export {
  confirmWriteRefusals,
  deriveRentalAlertsAndNotices,
} from './newRentalGuards'
export type {
  BlockingNotice,
  ConfirmWriteState,
  RentalAlertItem,
  RentalAlertsInput,
  RentalAlertsResult,
} from './newRentalGuards'

export { BookingDatesSection } from './BookingDatesSection'
export type { BookingDatesSectionProps } from './BookingDatesSection'

export { DeliverySection } from './DeliverySection'
export type { DeliverySectionProps } from './DeliverySection'

export { BookingSummaryCard } from './BookingSummaryCard'
export type { BookingSummaryCardProps } from './BookingSummaryCard'

/* New Rental Section 5 — Pricing & Terms rail (Item 13 decomposition).
 * Read-only pipeline breakdown + controlled discount/promo/VAT/deposit
 * inputs. No arithmetic inside; Law 5/Law 6 enforced at the root. */
export { RentalFinancialRail } from './RentalFinancialRail'
export type { PromoNotice, RentalFinancialRailProps } from './RentalFinancialRail'

export { RentalLineItemsTree, groupLines, isNested, lineAmountPaisa } from './RentalLineItemsTree'
export type { Line, LineGroup, RentalLineItemsTreeProps } from './RentalLineItemsTree'

export { CrewSection } from './CrewSection'
export type { CrewLine, CrewSectionProps } from './CrewSection'

export { RentalPricingSection } from './RentalPricingSection'
export type { RentalPricingSectionProps } from './RentalPricingSection'

export { CrewAndTransportSection } from './CrewAndTransportSection'
export type {
  CrewAndTransportSectionProps,
  TransportDetails,
} from './CrewAndTransportSection'

export { BookingClientSection } from './BookingClientSection'
export type { BookingClientSectionProps } from './BookingClientSection'

export { BookingModals } from './BookingModals'
export type { BookingModalsProps } from './BookingModals'

export { BookingEquipmentSection } from './BookingEquipmentSection'
export type { BookingEquipmentSectionProps } from './BookingEquipmentSection'

export { useNewRentalCatalogue } from './useNewRentalCatalogue'
export type {
  UseNewRentalCatalogueOptions,
  UseNewRentalCatalogueResult,
} from './useNewRentalCatalogue'

export { useNewRentalDraft } from './useNewRentalDraft'
export type { UseNewRentalDraftOptions } from './useNewRentalDraft'

export { useNewRentalSubmit } from './useNewRentalSubmit'
export type { UseNewRentalSubmitOptions } from './useNewRentalSubmit'

export { useNewRentalTiming } from './useNewRentalTiming'
export type {
  UseNewRentalTimingOptions,
  UseNewRentalTimingResult,
} from './useNewRentalTiming'

export { useNewRentalLogistics } from './useNewRentalLogistics'
export type {
  UseNewRentalLogisticsOptions,
  UseNewRentalLogisticsResult,
} from './useNewRentalLogistics'

export { useNewRentalPricing } from './useNewRentalPricing'
export type {
  PricingBreakdown,
  UseNewRentalPricingOptions,
  UseNewRentalPricingResult,
} from './useNewRentalPricing'

export { useNewRentalClient } from './useNewRentalClient'
export type {
  UseNewRentalClientOptions,
  UseNewRentalClientResult,
} from './useNewRentalClient'

export { useNewRentalNavigation } from './useNewRentalNavigation'
export type {
  UseNewRentalNavigationOptions,
  UseNewRentalNavigationResult,
} from './useNewRentalNavigation'


