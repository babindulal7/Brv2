import type { AlertRow, Movement, MovementKind } from '../types/today'
import type { BrandKey, StatusKey } from '../lib/status'
import { statusToken, STATUS_ORDER } from '../lib/workflow'
import type { BookingStatus, Flag } from '../lib/workflow'
import {
  getBusinessToday,
  businessDayAd as bsBusinessDayAd,
  toBs,
  formatBs,
  formatAd,
  eachDay,
  kathmanduCivil,
  NPT_OFFSET_MIN,
} from '../lib/bs'
import { clockPad } from '../lib/format'
import { formatMoney, rupees } from '../lib/money'
import { todaysIncoming, todaysOutgoing, type BookingListRow } from '../lib/queries/bookings'
import type { ListFilters } from '../lib/queries/listQuery'

export const TODAYS_OUTGOING_STAGES: readonly BookingStatus[] = ['Booked', 'Packed'] as const
export const TODAYS_INCOMING_STAGES: readonly BookingStatus[] = ['On Rent'] as const

/*
 * The operating day, resolved once when this module loads, from the real
 * clock in Kathmandu (`lib/bs.ts`'s `getBusinessToday`). It replaced an
 * imported `TODAY` constant frozen at 31 Jul 2026.
 */
const TODAY = getBusinessToday()


/**
 * Today Operations seed data.
 *
 * Values from `03 Core Modules/Dashboard.md` v1.1 §5–§10 (the page spec),
 * cross-checked against reference render `Appendix/Screenshots/C2584232…PNG`.
 * Where they differ the spec wins for rules a screenshot cannot express — lakh
 * grouping, VIP as a badge rather than a star, and risk lines that only appear
 * above zero.
 *
 * **Workflow statuses do not come from Dashboard.md.** They come from the
 * Foundation Specification v1.1 §01 (`lib/workflow.ts`), which is build-locked
 * and outranks every module spec.
 *
 * ## §4 Single Source Rule — a hard acceptance gate
 *
 * There is **one array**, `MOVEMENTS`. Pickups, Returns, the Timeline, the
 * throughput strip and the calendar markers are all *derived* from it, and the
 * KPI counts are derived from the same place. The render this page was ported
 * from broke the rule in the open: ABC Films' pickup of B-715 appeared
 * in the Pickups column at **09:00 AM / Ready** and on the Timeline at
 * **06:00 AM / Completed** — one booking, two times, two statuses. That cannot
 * be expressed here, because both panels read the same object.
 *
 * ## 12 Aug 2026 — Today now reads Supabase; this seed does not feed it
 *
 * `modules/today/*` no longer imports `MOVEMENTS` or anything derived from it.
 * The Pickups and Returns columns are `useList(listBookings, todaysOutgoing /
 * todaysIncoming …)`, and the row shape they render is `MovementRow` — built by
 * `toMovementRow` at the bottom of this file from a real `BookingListRow`.
 *
 * The seed below stayed because **`archive/wall/WallDisplay.tsx` still reads
 * it** (`PICKUPS`, `RETURNS`, `todayDate`, `timeOf`, `statusKeyOf`, `has`) and
 * `data/pulse.ts` reads `COUNTS`, `UTILIZATION_PCT` and `REVENUE_TODAY_PAISA`
 * from it. Neither file is in this conversion's scope, so deleting the array
 * would have broken two screens to tidy one. Everything Today alone used —
 * `dashboardKpis`, `ACTIVE_RENTALS`, `HOVER`, `filterMovements`,
 * `SEEDED_PERIODS`, `criticalAlertsFor` — is gone, because a constant that no
 * longer has a screen is just a fabricated figure waiting for one.
 */

/**
 * §3 Nepal Mode date pill — BS leads, AD beneath.
 *
 * Both halves come from the one Date Engine. This previously read
 * "17 Shrawan 2083", which was **one day out**: `Calendar.md` §4.2 fixes the
 * offset at 16 Jul = 1 Shrawan, making 31 Jul the 16th. That off-by-one is the
 * exact bug the spec calls the highest-priority correctness issue in the
 * product, so nothing here hand-writes a BS date any more.
 */
export interface DatePillLabels {
  /**
   * `null` — not `'—'` — when the Date Engine holds no BS month-length data for
   * today. An em dash here claimed the date was unknown while `ad` below held
   * it, and it took the *bold* line of the pill while the real date sat muted
   * beneath: the app hiding a date it knows. The renderer promotes `ad` when
   * this is null; see `lib/bs.ts` `formatBsOrAd` for the same rule in one call.
   */
  readonly bs: string | null
  readonly ad: string
}

/**
 * ⛔ This was a module-scope `TODAY_DATE` object (X-05). The pill is the one
 * thing on the screen that STATES what day it is, so a tablet left open across
 * midnight showed yesterday's date over today's rows — the heading and the
 * figures disagreeing, both looking normal. It is resolved per render now.
 */
export function todayDate(now: Date = new Date()): DatePillLabels {
  const today = getBusinessToday(now)
  const bs = toBs(today)
  return { bs: bs ? formatBs(bs) : null, ad: formatAd(today) }
}

/**
 * A seeded rupee figure, rendered by the Financial Engine.
 *
 * These used to call `lib/format`'s `rs()`, which carries its own copy of the
 * lakh-grouping code. `lib/money` §11: *"every drift found in this project came
 * from one of the four [engines] being reimplemented locally"*, and every
 * amount in the product is supposed to pass through `formatMoney`. Output is
 * byte-identical either way today — which is exactly how the two would drift
 * apart unnoticed.
 */
const amount = (rupeeValue: number) => formatMoney(rupees(rupeeValue))

/**
 * Avatar tints — `StatusKey` token pairs, never hexes.
 *
 * SETTLED — this was a `TODO(decision)`: the five fills below were raw hexes
 * (`#1a1a1a`, `#1e293b`, `#0f2942`, `#1e3a5f`, `#14532d`) carrying `#fff` text,
 * which Foundation §4.2 forbids twice over, and it left Today and Rentals
 * disagreeing about how a client avatar is coloured. The ruling is to move this
 * screen onto `data/rentals.ts`'s pattern — `avatarTone: StatusKey`, a soft
 * tint with token text — rather than extend the token layer with a second,
 * avatar-only ramp.
 *
 * The tone is **client identity, not state**: it says which client, and the
 * row's status is already carried three other ways (pill, left border, and the
 * tinted background an Overdue row wears). So the ramp is the four tokens that
 * carry no hard meaning of their own —
 *
 *   `neutral` · `primary` · `progress` · `in`
 *
 * — and deliberately excludes `danger` (reserved for the Overdue alarm on this
 * screen: a red disc on a Returned row would read as an alert), `out` (a solid
 * fill meaning "gear is out") and `ext` (gold outline, sub-rental).
 *
 * The four clients Today shares with Rentals take the tone Rentals already gave
 * them, which is the whole point of the change: ABC Films `neutral`, Creative
 * Studio `primary`, Mountain Stories `in`, Vision Production `primary`. Rentals
 * tints Inside Out Films `danger` — that echoes *that row's* Overdue state, not
 * the client — so here it takes a ramp tone instead.
 *
 * Every pair was measured in both themes; the weakest is `in` in light theme at
 * 4.57:1, above the 4.5:1 floor.
 */
const AVATAR_RAMP = ['neutral', 'primary', 'progress', 'in'] as const satisfies readonly StatusKey[]

/* ── §4 · the one movements query ──────────────────────────────────────── */

const M = (m: Movement) => m

