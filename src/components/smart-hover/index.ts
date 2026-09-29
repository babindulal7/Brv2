/**
 * Smart Hover public surface — one import per app shell (§3).
 *
 * Law 1: engines live in `src/lib/smartHover.ts`; everything here
 * presents and collects only.
 */

export { SmartHoverCard } from './SmartHoverCard'
export { SmartHoverTrigger } from './SmartHoverTrigger'
export { SmartHoverShell, SmartHoverTabs, SmartHoverFooter, HoverActionButton } from './SmartHoverShell'
export type { ClientPreview, EquipmentPreview, RentalPreview, InvoicePreview, AnyPreview } from './previewTypes'
