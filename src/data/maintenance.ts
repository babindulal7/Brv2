import type { IconName } from '../components/ui/Icon'
import type { StatusKey } from '../lib/status'
import type { Flag } from '../lib/workflow'
import { FLAGS } from '../lib/workflow'

/**
 * Maintenance — the two pill vocabularies the Maintenance tab renders, kept
 * apart on purpose.
 *
 * `Maintenance.tsx` used to declare
 *
 *     type MaintenanceFlag = 'Overdue' | 'Warranty' | 'Blocked Booking' | 'Awaiting Approval'
 *
 * and paint all four as one row of flag pills. That redefined the booking
 * `Flag` registry `lib/workflow.ts` §1.9 owns, whose header is explicit:
 * "modules import; modules never redefine (§11)". Resolved by splitting the
 * four, not by deleting them:
 *
 *  1. `Overdue` **is** a §1.9 entry, so it is no longer retyped here. The
 *     union is narrowed out of `Flag` and the tone is read from `FLAGS`.
 *  2. The other three are not booking flags at all — they describe a repair
 *     job, an entity §1.9 does not model. They stay, but each is renamed so
 *     a pill on this screen cannot be read as a booking flag, and each
 *     carries the reason it is not in the registry.
 *
 * This is the convention `cases.ts` (`CaseFlag`) and `reset.ts`
 * (`QueueState` / `ProblemState`) already follow: a vocabulary for a
 * different entity lives in that screen's own data file and must never
 * shadow the 17-entry registry.
 */

/* ── §1.9 registry flags this screen renders ─────────────────────────────
 * Narrowed out of `Flag` rather than re-declared, so a typo or an invented
 * eighteenth flag will not compile. Nothing about the registry entry is
 * restated below except the icon, which §1.9 does not carry.
 *
 * TODO(decision): §1.9 scopes `Overdue` to a *booking* — its effect reads
 * "Red badge, blocks Close, triggers late-fee calculation", none of which a
 * repair job has. On this screen the same word means "past the estimated
 * completion date of the repair" (the Overdue KPI says exactly that).
 * Either the registry entry covers any overdue date and its effect text is
 * merely booking-flavoured, or Maintenance needs its own `Repair Overdue`
 * condition alongside the three below. The registry entry is used for now
 * because that is the option that invents nothing and changes no UI copy;
 * the registry's booking-specific effect text is deliberately NOT shown on
 * the pill, since "triggers late-fee calculation" would be false here.
 * Needs a product ruling.
 */
export type MaintenanceRegistryFlag = Extract<Flag, 'Overdue'>

export const MAINTENANCE_REGISTRY_FLAGS: MaintenanceRegistryFlag[] = ['Overdue']

/** §1.9 carries a tone but no glyph; the glyph is the only local addition. */
export const MAINTENANCE_REGISTRY_FLAG_ICON: Record<MaintenanceRegistryFlag, IconName> = {
  Overdue: 'timer',
}

/** Read from the engine — never a second copy of §1.9's colour decision. */
export const registryFlagTone = (f: MaintenanceRegistryFlag): StatusKey => FLAGS[f].token

/** Pill/chip tooltip. States the provenance without asserting the booking-only effects. */
export const REGISTRY_FLAG_TITLE =
  'A workflow registry flag (§1.9). On a maintenance job it means the repair is past its estimated completion date.'

/* ── maintenance-record conditions — deliberately NOT registry flags ─────
 * Every one of these describes the repair job, not the rental. None exists
 * in §1.9, and none may be added to it: §1.9 is the booking vocabulary and
 * a repair is a different entity. They were renamed from the words the old
 * local union used (`Warranty`, `Blocked Booking`, `Awaiting Approval`)
 * because those sat close enough to registry entries to be mistaken for
 * them at a glance.
 */

export type MaintenanceCondition = 'Under Warranty' | 'Holding a Booking' | 'Repair Approval Pending'

export const MAINTENANCE_CONDITIONS: MaintenanceCondition[] = [
  'Under Warranty',
  'Holding a Booking',
  'Repair Approval Pending',
]

export interface MaintenanceConditionMeta {
  token: StatusKey
  icon: IconName
  /** Rendered as the pill's tooltip, and the standing record of why this is not a §1.9 flag. */
  why: string
}

export const MAINTENANCE_CONDITION_META: Record<MaintenanceCondition, MaintenanceConditionMeta> = {
  /**
   * Was `Warranty`. Not a §1.9 flag: it is a property of the equipment's
   * service contract, it decides who pays for a repair, and it attaches to
   * the maintenance record — never to a booking. §1.9 has no warranty entry
   * and adding one would be inventing an eighteenth flag.
   */
  'Under Warranty': {
    token: 'in',
    icon: 'checklist',
    why: 'The repair is covered by the equipment warranty — a property of the service contract, not a booking flag.',
  },
  /**
   * Was `Blocked Booking`, one word away from §1.9's `Blocked` and meaning
   * something else entirely. `Blocked` is client-scoped ("Client cannot
   * create new bookings"); this says a repair job is holding equipment that
   * a specific booking needs. It points *at* a booking, it is not carried
   * *by* one, so it cannot live in the booking registry.
   */
  'Holding a Booking': {
    token: 'progress',
    icon: 'alert_triangle',
    why: 'This repair is holding equipment that a booking needs. Not the registry flag Blocked, which stops a client from booking at all.',
  },
  /**
   * Was `Awaiting Approval`. §1.9's approval-shaped entries are `Deposit
   * Pending` / `Payment Due` (client money on a booking) and `Damaged`
   * ("blocks Close until charge approved or waived"). This is none of them:
   * it is a vendor repair estimate waiting on internal sign-off, and it
   * exists whether or not any booking is involved.
   */
  'Repair Approval Pending': {
    token: 'neutral',
    icon: 'flag',
    why: 'The repair estimate is waiting on internal sign-off — a maintenance-record step, not a booking flag.',
  },
}
