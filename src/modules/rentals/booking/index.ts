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
  creditUtilisation,
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
  equipmentLineDraft,
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
  EquipmentResult,
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