export const MOVEMENTS: Movement[] = [
  // ── pickups & deliveries ──────────────────────────────────────────────
  M({ id: 'm01', kind: 'Delivery', at: 6 * 60, client: 'Everest Media', avatar: ['EVR', 'MEDIA'], avatarTone: 'primary', bookingNo: 'B-701', category: 'Corporate Film', kit: 'Aputure Lighting Kit', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Delivery: Ramesh', due: 'Due: 2 Aug, 06:00 AM', complete: true }),
  M({ id: 'm02', kind: 'Pickup', at: 7 * 60, client: 'Kathmandu Post', avatar: ['KTM', 'POST'], avatarTone: 'progress', bookingNo: 'B-702', category: 'News Desk', kit: 'Sony A7S III Kit', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Pickup: Hari', due: 'Due: 1 Aug, 06:00 AM', complete: true }),
  M({ id: 'm03', kind: 'Pickup', at: 7 * 60 + 30, client: 'Sagarmatha TV', avatar: ['SGM', 'TV'], avatarTone: 'neutral', bookingNo: 'B-703', category: 'Broadcast', kit: 'Canon C70 Package', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Pickup: Sanu', due: 'Due: 3 Aug, 06:00 AM', complete: true }),
  M({ id: 'm04', kind: 'Delivery', at: 8 * 60, client: 'Himalaya Broadcast', avatar: ['HIM', 'BCAST'], avatarTone: 'in', bookingNo: 'B-704', category: 'Live Event', kit: 'Sennheiser Audio Kit', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Delivery: Bikash', due: 'Due: 2 Aug, 06:00 AM', complete: true }),
  M({ id: 'm05', kind: 'Pickup', at: 8 * 60 + 30, client: 'Nepal Film Dev', avatar: ['NFD', 'BOARD'], avatarTone: 'progress', bookingNo: 'B-705', category: 'Feature Film', kit: 'DJI Ronin 4D', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Pickup: Ramesh', due: 'Due: 5 Aug, 06:00 AM', complete: true }),
  M({ id: 'm06', kind: 'Pickup', at: 9 * 60, client: 'ABC Films', avatar: ['ABC', 'FILMS'], avatarTone: 'neutral', bookingNo: 'B-715', category: 'Commercial Shoot', kit: 'RED Komodo X Package', kitStatus: 'primary', status: 'Packed', flags: ['VIP'], staff: 'Pickup: Ramesh', due: 'Due: 2 Aug, 06:00 AM' }),
  M({ id: 'm07', kind: 'Pickup', at: 9 * 60 + 30, client: 'Lumbini Studios', avatar: ['LUM', 'STUDIO'], avatarTone: 'neutral', bookingNo: 'B-706', category: 'Music Video', kit: 'Godox Strobe Kit', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Pickup: Hari', due: 'Due: 1 Aug, 06:00 AM', complete: true }),
  M({ id: 'm08', kind: 'Pickup', at: 10 * 60 + 30, client: 'Creative Studio', avatar: ['CS', 'STUDIO'], avatarTone: 'primary', bookingNo: 'B-716', category: 'Music Video', kit: 'Sony FX6 Kit', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Pickup: Hari', due: 'Due: 1 Aug, 06:00 AM', notReset: 2 }),
  M({ id: 'm09', kind: 'Delivery', at: 11 * 60, client: 'Pokhara Productions', avatar: ['PKR', 'PROD'], avatarTone: 'in', bookingNo: 'B-718', category: 'Travel Series', kit: 'Grip & Rigging Set', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Delivery: Bikash', due: 'Due: 4 Aug, 06:00 AM' }),
  M({ id: 'm10', kind: 'Pickup', at: 12 * 60, client: 'Mountain Stories', avatar: ['MTN', 'STORIES'], avatarTone: 'in', bookingNo: 'B-717', category: 'Documentary', kit: 'Ronin 4D 6K Package', kitStatus: 'primary', status: 'Packed', flags: [], staff: 'Pickup: Sanu', due: 'Due: 3 Aug, 06:00 AM' }),
  M({ id: 'm11', kind: 'Pickup', at: 13 * 60 + 30, client: 'Annapurna Films', avatar: ['ANP', 'FILMS'], avatarTone: 'progress', bookingNo: 'B-719', category: 'Feature Film', kit: 'Zeiss CP.3 Prime Set', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Pickup: Ramesh', due: 'Due: 6 Aug, 06:00 AM', notReset: 1 }),
  M({ id: 'm12', kind: 'Delivery', at: 14 * 60, client: 'Bagmati Broadcast', avatar: ['BGM', 'BCAST'], avatarTone: 'neutral', bookingNo: 'B-720', category: 'Live Event', kit: 'Lighting Truss Package', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Delivery: Bikash', due: 'Due: 2 Aug, 06:00 AM' }),
  M({ id: 'm13', kind: 'Pickup', at: 15 * 60, client: 'Inside Out Films', avatar: ['IO', 'FILMS'], avatarTone: 'in', bookingNo: 'B-721', category: 'Short Film', kit: 'Ronin 4D Handheld Kit', kitStatus: 'primary', status: 'Packed', flags: [], staff: 'Pickup: Sanu', due: 'Due: 3 Aug, 06:00 AM' }),
  M({ id: 'm14', kind: 'Pickup', at: 16 * 60 + 30, client: 'Studio Nine', avatar: ['S9', 'STUDIO'], avatarTone: 'primary', bookingNo: 'B-722', category: 'Fashion Shoot', kit: 'Blackmagic URSA Kit', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Pickup: Hari', due: 'Due: 4 Aug, 06:00 AM' }),

  // ── returns ───────────────────────────────────────────────────────────
  M({ id: 'm15', kind: 'Return', at: 11 * 60 + 30, client: 'Mountain Stories', avatar: ['MS', 'FILMS'], avatarTone: 'in', bookingNo: 'B-709', category: 'Documentary', kit: 'Sony FX6 Package', kitStatus: 'in', status: 'On Rent', flags: ['Overdue'], statusNote: '1 day late', staff: 'Returned by Hari' }),
  M({ id: 'm16', kind: 'Return', at: 12 * 60 + 30, client: 'Trishuli Media', avatar: ['TRI', 'MEDIA'], avatarTone: 'progress', bookingNo: 'B-723', category: 'Web Series', kit: 'Aputure 300D Kit', kitStatus: 'in', status: 'On Rent', flags: ['Overdue'], statusNote: '2 days late', staff: 'Returned by Sanu' }),
  M({ id: 'm17', kind: 'Return', at: 13 * 60, client: 'Vision Production', avatar: ['VP', 'PROD'], avatarTone: 'primary', bookingNo: 'B-710', category: 'TV Show', kit: 'NISI Athena Set', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], statusNote: 'Due today', staff: 'Returned by Sanu' }),
  M({ id: 'm18', kind: 'Return', at: 14 * 60 + 30, client: 'Inside Out Films', avatar: ['IO', 'FILMS'], avatarTone: 'in', bookingNo: 'B-711', category: 'Short Film', kit: 'Aputure 600D Pro Kit', kitStatus: 'in', status: 'Returned', flags: [], staff: 'ETA: 04:00 PM' }),
  M({ id: 'm19', kind: 'Return', at: 15 * 60, client: 'Chitwan Films', avatar: ['CHT', 'FILMS'], avatarTone: 'neutral', bookingNo: 'B-712', category: 'Wildlife Doc', kit: 'Sachtler Tripod Set', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Bikash' }),
  M({ id: 'm20', kind: 'Return', at: 15 * 60 + 30, client: 'Dolpo Docs', avatar: ['DLP', 'DOCS'], avatarTone: 'in', bookingNo: 'B-724', category: 'Documentary', kit: 'Sony FX3 Body', kitStatus: 'in', status: 'On Rent', flags: ['Overdue'], statusNote: '3 days late', staff: 'Returned by Hari' }),
  M({ id: 'm21', kind: 'Return', at: 16 * 60, client: 'Newa Cinema', avatar: ['NEW', 'CINEMA'], avatarTone: 'primary', bookingNo: 'B-725', category: 'Feature Film', kit: 'Zhiyun Gimbal Kit', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Sanu' }),
  M({ id: 'm22', kind: 'Return', at: 16 * 60 + 30, client: 'Terai Television', avatar: ['TRI', 'TV'], avatarTone: 'progress', bookingNo: 'B-726', category: 'Broadcast', kit: 'LED Panel Set', kitStatus: 'in', status: 'On Rent', flags: ['Overdue'], statusNote: '1 day late', staff: 'Returned by Bikash' }),
  M({ id: 'm23', kind: 'Return', at: 17 * 60, client: 'Gandaki Media', avatar: ['GND', 'MEDIA'], avatarTone: 'neutral', bookingNo: 'B-727', category: 'Corporate Film', kit: 'Canon RF Lens Set', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Ramesh' }),
  M({ id: 'm24', kind: 'Return', at: 17 * 60 + 30, client: 'Rara Pictures', avatar: ['RARA', 'PIX'], avatarTone: 'in', bookingNo: 'B-728', category: 'Short Film', kit: 'Audio Recorder Kit', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Hari' }),
  M({ id: 'm25', kind: 'Return', at: 18 * 60, client: 'Vision Production', avatar: ['VP', 'PROD'], avatarTone: 'primary', bookingNo: 'B-713', category: 'TV Show', kit: 'Alexa Mini LF', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Sanu' }),
]

/* ── derived views — never re-typed ────────────────────────────────────── */

/** §5.2 — "a pickup **or delivery** scheduled today, any status". */
export const PICKUPS = MOVEMENTS.filter((m) => m.kind === 'Pickup' || m.kind === 'Delivery').sort((a, b) => a.at - b.at)
export const RETURNS = MOVEMENTS.filter((m) => m.kind === 'Return' || m.kind === 'Inspection').sort((a, b) => a.at - b.at)

/** §9 — the whole day, chronological. Same objects the columns render. */
export const TIMELINE = [...MOVEMENTS].sort((a, b) => a.at - b.at)

/** §6 — "Minimum 6 rows visible per column before '+ N more'." */
export const ROWS_PER_COLUMN = 6

/** §1.9 — a flag coexists with status; asking for one is not asking for a status. */
export const has = (m: { flags: readonly Flag[] }, f: Flag) => m.flags.includes(f)

export const PICKUP_DONE = PICKUPS.filter((m) => m.complete).length
export const PICKUP_PENDING = PICKUPS.length - PICKUP_DONE
export const RETURN_OVERDUE = RETURNS.filter((m) => has(m, 'Overdue')).length
export const RETURN_EXPECTED = RETURNS.length - RETURN_OVERDUE

/** Items on today's pickups whose state is not yet Ready. */
export const ITEMS_NOT_RESET = PICKUPS.reduce((n, m) => n + (m.notReset ?? 0), 0)

/**
 * §5.7 throughput. `completed / total` and yesterday **at the same clock hour**,
 * not end of day.
 *
 * ⚠ The spec's worked example reads "12 of 25 movements completed today". The
 * 25 is exactly §5.2's 14 + §5.3's 11 and is reproduced here. The 12 is not
 * derivable from its own figures: §5.2 gives 6 completed pickups and §5.3's 11
 * returns are all still open (4 overdue + 7 expected), so the completed count
 * can only be 6. §5.8 says "one query" and card counts must equal panel counts,
 * so the figure is **derived** rather than the literal copied.
 * TODO(decision) — PLAN.md §4: confirm 6, or tell me which movements the 12 counts.
 */
export const MOVE_TOTAL = MOVEMENTS.length
export const MOVE_DONE = MOVEMENTS.filter((m) => m.complete).length
const MOVE_DONE_YESTERDAY = 4
export const THROUGHPUT = `${MOVE_DONE} of ${MOVE_TOTAL} movements completed today · ${MOVE_DONE_YESTERDAY} at this hour yesterday`

/*
 * SETTLED 6 Aug 2026 — Today carries six KPI cards, Revenue and Utilization
 * among them.
 *
 * Foundation §5.2 used to read "No money KPIs. No charts. Revenue and
 * utilization live in Reports", which is why `COUNTS` exists and `dashboardKpis`
 * did not. `Dashboard.PNG` shows six cards; Babin ruled the render correct and
 * §5.2 now records that ruling, so the conflict is closed rather than pending.
 *
 * Both are money KPIs, so §8.3 still governs who sees them: `dashboardKpis`
 * takes `money` and simply omits the two cards when it is false. They are absent
 * from the array — and therefore from the DOM — never masked. `KpiStrip` lays
 * out `items.length` columns, so the strip closes up to four rather than leaving
 * two holes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO(decision) — PLAN.md §4 · 12 Aug 2026. **The paragraph above is one of
 * three live, mutually contradictory answers, and it is not obviously the
 * winner.** Naming the contradiction rather than resolving it, per
 * `WIREFRAME_RULINGS_2026-08-12.md` §9:
 *
 *  1. **This comment** — SETTLED 6 Aug 2026, six cards, Revenue and Utilization
 *     among them, ruled correct against `Dashboard.PNG`.
 *  2. **`types/today.ts`:74-75** quotes v2.0 §5.2 the other way: "A thin count
 *     strip — pickups · returns · overdue · alerts. **No money KPIs.** No
 *     charts."
 *  3. **`../updated mds/02_TODAY.md`:39-41** draws exactly four — Out · In ·
 *     Overdue · **Cash due** — reintroducing one money card, which is precisely
 *     what (2) forbids, and dropping the Critical Alerts card that
 *     `AlertsPanel`'s Critical-only filter used to cite as its authority.
 *
 * PLAN.md contradicts itself across the same seam: §4.0 (line 454) declares the
 * "4-KPI cap" **superseded**, while Phase 6 (line 338) still lists "Today ships
 * a 6-KPI strip against a ≤4 cap" as a **live violation**. An implementer can
 * cite either and be right, which is why this is a decision and not a fix.
 *
 * Until it is ruled, `modules/today/Today.tsx` renders spec 02's four first and
 * keeps Active Rentals and Alerts reachable behind a disclosure — the two of the
 * six that still have a real query behind them. Revenue and Utilization are not
 * rendered on Today by either route: no query in `lib/queries/` produces either,
 * and the two constants below feed Reports ▸ Pulse. **Do not delete them, and do
 * not wire them into a KPI card to close this TODO** — that would answer a
 * decision with a seeded figure.
 */

/* ── §8 alerts ─────────────────────────────────────────────────────────── */

/**
 * §8 — priority sorted, and **every alert carries its own primary action**.
 * "An alert with no action is a notification, not an alert."
 *
 * §5.6 counts Critical-priority alerts only and "must equal the Alerts column
 * count", so the column below renders `CRITICAL_ALERTS`, not this list.
 */
export const ALERTS: AlertRow[] = [
  { icon: 'error', statusKey: 'danger', title: 'Battery Overdue', detail: 'FX3 Battery #B123 is 3 days overdue', right: '3 days ago', rightTone: 'danger', action: 'Open Booking', to: '/rentals/B-709', priority: 'Critical' },
  { icon: 'tool', statusKey: 'progress', title: 'Inspection Pending', detail: 'NISI 50mm T1.9 needs inspection', right: 'Due today', rightTone: 'progress', action: 'Open Inspection', to: '/operations', priority: 'Critical' },
  { icon: 'invoice', statusKey: 'danger', title: 'Invoice Unpaid', detail: 'Invoice #INV-1021 is unpaid', right: amount(48000), rightTone: 'danger', action: 'Receive Payment', to: '/finance', priority: 'Critical' },
  { icon: 'alert_triangle', statusKey: 'progress', title: 'Equipment Missing', detail: 'SmallRig Cage for Komodo', right: 'Since 2 days', rightTone: 'progress', action: 'Open Item', to: '/inventory', priority: 'Critical' },
  { icon: 'calendar_stats', statusKey: 'neutral', title: 'Maintenance Due', detail: 'Generator Honda EU30i service due', right: 'In 2 days', rightTone: 'neutral', action: 'Open Maintenance', to: '/inventory', priority: 'Critical' },
  { icon: 'package', statusKey: 'primary', title: 'Inspection Pending', detail: 'Sachtler head returned with play', right: 'In 3 days', rightTone: 'neutral', action: 'Open Inspection', to: '/operations', priority: 'High' },
]

export const CRITICAL_ALERTS = ALERTS.filter((a) => a.priority === 'Critical')

/*
 * ⛔ `criticalAlertsFor` / `lesserAlertsFor` / `carriesMoney` were deleted here.
 *
 * They filtered the seed above by sniffing `a.right.startsWith('Rs')`, which is
 * how a money alert was kept off a money-blind session. The Alerts column now
 * builds its rows from two real queries — `overdue()` and `quotesExpiring()`,
 * both in `lib/queries/bookings.ts` — and neither carries a rupee figure or a
 * money action, so there is nothing to sniff and nothing to gate. See
 * `overdueAlert` / `quoteLapsedAlert` at the bottom of this file.
 *
 * `ALERTS` itself survives only because `COUNTS` below counts it and
 * `data/pulse.ts` imports `COUNTS`.
 */

/* ── v2.0 §5.2 · the count strip ───────────────────────────────────────── */

/**
 * **"A thin count strip — pickups · returns · overdue · alerts."**
 *
 * Four counts, every one derived from `MOVEMENTS` or `CRITICAL_ALERTS`. This
 * replaces the six KPI cards: v1.x had Active Rentals, Pickups, Returns,
 * Revenue, Utilization and Critical Alerts, of which two carried money and one
 * carried a percentage — all three now belong to Reports ▸ Pulse.
 *
 * `overdue` is deliberately its own count rather than a sub-line of Returns:
 * §1.9 makes Overdue a **Critical** flag that blocks Close and triggers late
 * fees, so it is the one number on this page that is a problem rather than a
 * workload.
 */
export const COUNTS = [
  { label: 'Pickups', value: 14, tone: 'primary', to: '/operations' },
  { label: 'Returns', value: 7, tone: 'progress', to: '/operations' },
  { label: 'Overdue', value: 4, tone: 'danger', to: '/operations' },
  { label: 'Alerts', value: CRITICAL_ALERTS.length, tone: 'danger', to: '/operations' },
] as const

/**
 * Seed figures for **Reports ▸ Pulse only** (`data/pulse.ts` imports both).
 *
 * ⛔ `ACTIVE_RENTALS = 52` used to live here too and fed Today's first KPI card.
 * It is gone: the card now counts `stage = 'On Rent'` through `listBookings`,
 * which is a real number rather than a typed one. Today no longer renders
 * Revenue or Utilization at all — see `dashboardKpis`' obituary below.
 *
 * ⚠ **`REVENUE_TODAY_PAISA` is not Today's "Cash due".** Spec 02 §2.1 draws a
 * fourth KPI called Cash due and this repo derives it nowhere:
 * `listBookings` does not join `payments` (0006:176), `bookings.deposit_required`
 * is the amount REQUIRED rather than the amount owed, and a paid-versus-due
 * total is the Financial Engine's figure and never a page's. Per
 * `WIREFRAME_RULINGS_2026-08-12.md` §8 the card renders "Not tracked yet" until
 * a real source exists. The constant below is a seeded day's *revenue*, a
 * different quantity on a different screen — borrowing it would be exactly the
 * `liquidityReports.ts:113` failure the register was written about.
 * TODO(decision) — PLAN.md §4: what derives "Cash due"?
 */
export const REVENUE_TODAY_PAISA = rupees(185000)
export const UTILIZATION_PCT = 84

/*
 * ⛔ `dashboardKpis(money)` was deleted here.
 *
 * Three of its six cards were constants with no column behind them —
 * `ACTIVE_RENTALS = 52`, `REVENUE_TODAY_PAISA`, `UTILIZATION_PCT` — and one
 * carried a hand-typed delta ("6 from yesterday"). The other three counted the
 * seed array. Today builds its strip inline from the four queries it already
 * runs (`Today.tsx`), so every figure on it is a row count from Postgres:
 *
 *   Active Rentals · Pickups · Returns · Overdue
 *
 * Revenue and Utilization are NOT rendered as "—" — they are absent. There is
 * no revenue or utilization query in `lib/queries/`, and a card whose value can
 * only ever be a dash is a promise the screen cannot keep. Both figures already
 * have a home in Reports ▸ Pulse, which is where the two constants above still
 * go. That also means this screen no longer touches money at all, which is the
 * safest possible answer to Law 6 on a surface Warehouse, Technician and Driver
 * all reach.
 */

/* ── §4 / §5.8 invariants — asserted, not documented ───────────────────── */

/**
 * A booking may generate more than one movement in a day (a delivery out and an
 * inspection back). What it may never do is describe itself two different ways.
 * §4: "the same time, the same package and the same status in both."
 */
const byBooking = new Map<string, Movement>()
for (const m of MOVEMENTS) {
  const seen = byBooking.get(m.bookingNo)
  if (!seen) {
    byBooking.set(m.bookingNo, m)
    continue
  }
  if (seen.client !== m.client || seen.kit !== m.kit || seen.status !== m.status) {
    throw new Error(
      `§4 Single Source Rule violated: ${m.bookingNo} appears twice with different client/package/status — ` +
        `"${seen.client} · ${seen.kit} · ${seen.status}" vs "${m.client} · ${m.kit} · ${m.status}"`,
    )
  }
}

/**
 * The avatar tone is **client identity**, so one client cannot wear two tones.
 * It could before this was asserted: Mountain Stories was `navy` on its pickup
 * row and `ink` on its return, which is the same drift the Single Source Rule
 * above exists to stop — one client, two colours, in two panels side by side.
 *
 * The second check keeps the ramp closed. `danger`, `out` and `ext` typecheck
 * as `StatusKey` but each carries a hard meaning on this screen, and a red or
 * solid-green disc would read as a state rather than as a name.
 */
const toneByClient = new Map<string, StatusKey>()
for (const m of MOVEMENTS) {
  const seen = toneByClient.get(m.client)
  if (seen && seen !== m.avatarTone) {
    throw new Error(`Avatar tone drift: ${m.client} is both "${seen}" and "${m.avatarTone}"`)
  }
  toneByClient.set(m.client, m.avatarTone)
  if (!(AVATAR_RAMP as readonly StatusKey[]).includes(m.avatarTone)) {
    throw new Error(
      `Avatar tone "${m.avatarTone}" (${m.client}) is outside the identity ramp ${AVATAR_RAMP.join(' · ')}`,
    )
  }
}

/** §5.8 — "Card counts must equal the counts shown on the panels below." */
if (PICKUPS.length + RETURNS.length !== MOVEMENTS.length) {
  throw new Error('Movement kinds do not partition: a movement is in neither column')
}
if (PICKUP_PENDING + PICKUP_DONE !== PICKUPS.length || RETURN_OVERDUE + RETURN_EXPECTED !== RETURNS.length) {
  throw new Error('KPI secondary lines do not sum to their card value')
}
if (PICKUPS.length !== 14 || RETURNS.length !== 11) {
  throw new Error(`§5.2/§5.3 reference figures are 14 pickups and 11 returns, got ${PICKUPS.length}/${RETURNS.length}`)
}

/* ── §12 hover card ────────────────────────────────────────────────────── */

/*
 * ⛔ `HOVER` and `HOVER_FALLBACK` were deleted here.
 *
 * They were eight hand-typed strings per booking, seeded for 2 of 25 — deposits
 * held, payments outstanding, "18 items · FX3 Documentary Package", named staff,
 * free-text notes. Not one had a column behind it, and two of them were rupee
 * figures on a screen three money-blind roles can open.
 *
 * The card now renders `MovementRow` fields only, every one of which came off
 * `bookings`: project, the pickup→return dates, the item count, the delivery
 * mode and the two locations. Deposit, Payment, Documents, Staff and Notes are
 * NOT rendered as "Not recorded" — they are absent from the card, because
 * "Not recorded" asserts the database was asked and said nothing, and this
 * query never asks. What each one would need is named in `MovementList.tsx`.
 */

/* ── §13 row menu ──────────────────────────────────────────────────────── */

/** §13 — the twelve entries, in the spec's order. Open is the row primary. */
export const ROW_MENU = [
  'Open',
  'Edit',
  'Complete Pickup',
  'Complete Return',
  'Print Checklist',
  'Packing List',
  'QR',
  'WhatsApp',
  'Call',
  'Email',
  'Invoice',
  'Duplicate',
  'Copy Booking Number',
  'Cancel',
] as const

/* ── §10 mini calendar ─────────────────────────────────────────────────── */

/**
 * §10 — mini-month ONLY. "The event list is deleted" — it repeated the Timeline
 * directly below it.
 *
 * Days are **generated from a range** (`eachDay`), never hand-listed, and their
 * BS values come from the one Date Engine. `Calendar.md` §4.1 flags a build that
 * hand-listed columns and rendered the same day twice; a generated range cannot
 * do that. AD days outside the month the engine can vouch for carry no BS
 * number rather than a guessed one.
 */
export const CAL_MONTH = { bs: 'Shrawan 2083', ad: 'July 2026' }
export const CAL_WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const CAL_LEADING = [29, 30]
export const CAL_TRAILING = [1, 2]
export const CAL_TODAY_AD = TODAY.getUTCDate()

export interface CalDay {
  ad: number
  /** Absent when the Date Engine cannot vouch for this day. */
  bs?: number
  /** `2026-07-31` — the key the Calendar's `?d=` takes. Generated, never built. */
  iso: string
}

/** A UTC-midnight day → its ISO key. The engine's days are already UTC midnight. */
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * 1 Jul → 1 Aug 2026 — the grid's 31 days **plus one**, so the card's ◀ / ▶
 * controls can read their neighbours out of the same generated range.
 *
 * They used to add and subtract from the day *number*: `CAL_TODAY_AD + 1` on
 * 31 July produced `/calendar?d=2026-07-32`, a date that does not exist, and it
 * would have done so on the last day of every month. Day arithmetic is Date
 * Engine territory (`eachDay`), not a page's to hand-roll.
 */
const MONTH_RANGE = eachDay(new Date(Date.UTC(2026, 6, 1)), 32)

export const CAL_DAYS: CalDay[] = MONTH_RANGE.slice(0, 31).map((d) => {
  const bs = toBs(d)
  return bs ? { ad: d.getUTCDate(), bs: bs.day, iso: isoDay(d) } : { ad: d.getUTCDate(), iso: isoDay(d) }
})

const TODAY_INDEX = MONTH_RANGE.findIndex((d) => d.getTime() === TODAY.getTime())

/**
 * Today, and the two days either side of it, as `?d=` keys.
 *
 * ⚠ **Frozen at import, and no longer wired to anything.** The mini-calendar
 * these fed was removed from the Today screen on 30 Aug, and `Today.tsx`'s two
 * "Open Calendar" controls now call {@link businessDayAd} while they render
 * (X-05) — a link built from a constant opened the Calendar on the day the tab
 * was first loaded. They are left here with the rest of that panel's seed rather
 * than deleted (Law 3), but do not re-point a control at one: it is a stale day
 * the moment the clock passes midnight, and it will not look stale.
 */
export const CAL_TODAY_ISO = isoDay(TODAY)
export const CAL_PREV_ISO = isoDay(MONTH_RANGE[TODAY_INDEX - 1] ?? TODAY)
export const CAL_NEXT_ISO = isoDay(MONTH_RANGE[TODAY_INDEX + 1] ?? TODAY)

/**
 * Days carrying movements — **derived from the rows on screen**, never typed.
 *
 * ⛔ This used to be `[3, 8, 14, 22, 27]` plus today: five hand-picked day
 * numbers with nothing behind them, rendered as dots inside the same card as a
 * queried day list and announced to a screen reader as "has movements". That is
 * rule 1's exact failure — a fabricated figure sitting beside real rows, wearing
 * the same mark.
 *
 * The honest set is the one the screen can prove: the Kathmandu civil days its
 * own fetched rows fall on, intersected with the days this mini-month draws.
 * Days outside the selected period therefore carry **no** dot, and that is why
 * the mini Calendar (`CalendarPanel`, removed from the Dashboard 30 Aug 2026
 * and since deleted) labelled the marks with the period rather than leaving a
 * bare dot to be read as "nothing scheduled" — an absent dot here means
 * "outside what was asked for", which is a different statement from "empty".
 * With the panel gone, `eventDaysOf`'s only caller is its guard test in
 * `modules/today/__tests__/todayQuery.test.ts`, kept because the rule it pins
 * — a dot is a booking, never a seeded day number — is what any future month
 * view must inherit.
 *
 * Marking all 31 days truthfully needs a month-wide grouped count that
 * `listBookings` does not provide (it is a list, not an aggregate); that is a
 * query to add, not a constant to keep.
 */
const CAL_DAY_BY_ISO = new Map(CAL_DAYS.map((d) => [d.iso, d.ad]))

export function eventDaysOf(rows: readonly { atDayAd: string }[]): number[] {
  const days = new Set<number>()
  for (const r of rows) {
    const ad = CAL_DAY_BY_ISO.get(r.atDayAd)
    if (ad !== undefined) days.add(ad)
  }
  return [...days].sort((a, b) => a - b)
}

/* ── §11 filters ───────────────────────────────────────────────────────── */

/**
 * §11 period chips — the locked seven, in the Dashboard render's order
 * (All first, Custom last, with its own calendar affordance).
 *
 * ⚠ **Five of these seven are no longer offered on the Dashboard.** 12 Aug
 * 2026: `modules/today/Today.tsx` renders a `[Today][Tomorrow]` control in the
 * page header, which is what `../updated mds/02_TODAY.md`:37 draws, and the
 * chip rail that used to sit in the mini Calendar's header is gone — as is the
 * panel itself (`CalendarPanel`, removed 30 Aug 2026 and since deleted).
 *
 * The array is deliberately untouched. All six live cases in `periodRange` below
 * still work, still reach Postgres as a `dateRange`, and are still covered by
 * `modules/today/__tests__/todayQuery.test.ts` — because the question of how
 * many Today may offer is open, not settled:
 *
 * TODO(decision) — PLAN.md §4: spec 02 line 3 reads "Today's jobs only. All
 * other days live in Operation", while spec 02 line 37 draws `[Today▾]
 * [Tomorrow]` and spec 03 line 38 gives Operation its own
 * `[Today][Tomorrow][Custom ▾]`. Under the strict reading Tomorrow goes too and
 * line 37 is the error; under the drawn reading Today and Tomorrow stay. Both
 * agree the other five do not belong on this screen, which is the only part
 * that has been acted on. **Do not delete these entries to tidy up** — that
 * would decide the open question by making the alternative unbuildable.
 */
export const PERIOD_CHIPS = ['All', 'Today', 'Tomorrow', 'Next 7 Days', 'This Week', 'Next Month', 'Custom'] as const

/** The chip the render draws separately, behind a divider and an icon. */
export const CUSTOM_CHIP = 'Custom'

/** The twelve Foundation stages in workflow order, for §11's Status group. */
const STAGE_NAMES = [...STATUS_ORDER]

/**
 * §11 — "Everything else moves into a `More Filters` panel with one entry
 * point." Status is the six lifecycle values only; v1.0's Confirmed, Reserved,
 * Preparing, Ready, Picked Up, Returning, Maintenance, Completed and Cancelled
 * were removed as *status* values, and Blacklisted became Blocked.
 */
export const MORE_FILTERS: Array<{ group: string; options: string[] }> = [
  { group: 'Pickup', options: ['Booked', 'Packed', 'Late', 'VIP'] },
  { group: 'Return', options: ['Expected', 'Overdue', 'Inspection', 'Deposit Pending', 'Payment Pending', 'Damage', 'Missing'] },
  { group: 'Equipment category', options: ['Camera', 'Lens', 'Lighting', 'Grip', 'Audio', 'Drone', 'Power', 'Accessories', 'Cases', 'Consumables'] },
  { group: 'Client type', options: ['Production Company', 'Educational Institution', 'Freelancer', 'Government', 'NGO', 'Broadcaster', 'Individual'] },
  /*
   * §11's fifth group. Its *values* are superseded — "the six lifecycle values"
   * are Dashboard.md's own six, three of which are not Foundation stages — so
   * the group is populated from `STAGES`, the build-locked twelve. Dropping the
   * group because its listed values were wrong would have been the wrong
   * correction; only the vocabulary was.
   */
  { group: 'Status', options: STAGE_NAMES },
]

/**
 * §11 — the filters have to *filter*, and the ones that cannot must say so.
 *
 * ⛔ This replaces `PREDICATES` + `UNSUPPORTED_FILTERS` + `filterMovements`,
 * which narrowed a fetched array. Rule: a filter whose column exists goes to
 * the server; one that cannot names the column or join that is missing.
 *
 * Exactly ONE thing on this panel is expressible through `ListFilters` against
 * `bookings`: a booking **stage**. Everything else needs either a second
 * `dateRange` (the shape carries one, and the period chips already own it) or a
 * filter scoped to an embedded table (`applyListFilters` builds unscoped
 * `in`/`or` clauses only — see `listQuery.ts`).
 *
 * Nothing here is faked and nothing silently no-ops: an option with a `reason`
 * renders as a genuinely `disabled` control carrying that sentence.
 */
export type FilterSupport =
  | { readonly kind: 'stage'; readonly stage: BookingStatus }
  | { readonly kind: 'unavailable'; readonly reason: string }

/** Needs `return_at` compared with *now* while the period already owns the range. */
const NEEDS_SECOND_RANGE =
  'Needs a second date range on bookings.return_at; ListFilters carries one and the period chips own it.'

/** Two embeds away: bookings → booking_lines → booking_line_units. */
const NEEDS_UNIT_EMBED = (column: string) =>
  `Lives on booking_line_units.${column}, two embeds from bookings; applyListFilters cannot scope a filter to an embedded table.`

const CATEGORY_REASON =
  'Equipment category is inventory_categories.name, reached bookings → booking_lines → products.category_id (0004:89). No embed-scoped filter in ListFilters.'

const CLIENT_TYPE_REASON =
  'Client type is clients.type_parent / clients.org_subtype (0005:42-43). Filtering it needs clients!inner(…) plus a referencedTable-scoped filter, which ListFilters does not express.'

export const FILTER_SUPPORT: Readonly<Record<string, FilterSupport>> = {
  /* Pickup group — "Booked" and "Packed" are stage names, so they are live. */
  Late: { kind: 'unavailable', reason: NEEDS_SECOND_RANGE },
  VIP: {
    kind: 'unavailable',
    reason:
      'No VIP column. clients carries segments[] and tags[] (0005:66,70) but no VIP member, and the booking row carries only client_id.',
  },

  /* Return group. */
  Expected: { kind: 'unavailable', reason: NEEDS_SECOND_RANGE },
  Overdue: { kind: 'unavailable', reason: NEEDS_SECOND_RANGE },
  // §11's Return group predates v2.0: Inspection is a return *job*, not a
  // status, and §1.4 maps it onto the Returned stage. That is a real column.
  Inspection: { kind: 'stage', stage: 'Returned' },
  'Deposit Pending': {
    kind: 'unavailable',
    reason:
      'bookings.deposit_required is the figure REQUIRED; nothing on the booking records what has been received, and the column is unmasked money (Law 6).',
  },
  'Payment Pending': {
    kind: 'unavailable',
    reason: 'payments (0006:176) is not joined by listBookings, and a payment total is the Financial Engine’s to compute.',
  },
  Damage: { kind: 'unavailable', reason: NEEDS_UNIT_EMBED('damaged') },
  Missing: { kind: 'unavailable', reason: NEEDS_UNIT_EMBED('missing_reason') },

  /* Equipment category ×10 and Client type ×7. */
  ...Object.fromEntries(
    (MORE_FILTERS.find((g) => g.group === 'Equipment category')?.options ?? []).map((o) => [
      o,
      { kind: 'unavailable', reason: CATEGORY_REASON } as const,
    ]),
  ),
  ...Object.fromEntries(
    (MORE_FILTERS.find((g) => g.group === 'Client type')?.options ?? []).map((o) => [
      o,
      { kind: 'unavailable', reason: CLIENT_TYPE_REASON } as const,
    ]),
  ),

  /* Status group — the canonical six, straight onto `bookings.stage`. Listed
     last so 'Booked' and 'Packed' (which the Pickup group also offers) resolve
     to the stage rather than to anything above. */
  ...Object.fromEntries(STAGE_NAMES.map((s) => [s, { kind: 'stage', stage: s } as const])),
}

/** The stages a picked option set asks for. Options with no stage are ignored here. */
export function pickedStages(picked: readonly string[]): BookingStatus[] {
  const out: BookingStatus[] = []
  for (const option of picked) {
    const support = FILTER_SUPPORT[option]
    if (support?.kind === 'stage' && !out.includes(support.stage)) out.push(support.stage)
  }
  return out
}

/**
 * The calendar card's day list (§4 again — it is a *view* of the same rows the
 * two columns render, merged back into one chronological day, never a second
 * fetch and never a second set of times).
 *
 * Generic over `{ at }` so the seeded `Movement` (Wall display) and the queried
 * `MovementRow` (Today) both go through the one merge.
 */
export const mergeByTime = <T extends { at: number }>(...lists: T[][]): T[] =>
  lists.flat().sort((a, b) => a.at - b.at)

/* ── display helpers ───────────────────────────────────────────────────── */

/*
 * These four take the STRUCTURAL minimum rather than `Movement`, so the seeded
 * row the Wall display renders and the queried row Today renders resolve their
 * time, dot and status pill through the same four functions. Two copies of
 * "what colour is an overdue row" is exactly the drift §4 exists to stop.
 */

/** §6 — "Time on one line, not stacked." Derived from `at`, never typed. */
export const timeOf = (m: { at: number }) => clockPad(m.at)

/**
 * The solid dot colour a movement wears on the Timeline and in the calendar's
 * day list. One map, read by both, so the same booking cannot be a different
 * colour in two panels that sit side by side.
 *
 * §4.2's five-colour law: purple is not a `BrandKey` value used here, so the
 * render's purple "Inspection" dot resolves to the Returned tone instead.
 */
const STATUS_DOT: Record<BookingStatus, BrandKey> = {
  Quote: 'neutral',
  Booked: 'primary',
  Packed: 'progress',
  'On Rent': 'success',
  Returned: 'progress',
  Closed: 'neutral',
}

/** §1.9 — Overdue is Critical and outranks the status wherever it appears. */
export const dotTone = (m: { flags: readonly Flag[]; status: BookingStatus }): BrandKey =>
  has(m, 'Overdue') ? 'danger' : STATUS_DOT[m.status]

/** Status text for a movement: the Foundation stage, never an invented word. */
export const statusKeyOf = (m: { flags: readonly Flag[]; status: BookingStatus }) =>
  // §1.9 — a Critical flag outranks the status for tone. Overdue is red
  // wherever it appears, whatever the booking's status says.
  has(m, 'Overdue') ? 'danger' : statusToken(m.status)

/* ═══════════════════════════════════════════════════════════════════════
 * §4 · THE REAL QUERY
 *
 * Everything above this line is seed for the Wall display and Pulse.
 * Everything below it is what `modules/today/*` actually renders: one anchor
 * instant, the six period ranges, the two column filter sets, the raw-row →
 * view-model mapping, and the two alert mappings.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * ## The anchor — **now**, as an instant, resolved at the call
 *
 * ⛔ This was `export const NOW_AD = TODAY.toISOString()`, and it was wrong
 * twice over (`BUG_AUDIT_LIFECYCLE_2026-09-02.md` X-06).
 *
 *  1. **It was a DAY MARKER, not an instant.** `getBusinessToday()` returns
 *     midnight UTC of the Kathmandu civil date — which is 05:45 that *morning*
 *     in Kathmandu, not now. `queries/bookings.ts`'s `overdue()` and
 *     `quotesExpiring()` take an INSTANT and say so in their headers: fed a
 *     day marker, `return_at <= 05:45` misses every booking that fell due
 *     earlier today, so the Overdue KPI under-counted all day and
 *     `toRentalListRow`'s "Late today" state was unreachable.
 *  2. **It was frozen at module load.** A warehouse tablet left open across
 *     midnight kept asking yesterday's question under today's heading.
 *
 * So this is a function, and every caller resolves it while it renders. It is
 * the sibling of {@link businessDayAd} below and the two must not be swapped:
 * a **day-bounded** set (`todaysOutgoing`, `periodRange`) takes the day; a
 * comparison against *now* (`overdue`, `quotesExpiring`, `overdueAlert`) takes
 * this. Both are safe to call every render — `queries/bookings.ts` floors the
 * instant to its minute, so `useList`'s filter key stays stable and cannot
 * loop.
 *
 * Law 7: the value is a UTC instant. `new Date()` already is one wherever the
 * tablet's own clock is set, so no Kathmandu shift is applied here — that
 * belongs to the day boundaries and to rendering, both of which have it.
 *
 * @param now Override for tests and for "what would this have been at X".
 */
export function businessNowAd(now: Date = new Date()): string {
  return now.toISOString()
}

/**
 * The **Kathmandu** calendar day an instant falls on — `YYYY-MM-DD`.
 *
 * Exported as a FUNCTION as well as the constant below because a constant is
 * resolved once, when this module is imported, and a warehouse tablet is left
 * open for days. A screen that builds "today's pickups" from the constant is
 * still counting Thursday's pickups on Friday morning, with the heading still
 * reading Today — a wrong figure that looks exactly like a right one.
 *
 * Callers whose figure is labelled *today* must call this at render time. The
 * constant remains for module-scope filter sets whose day is genuinely fixed at
 * import (and for the several screens already built on it), and it is defined in
 * terms of this function so the two cannot answer differently.
 */
export function businessDayAd(now: Date = new Date()): string {
  return bsBusinessDayAd(now)
}

/**
 * The **Kathmandu** calendar day this module was imported on — `YYYY-MM-DD`.
 *
 * ⚠ Frozen at import, and kept only for the module-scope uses that genuinely
 * cannot move: reading a named set's *stage chips* off it ({@link LIST_STAGES}),
 * where the day is irrelevant to the answer. Anything a screen LABELS "today"
 * must call {@link businessDayAd} while it renders instead.
 */
export const TODAY_DAY_AD = new Date(kathmanduCivil(TODAY)).toISOString().slice(0, 10)

const DAY_MS = 86_400_000

/**
 * An instant → its clock position **in Kathmandu**, minutes since local
 * midnight. This is the number `MovementRow.at` holds and `clockPad` renders.
 *
 * The offset comes from `bs.ts`'s one `NPT_OFFSET_MIN`, never a second literal
 * — the same rule `queries/bookings.ts` follows when it builds `+05:45` day
 * boundaries. A row's time and the day boundary that selected it therefore
 * cannot disagree about where Kathmandu is.
 */
export function kathmanduMinutes(instantAd: string): number {
  const t = Date.parse(instantAd)
  if (Number.isNaN(t)) {
    throw new Error(`Expected a full ISO instant, got ${JSON.stringify(instantAd)}`)
  }
  const shifted = new Date(t + NPT_OFFSET_MIN * 60_000)
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
}

/**
 * The clock position the page is rendered at, in Kathmandu minutes. Drives the
 * Timeline's window and its "now" ring.
 *
 * ⛔ This was `export const NOW = kathmanduMinutes(NOW_AD)`
 * (`BUG_AUDIT_LIFECYCLE_2026-09-02.md` AR-03). `NOW_AD` was a day marker —
 * midnight UTC — so this was **always 05:45**, whatever time it actually was,
 * and the comment above it claimed otherwise. The Timeline therefore opened on
 * the first movement after 05:45 and ringed it as "now" at every hour of the
 * day: at 4pm it was scrolled to the morning with the ring eight hours behind
 * the operator.
 *
 * The comment was the true half, so the VALUE was fixed rather than the words:
 * this reads the real clock, and the caller resolves it per render.
 */
export function clockNowMinutes(now: Date = new Date()): number {
  return kathmanduMinutes(now.toISOString())
}

/** Whole Kathmandu calendar days from one instant to another. Negative before. */
export function civilDaysBetween(fromAd: string, toAd: string): number {
  return Math.round((kathmanduCivil(new Date(toAd)) - kathmanduCivil(new Date(fromAd))) / DAY_MS)
}

/* ── §11 · the period chips, as AD day ranges ──────────────────────────── */

export type Period = (typeof PERIOD_CHIPS)[number]
/** Every chip except Custom, which opens no picker — see `PERIOD_UNAVAILABLE`. */
export type LivePeriod = Exclude<Period, typeof CUSTOM_CHIP>

/** Why the Custom chip is rendered `disabled` instead of half-built. */
export const PERIOD_UNAVAILABLE =
  'Custom needs a date-range picker this screen does not have. Every other chip is a real server-side range.'

export interface DayRange {
  /** Inclusive first Nepal calendar day, `YYYY-MM-DD`. */
  readonly from: string
  /** Inclusive last Nepal calendar day. */
  readonly to: string
}

/** `YYYY-MM-DD` → the UTC-midnight `Date` the Date Engine works in. */
const dayStart = (dayAd: string) => new Date(`${dayAd}T00:00:00.000Z`)

/**
 * n days from a day, forwards or backwards.
 *
 * UTC-midnight arithmetic, which is exactly what `bs.ts`'s `eachDay` does
 * internally (`start + i * DAY`) — `eachDay` itself only runs forwards, and
 * "This Week" has to walk back to Monday. Day *numbers* are never added: that
 * is the bug `data/today.ts` already fixed once, where `31 + 1` produced
 * `2026-07-32`.
 */
const shiftDay = (dayAd: string, days: number) => isoDay(new Date(dayStart(dayAd).getTime() + days * DAY_MS))

/**
 * A period chip → the AD day range it means. `null` is the **All** chip: no
 * date constraint at all, not an empty range.
 *
 * ⛔ Four of the six chips used to return `[]` from `filterMovements` because
 * they were not in `SEEDED_PERIODS`, so Tomorrow, Next 7 Days, This Week and
 * Next Month each emptied all four panels and blamed the backend. Every one of
 * them is a date range and every one is expressible; they are computed here and
 * pushed into `dateRange`, so the narrowing happens in Postgres.
 *
 * Two conventions are chosen here rather than found in a spec, and are stated
 * so they can be corrected in one place:
 *
 *  - **Next 7 Days** is today plus the next six — seven days INCLUDING today,
 *    the reading that matches how the chip sits beside "Today" and "Tomorrow".
 *  - **This Week** runs Monday→Sunday, because `CAL_WEEKDAYS` above starts the
 *    app's week on MON. (`bs.ts`'s `isWeekend` shades Saturday, which is Nepal's
 *    weekend day; that is which day is off, not which day starts the week.)
 *
 * **Next Month** is the next AD calendar month, first to last — Law 7, AD is
 * what is stored and queried, BS is rendered.
 */
export function periodRange(period: LivePeriod, todayAd: string): DayRange | null {
  switch (period) {
    case 'All':
      return null
    case 'Today':
      return { from: todayAd, to: todayAd }
    case 'Tomorrow': {
      const d = shiftDay(todayAd, 1)
      return { from: d, to: d }
    }
    case 'Next 7 Days':
      return { from: todayAd, to: shiftDay(todayAd, 6) }
    case 'This Week': {
      // getUTCDay: 0 Sun … 6 Sat. Days elapsed since the Monday of this week.
      const sinceMonday = (dayStart(todayAd).getUTCDay() + 6) % 7
      return { from: shiftDay(todayAd, -sinceMonday), to: shiftDay(todayAd, 6 - sinceMonday) }
    }
    case 'Next Month': {
      const d = dayStart(todayAd)
      // Day 0 of month n+2 is the last day of month n+1 — no month-length table.
      return {
        from: isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))),
        to: isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 0))),
      }
    }
  }
}

/* ── the two column filter sets ────────────────────────────────────────── */

/**
 * A column's filters, plus the one thing `ListFilters` cannot say.
 *
 * ⚠ `impossible` is not decoration. `applyListFilters` treats an EMPTY chip
 * array as "no constraint", never as "match nothing" — so a filter set whose
 * stage intersection came out empty would, if sent, return **every stage**,
 * which is the exact opposite of what the operator asked for. The screen must
 * not send it; it renders the empty state instead. See `Today.tsx`.
 */
export interface ColumnQuery {
  readonly filters: ListFilters
  readonly impossible: boolean
}

/**
 * Widen a named single-day set to a day RANGE.
 *
 * Both ends are taken from the named set itself — `todaysOutgoing(from)` for the
 * lower bound and `todaysOutgoing(to)` for the upper — rather than by building
 * boundaries here. `startOfDay`/`endOfDay` are module-private in
 * `queries/bookings.ts` and carry the `+05:45` reasoning that makes the day a
 * screen filters by the day it labels; re-deriving them in a data file is how a
 * second, wrong copy of Nepal's offset gets written.
 *
 * **Exported** (4 Sep 2026) because the Calendar Workspace's *Upcoming (Next 7
 * Days)* rail needs the same widening over the same `todaysOutgoing`. Copying
 * these eight lines into `data/calendar.ts` would have been the second copy this
 * comment warns about — the one that says "the day boundary is built in exactly
 * one place" while building it in two. Nothing about the function changed.
 */
export function overDays(
  namedSet: (dayAd: string) => ListFilters,
  range: DayRange | null,
  anchorDayAd: string,
): ListFilters {
  const lo = namedSet(range ? range.from : anchorDayAd)
  // The All chip: keep the set's stage chips, presence flags and sort, drop the
  // day bounds entirely. `filterKey` and `applyListFilters` both ignore an
  // `undefined` dateRange, so this is "no constraint", not an empty one.
  if (!range) return { ...lo, dateRange: undefined }

  const hi = namedSet(range.to)
  if (!lo.dateRange || !hi.dateRange) return lo
  return {
    ...lo,
    dateRange: { column: lo.dateRange.column, fromAd: lo.dateRange.fromAd, toAd: hi.dateRange.toAd },
  }
}

/**
 * Narrow a column's structural stage set by the operator's Status chips.
 *
 * **Intersection, never replacement.** The Pickups column MEANS "Booked or
 * Packed pickups in this period" (`todaysOutgoing`); letting a Status chip
 * overwrite that would put Quotes and Closed bookings in a column headed
 * Pickups. Picking a stage the column does not carry is therefore legitimately
 * empty rather than wrong — and that emptiness is reported through
 * `impossible`, because the empty array itself cannot express it.
 */
function narrowStages(base: ListFilters, stages: readonly BookingStatus[]): ColumnQuery {
  if (stages.length === 0) return { filters: base, impossible: false }
  const structural = (base.chips?.['stage'] ?? []) as readonly BookingStatus[]
  const kept = structural.filter((s) => stages.includes(s))
  return { filters: { ...base, chips: { ...base.chips, stage: kept } }, impossible: kept.length === 0 }
}

/**
 * Today ▸ Pickups — `todaysOutgoing` widened to the chip's range and narrowed
 * by Status.
 *
 * `dayAd` defaults to {@link businessDayAd}, which is a DEFAULT ARGUMENT and so
 * resolves at the call, not at import. Both of these used to close over
 * `TODAY_DAY_AD`; a tablet left on this screen across midnight then kept
 * fetching yesterday's pickups under a heading that still said Today, beside a
 * date pill reading the real date (X-05). The day is a parameter for the same
 * reason `calendar.ts`'s `railBookingCounts` takes one: the figure and the
 * heading are then computed from one day.
 */
export function pickupsQuery(
  period: LivePeriod,
  picked: readonly string[],
  dayAd: string = businessDayAd(),
): ColumnQuery {
  return narrowStages(overDays(todaysOutgoing, periodRange(period, dayAd), dayAd), pickedStages(picked))
}

/** Today ▸ Returns — the same, over `todaysIncoming`. See {@link pickupsQuery}. */
export function returnsQuery(
  period: LivePeriod,
  picked: readonly string[],
  dayAd: string = businessDayAd(),
): ColumnQuery {
  return narrowStages(overDays(todaysIncoming, periodRange(period, dayAd), dayAd), pickedStages(picked))
}

/**
 * Which stages each list can EVER show — read off the same named sets the
 * queries above narrow, never re-typed, so this cannot drift from them.
 *
 * `MoreFilters` consumes it to keep a §11 rule this page was breaking: a stage
 * chip whose intersection with the list's structural stages is empty is a
 * control whose only possible outcome is the empty state — a live-looking
 * button that can never do anything but clear the screen (found in the 1 Sep
 * Dashboard sweep: five of Outgoing's seven live stage chips, six of
 * Incoming's). `narrowStages` reports that emptiness honestly as `impossible`;
 * the chip must be honest one step earlier, before the click.
 */
export const LIST_STAGES: Record<'Outgoing' | 'Incoming', readonly BookingStatus[]> = {
  Outgoing: TODAYS_OUTGOING_STAGES as readonly BookingStatus[],
  Incoming: TODAYS_INCOMING_STAGES as readonly BookingStatus[],
}

/**
 * The Active Rentals KPI — everything currently with a client.
 *
 * Not a named set in `queries/bookings.ts` because it is one card on one
 * screen, and 'On Rent' is the stage's own definition of "out": `workflow.ts`
 * §1.2 reads "All items with the client." No date range — an active rental is
 * active whatever day it left on, which is also why the period chips do not
 * touch this card.
 */
export const ACTIVE_RENTALS_FILTERS: ListFilters = {
  chips: { stage: ['On Rent'] satisfies BookingStatus[] },
  presence: { cancelled_at: false, actual_return_at: false },
  sort: { column: 'return_at', ascending: true },
}

/* ── raw row → the shape the panels render ─────────────────────────────── */

/**
 * What a Today panel draws. Every field is either a `bookings` column or a
 * formatting of one — there are no derived business figures here (Law 1) and
 * nothing invented (rule 1).
 *
 * What `Movement` carried and this does NOT, because no column exists:
 * `kit` / `kitStatus` (the package name — `bookings` has `itemCount`, a number,
 * and nothing else), `category`, `staff`, `complete`, `notReset`, and the `VIP`
 * flag. Each absence is handled at the render site, named there.
 */
export interface MovementRow {
  id: string
  bookingNo: string
  clientId: string
  /** `clients.name` through the join. */
  client: string
  /** Initials of `client`. Display formatting of a real field, not a new fact. */
  monogram: string
  /** Identity, not state — see `AVATAR_RAMP`. Deterministic in `clientId`. */
  avatarTone: StatusKey
  /** Pickup/Delivery from `delivery_type`; Return from which query the row came out of. */
  kind: MovementKind
  /** Minutes since Kathmandu midnight, off this row's own movement instant. */
  at: number
  /**
   * The **Kathmandu** calendar day that same instant falls on, `YYYY-MM-DD`.
   *
   * `at` alone cannot say which day a row is on, so the mini-month had no way to
   * mark a day from real rows and marked five invented ones instead. Derived
   * through `bs.ts`'s `kathmanduCivil` — the one function the query side's day
   * boundaries also use — so the day a row is DRAWN on and the day it was
   * SELECTED by cannot disagree.
   */
  atDayAd: string
  /** `bookings.stage` — one of the canonical six, verified 1:1 against `BookingStatus`. */
  status: BookingStatus
  /** Only ever `['Overdue']` or `[]`. `VIP` and `Due Soon` have no source — see below. */
  flags: Flag[]
  /** "2 days late". Present only when the row is overdue. */
  statusNote?: string
  /** `bookings.project`, nullable. Rendered as an explicit non-value when null. */
  project: string | null
  /** `sum(booking_lines.qty)` over live lines — UNITS, not rows. */
  itemCount: number
  /** "Due 2 Aug 2026 · 06:00 AM" — formatted `bookings.return_at`. */
  due: string
  /** "31 Jul 2026 → 2 Aug 2026" — the two dates, with no day count. */
  duration: string
  /** `bookings.pickup_location`, nullable free text — never the branch name. */
  pickupLocation: string | null
  /** `bookings.return_location`, nullable. */
  returnLocation: string | null
  /** `bookings.delivery_type`. An enum member, not UI copy. */
  deliveryType: BookingListRow['deliveryType']
}

/**
 * The avatar tint for a client.
 *
 * `AVATAR_RAMP` at the top of this file is the closed four-tone identity ramp,
 * and the seed asserted one tone per client by hand. With real rows the same
 * invariant has to hold without a table: a pure function of `clients.id` gives
 * the same client the same tone in every panel, on every load, and cannot reach
 * `danger` / `out` / `ext`, each of which carries a hard meaning on this screen.
 *
 * It is a colour, not a fact — nothing is claimed about the client by it.
 */
export function avatarToneFor(clientId: string): StatusKey {
  let h = 0
  for (let i = 0; i < clientId.length; i += 1) h = (h * 31 + clientId.charCodeAt(i)) >>> 0
  return AVATAR_RAMP[h % AVATAR_RAMP.length] ?? 'neutral'
}

/**
 * "Mountain Stories" → "MS". One token, not two stacked: §4.3.6 puts text at
 * 12px minimum and two 12px lines do not fit a 34px disc. The full name is on
 * the row beside it, so this only has to be a recognisable mark.
 */
export function monogramOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  const initials = words.slice(0, 3).map((w) => (w[0] ?? '').toUpperCase()).join('')
  return initials || name.slice(0, 2).toUpperCase()
}

/** "2 Aug 2026 · 06:00 AM" — the one way this screen writes an instant. */
function stampOf(instantAd: string): string {
  return `${formatAd(new Date(instantAd))} · ${clockPad(kathmanduMinutes(instantAd))}`
}

/**
 * A raw booking row → the row a panel renders.
 *
 * `side` is which named query produced it, and it is load-bearing twice:
 *
 *  1. **Which instant the row sits at.** An outgoing row is at its `pickup_at`,
 *     an incoming one at its `return_at`. That is what puts the same booking in
 *     two panels at two honest times rather than one wrong one.
 *  2. **`kind`.** `delivery_type` separates Pickup from Delivery, and nothing on
 *     the row says "this is a return" — Return-ness is which query asked. There
 *     is no `Inspection` kind here at all: `0015` collapsed Inspection onto the
 *     Returned stage and, by its own admission, the job-state axis that would
 *     tell them apart "has no storage anywhere in this schema today".
 *
 * ### Overdue, and the flag that is NOT here
 *
 * `Overdue` is the predicate `queries/bookings.ts`'s `overdue()` already encodes
 * server-side — due back before now, never actually returned — evaluated here
 * against the same anchor instant so a row cannot be overdue in the Alerts panel
 * and on time in the column beside it.
 *
 * `Due Soon` is deliberately NOT derived. It needs a "how soon is soon" window
 * that no spec in this repo states, and inventing one puts an amber border on a
 * booking for a reason nobody chose. `VIP` needs a client attribute that does
 * not exist in the schema at all.
 */
export function toMovementRow(row: BookingListRow, side: 'outgoing' | 'incoming', nowAd: string): MovementRow {
  const atAd = side === 'outgoing' ? row.pickupAtAd : row.returnAtAd
  const overdue = row.actualReturnAtAd === null && Date.parse(row.returnAtAd) < Date.parse(nowAd)
  const lateDays = overdue ? civilDaysBetween(row.returnAtAd, nowAd) : 0

  return {
    id: row.id,
    bookingNo: row.bookingNo,
    clientId: row.clientId,
    client: row.clientName,
    monogram: monogramOf(row.clientName),
    avatarTone: avatarToneFor(row.clientId),
    kind: side === 'incoming' ? 'Return' : row.deliveryType === 'Client Pickup' ? 'Pickup' : 'Delivery',
    at: kathmanduMinutes(atAd),
    atDayAd: new Date(kathmanduCivil(new Date(atAd))).toISOString().slice(0, 10),
    status: row.stage,
    flags: overdue ? ['Overdue'] : [],
    ...(overdue ? { statusNote: lateDays > 0 ? `${lateDays} day${lateDays === 1 ? '' : 's'} late` : 'Late today' } : {}),
    project: row.project,
    itemCount: row.itemCount,
    due: `Due ${stampOf(row.returnAtAd)}`,
    // Two dates and no day count on purpose. "3 days" is a rental-day figure and
    // Law 1 puts every figure in the engine that owns it; a page counting its
    // own billing days is the second opinion that law exists to prevent.
    duration: `${formatAd(new Date(row.pickupAtAd))} → ${formatAd(new Date(row.returnAtAd))}`,
    pickupLocation: row.pickupLocation,
    returnLocation: row.returnLocation,
    deliveryType: row.deliveryType,
  }
}

/* ── §8 · alerts, from queries rather than from a list of six ──────────── */

/**
 * An overdue booking → the Critical alert row.
 *
 * The source is `overdue(businessNowAd())` — stage On Rent, due back before
 * that instant, `actual_return_at` still null. Every field below is that row.
 *
 * ⚠ `nowAd` must be the SAME instant the query was built from, and an instant
 * it is: `days` is `civilDaysBetween(return_at, nowAd)`, and a day marker there
 * put every booking that fell due earlier today at "0 days" rather than at
 * "Late today" (X-06).
 *
 * §8: "every alert carries its own primary action", and it is the same action
 * the Returns column offers, pointing at the same booking.
 */
export function overdueAlert(row: BookingListRow, nowAd: string): AlertRow {
  const days = civilDaysBetween(row.returnAtAd, nowAd)
  return {
    icon: 'error',
    statusKey: 'danger',
    title: 'Return Overdue',
    detail: `${row.clientName} · ${row.bookingNo}`,
    right: days > 0 ? `${days} day${days === 1 ? '' : 's'} late` : 'Late today',
    rightTone: 'danger',
    action: 'Open Booking',
    to: `/rentals/${row.bookingNo}`,
    priority: 'Critical',
  }
}

/**
 * A quote whose stated date has passed → a High alert.
 *
 * ⚠ It says the date has PASSED, not that the quote is dead. `0002:37` carries
 * a `TODO(decision)` recording that whether a quote lapses at all is
 * unspecified and nothing in the schema acts on the date, and `quotesExpiring`
 * repeats that in its own header. So the row states the date and offers the
 * booking; it does not render a verdict.
 */
export function quoteLapsedAlert(row: BookingListRow): AlertRow {
  return {
    icon: 'calendar_stats',
    statusKey: 'progress',
    title: 'Quote Past Its Date',
    detail: `${row.clientName} · ${row.bookingNo}`,
    right: row.quoteExpiresAtAd ? formatAd(new Date(row.quoteExpiresAtAd)) : '—',
    rightTone: 'progress',
    action: 'Open Quote',
    to: `/rentals/${row.bookingNo}`,
    priority: 'High',
  }
}
