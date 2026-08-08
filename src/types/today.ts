import type { IconName } from '../components/ui/Icon'
import type { StatusKey } from '../lib/status'
import type { BookingStatus, Flag } from '../lib/workflow'

/**
 * Today Operations row shapes — Foundation v2.0.
 *
 * Colour is never a literal here. A row names a `StatusKey`, and
 * `lib/status.ts` resolves it to a CSS variable pair the token layer redefines
 * per theme. That is why no component in this module branches on theme.
 */

/**
 * §4 **Single Source Rule** — the movement is the atom.
 *
 * Pickups, Returns, the Timeline and the Calendar are four *views* of one array
 * of these, never four fetches. Because a booking's time, package and status
 * live on one object, "a booking appearing in two panels must show the same
 * time, the same package and the same status in both" is not a rule anyone can
 * break.
 */
export type MovementKind = 'Pickup' | 'Delivery' | 'Return' | 'Inspection'

export interface Movement {
  id: string
  kind: MovementKind
  /** Minutes since midnight. The displayed time is derived, never typed twice. */
  at: number
  client: string
  avatar: string[]
  /**
   * §4.2 token key, not a hex — the same field `data/rentals.ts` carries, so the
   * two screens resolve a client avatar the same way. Resolved through `STATUS`
   * at the call site; the theme decides what it looks like.
   */
  avatarTone: StatusKey
  bookingNo: string
  category: string
  /** The package. One string, shared by every panel that shows this booking. */
  kit: string
  kitStatus: StatusKey
  /**
   * v2.0 §1.2 — one of the canonical **six**. The 12 stages are retired; §1.4's
   * mapping turned `Preparing` into `Booked` + a Pack job, `Ready` into
   * `Packed`, `Return Due` into `On Rent` + a `Due Soon` flag, and so on.
   */
  status: BookingStatus
  /** §1.9 — flags coexist with status and never replace it. */
  flags: Flag[]
  /** Second status line, e.g. "1 day late" — never a status of its own. */
  statusNote?: string
  /** "Pickup: Ramesh" / "Returned by Hari". */
  staff: string
  due?: string
  /** §5.7 throughput — this movement is finished. */
  complete?: boolean
  /** Items on this booking that are not yet Ready. */
  notReset?: number
}

/** §12 hover card fields. Everything the 520px card shows for one booking. */
export interface HoverFacts {
  project: string
  duration: string
  deposit: string
  payment: string
  equipment: string
  documents: string
  staff: string
  notes: string
}

/**
 * v2.0 §5.2 — **"Today = today's jobs only… A thin count strip — pickups ·
 * returns · overdue · alerts. No money KPIs. No charts."**
 *
 * This replaces the six KPI cards. `KpiTile` is gone from this module: a tile
 * with an accent, a delta and a risk line is the shape §5.2 removed, and
 * leaving the type behind is how it would grow back. Revenue and utilization
 * live in Reports ▸ Pulse (§5.3).
 */
export interface CountItem {
  label: string
  value: number
  icon: IconName
  /** Only the five tones exist (§4.2); a count is neutral unless it is a problem. */
  tone: StatusKey
  /** §5.8's rule survives: a count lands on a pre-filtered view. */
  to: string
}

export interface AlertRow {
  icon: IconName
  statusKey: StatusKey
  title: string
  detail: string
  right: string
  rightTone: StatusKey
  /** §8: "Every alert carries its own primary action." */
  action: string
  to: string
  /** The Alerts count and this column read the same filtered list. */
  priority: 'Critical' | 'High' | 'Normal'
}
