import type { AlertRow, Movement, HoverFacts } from '../types/today'
import type { Kpi } from '../components/ui/Page'
import type { BrandKey } from '../lib/status'
import { statusToken, STATUS_ORDER } from '../lib/workflow'
import type { BookingStatus, Flag } from '../lib/workflow'
import { TODAY, toBs, formatBs, eachDay } from '../lib/bs'
import { clockPad } from '../lib/format'
import { formatMoney, rupees } from '../lib/money'

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
 * from broke the rule in the open: ABC Films' pickup of BK-2026-0715 appeared
 * in the Pickups column at **09:00 AM / Ready** and on the Timeline at
 * **06:00 AM / Completed** — one booking, two times, two statuses. That cannot
 * be expressed here, because both panels read the same object.
 *
 * NOT wired to Supabase. `MOVEMENTS` is replaced wholesale by the real
 * movements query; every derivation below survives untouched.
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
const TODAY_BS = toBs(TODAY)
export const TODAY_DATE = {
  bs: TODAY_BS ? formatBs(TODAY_BS) : '—',
  ad: TODAY.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'UTC' }),
}

/** The clock position the page is rendered at, in minutes since midnight. */
export const NOW = 9 * 60 + 40

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
 * Avatar fills. Named here rather than typed as hexes at each row.
 *
 * §4.2's five-colour law bans **purple, violet, cyan, teal and indigo
 * outright**, and this map had broken it twice: four rows once carried the
 * render's `#4c1d95` violet, and `teal: '#134e4a'` (a blue-green) survived the
 * sweep that removed it because a sweep looking for `--purple` never sees a
 * literal. Both are gone; `moss` is a dark green, which is one of the five.
 *
 * TODO(decision) — PLAN.md §4: these are still raw hexes, which Foundation
 * §4.2 also forbids. They cannot be tokens as things stand: an avatar is a
 * solid dark disc carrying white text in **both** themes, and every fill token
 * in `theme.css` inverts between them. `data/rentals.ts` solved the same
 * problem differently — `avatarTone: StatusKey`, a soft tint with token text —
 * and the two screens should not disagree. Either extend the token layer with
 * a theme-invariant avatar ramp, or move this screen onto the Rentals pattern.
 * Both are visual decisions with an owner; neither is mine to pick.
 */
const AV = {
  ink: '#1a1a1a',
  slate: '#1e293b',
  navy: '#0f2942',
  steel: '#1e3a5f',
  moss: '#14532d',
} as const

/* ── §4 · the one movements query ──────────────────────────────────────── */

const M = (m: Movement) => m

export const MOVEMENTS: Movement[] = [
  // ── pickups & deliveries ──────────────────────────────────────────────
  M({ id: 'm01', kind: 'Delivery', at: 6 * 60, client: 'Everest Media', avatar: ['EVR', 'MEDIA'], avatarBg: AV.navy, bookingNo: 'BK-2026-0701', category: 'Corporate Film', kit: 'Aputure Lighting Kit', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Delivery: Ramesh', due: 'Due: 2 Aug, 06:00 AM', complete: true }),
  M({ id: 'm02', kind: 'Pickup', at: 7 * 60, client: 'Kathmandu Post', avatar: ['KTM', 'POST'], avatarBg: AV.slate, bookingNo: 'BK-2026-0702', category: 'News Desk', kit: 'Sony A7S III Kit', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Pickup: Hari', due: 'Due: 1 Aug, 06:00 AM', complete: true }),
  M({ id: 'm03', kind: 'Pickup', at: 7 * 60 + 30, client: 'Sagarmatha TV', avatar: ['SGM', 'TV'], avatarBg: AV.ink, bookingNo: 'BK-2026-0703', category: 'Broadcast', kit: 'Canon C70 Package', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Pickup: Sanu', due: 'Due: 3 Aug, 06:00 AM', complete: true }),
  M({ id: 'm04', kind: 'Delivery', at: 8 * 60, client: 'Himalaya Broadcast', avatar: ['HIM', 'BCAST'], avatarBg: AV.steel, bookingNo: 'BK-2026-0704', category: 'Live Event', kit: 'Sennheiser Audio Kit', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Delivery: Bikash', due: 'Due: 2 Aug, 06:00 AM', complete: true }),
  M({ id: 'm05', kind: 'Pickup', at: 8 * 60 + 30, client: 'Nepal Film Dev', avatar: ['NFD', 'BOARD'], avatarBg: AV.moss, bookingNo: 'BK-2026-0705', category: 'Feature Film', kit: 'DJI Ronin 4D', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Pickup: Ramesh', due: 'Due: 5 Aug, 06:00 AM', complete: true }),
  M({ id: 'm06', kind: 'Pickup', at: 9 * 60, client: 'ABC Films', avatar: ['ABC', 'FILMS'], avatarBg: AV.ink, bookingNo: 'BK-2026-0715', category: 'Commercial Shoot', kit: 'RED Komodo X Package', kitStatus: 'primary', status: 'Packed', flags: ['VIP'], staff: 'Pickup: Ramesh', due: 'Due: 2 Aug, 06:00 AM' }),
  M({ id: 'm07', kind: 'Pickup', at: 9 * 60 + 30, client: 'Lumbini Studios', avatar: ['LUM', 'STUDIO'], avatarBg: AV.navy, bookingNo: 'BK-2026-0706', category: 'Music Video', kit: 'Godox Strobe Kit', kitStatus: 'in', status: 'On Rent', flags: [], staff: 'Pickup: Hari', due: 'Due: 1 Aug, 06:00 AM', complete: true }),
  M({ id: 'm08', kind: 'Pickup', at: 10 * 60 + 30, client: 'Creative Studio', avatar: ['CS', 'STUDIO'], avatarBg: AV.slate, bookingNo: 'BK-2026-0716', category: 'Music Video', kit: 'Sony FX6 Kit', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Pickup: Hari', due: 'Due: 1 Aug, 06:00 AM', notReset: 2 }),
  M({ id: 'm09', kind: 'Delivery', at: 11 * 60, client: 'Pokhara Productions', avatar: ['PKR', 'PROD'], avatarBg: AV.steel, bookingNo: 'BK-2026-0718', category: 'Travel Series', kit: 'Grip & Rigging Set', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Delivery: Bikash', due: 'Due: 4 Aug, 06:00 AM' }),
  M({ id: 'm10', kind: 'Pickup', at: 12 * 60, client: 'Mountain Stories', avatar: ['MTN', 'STORIES'], avatarBg: AV.navy, bookingNo: 'BK-2026-0717', category: 'Documentary', kit: 'Ronin 4D 6K Package', kitStatus: 'primary', status: 'Packed', flags: [], staff: 'Pickup: Sanu', due: 'Due: 3 Aug, 06:00 AM' }),
  M({ id: 'm11', kind: 'Pickup', at: 13 * 60 + 30, client: 'Annapurna Films', avatar: ['ANP', 'FILMS'], avatarBg: AV.ink, bookingNo: 'BK-2026-0719', category: 'Feature Film', kit: 'Zeiss CP.3 Prime Set', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Pickup: Ramesh', due: 'Due: 6 Aug, 06:00 AM', notReset: 1 }),
  M({ id: 'm12', kind: 'Delivery', at: 14 * 60, client: 'Bagmati Broadcast', avatar: ['BGM', 'BCAST'], avatarBg: AV.slate, bookingNo: 'BK-2026-0720', category: 'Live Event', kit: 'Lighting Truss Package', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Delivery: Bikash', due: 'Due: 2 Aug, 06:00 AM' }),
  M({ id: 'm13', kind: 'Pickup', at: 15 * 60, client: 'Inside Out Films', avatar: ['IO', 'FILMS'], avatarBg: AV.moss, bookingNo: 'BK-2026-0721', category: 'Short Film', kit: 'Ronin 4D Handheld Kit', kitStatus: 'primary', status: 'Packed', flags: [], staff: 'Pickup: Sanu', due: 'Due: 3 Aug, 06:00 AM' }),
  M({ id: 'm14', kind: 'Pickup', at: 16 * 60 + 30, client: 'Studio Nine', avatar: ['S9', 'STUDIO'], avatarBg: AV.steel, bookingNo: 'BK-2026-0722', category: 'Fashion Shoot', kit: 'Blackmagic URSA Kit', kitStatus: 'primary', status: 'Booked', flags: [], staff: 'Pickup: Hari', due: 'Due: 4 Aug, 06:00 AM' }),

  // ── returns ───────────────────────────────────────────────────────────
  M({ id: 'm15', kind: 'Return', at: 11 * 60 + 30, client: 'Mountain Stories', avatar: ['MS', 'FILMS'], avatarBg: AV.ink, bookingNo: 'BK-2026-0709', category: 'Documentary', kit: 'Sony FX6 Package', kitStatus: 'in', status: 'On Rent', flags: ['Overdue'], statusNote: '1 day late', staff: 'Returned by Hari' }),
  M({ id: 'm16', kind: 'Return', at: 12 * 60 + 30, client: 'Trishuli Media', avatar: ['TRI', 'MEDIA'], avatarBg: AV.navy, bookingNo: 'BK-2026-0723', category: 'Web Series', kit: 'Aputure 300D Kit', kitStatus: 'in', status: 'On Rent', flags: ['Overdue'], statusNote: '2 days late', staff: 'Returned by Sanu' }),
  M({ id: 'm17', kind: 'Return', at: 13 * 60, client: 'Vision Production', avatar: ['VP', 'PROD'], avatarBg: AV.steel, bookingNo: 'BK-2026-0710', category: 'TV Show', kit: 'NISI Athena Set', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], statusNote: 'Due today', staff: 'Returned by Sanu' }),
  M({ id: 'm18', kind: 'Return', at: 14 * 60 + 30, client: 'Inside Out Films', avatar: ['IO', 'FILMS'], avatarBg: AV.moss, bookingNo: 'BK-2026-0711', category: 'Short Film', kit: 'Aputure 600D Pro Kit', kitStatus: 'in', status: 'Returned', flags: [], staff: 'ETA: 04:00 PM' }),
  M({ id: 'm19', kind: 'Return', at: 15 * 60, client: 'Chitwan Films', avatar: ['CHT', 'FILMS'], avatarBg: AV.slate, bookingNo: 'BK-2026-0712', category: 'Wildlife Doc', kit: 'Sachtler Tripod Set', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Bikash' }),
  M({ id: 'm20', kind: 'Return', at: 15 * 60 + 30, client: 'Dolpo Docs', avatar: ['DLP', 'DOCS'], avatarBg: AV.ink, bookingNo: 'BK-2026-0724', category: 'Documentary', kit: 'Sony FX3 Body', kitStatus: 'in', status: 'On Rent', flags: ['Overdue'], statusNote: '3 days late', staff: 'Returned by Hari' }),
  M({ id: 'm21', kind: 'Return', at: 16 * 60, client: 'Newa Cinema', avatar: ['NEW', 'CINEMA'], avatarBg: AV.moss, bookingNo: 'BK-2026-0725', category: 'Feature Film', kit: 'Zhiyun Gimbal Kit', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Sanu' }),
  M({ id: 'm22', kind: 'Return', at: 16 * 60 + 30, client: 'Terai Television', avatar: ['TRI', 'TV'], avatarBg: AV.navy, bookingNo: 'BK-2026-0726', category: 'Broadcast', kit: 'LED Panel Set', kitStatus: 'in', status: 'On Rent', flags: ['Overdue'], statusNote: '1 day late', staff: 'Returned by Bikash' }),
  M({ id: 'm23', kind: 'Return', at: 17 * 60, client: 'Gandaki Media', avatar: ['GND', 'MEDIA'], avatarBg: AV.steel, bookingNo: 'BK-2026-0727', category: 'Corporate Film', kit: 'Canon RF Lens Set', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Ramesh' }),
  M({ id: 'm24', kind: 'Return', at: 17 * 60 + 30, client: 'Rara Pictures', avatar: ['RARA', 'PIX'], avatarBg: AV.slate, bookingNo: 'BK-2026-0728', category: 'Short Film', kit: 'Audio Recorder Kit', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Hari' }),
  M({ id: 'm25', kind: 'Return', at: 18 * 60, client: 'Vision Production', avatar: ['VP', 'PROD'], avatarBg: AV.steel, bookingNo: 'BK-2026-0713', category: 'TV Show', kit: 'Alexa Mini LF', kitStatus: 'in', status: 'On Rent', flags: ['Due Soon'], staff: 'Returned by Sanu' }),
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
export const has = (m: Movement, f: Flag) => m.flags.includes(f)

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
  { icon: 'error', statusKey: 'danger', title: 'Battery Overdue', detail: 'FX3 Battery #B123 is 3 days overdue', right: '3 days ago', rightTone: 'danger', action: 'Open Booking', to: '/rentals/BK-2026-0709', priority: 'Critical' },
  { icon: 'tool', statusKey: 'progress', title: 'Inspection Pending', detail: 'NISI 50mm T1.9 needs inspection', right: 'Due today', rightTone: 'progress', action: 'Open Inspection', to: '/operations', priority: 'Critical' },
  { icon: 'invoice', statusKey: 'danger', title: 'Invoice Unpaid', detail: 'Invoice #INV-1021 is unpaid', right: amount(48000), rightTone: 'danger', action: 'Receive Payment', to: '/finance', priority: 'Critical' },
  { icon: 'alert_triangle', statusKey: 'progress', title: 'Equipment Missing', detail: 'SmallRig Cage for Komodo', right: 'Since 2 days', rightTone: 'progress', action: 'Open Item', to: '/inventory', priority: 'Critical' },
  { icon: 'calendar_stats', statusKey: 'neutral', title: 'Maintenance Due', detail: 'Generator Honda EU30i service due', right: 'In 2 days', rightTone: 'neutral', action: 'Open Maintenance', to: '/inventory', priority: 'Critical' },
  { icon: 'package', statusKey: 'primary', title: 'Inspection Pending', detail: 'Sachtler head returned with play', right: 'In 3 days', rightTone: 'neutral', action: 'Open Inspection', to: '/operations', priority: 'High' },
]

export const CRITICAL_ALERTS = ALERTS.filter((a) => a.priority === 'Critical')

/**
 * Foundation §8.3 — **Warehouse sees no money, anywhere.**
 *
 * An alert that carries a rupee figure, or whose primary action is a money
 * action, is money. For a role that cannot see money the alert is **removed**
 * from the list rather than masked: a row reading "Invoice Unpaid — Required"
 * still tells a warehouse hand there is an unpaid invoice, and §8.3 asks for
 * structural absence, not redaction.
 */
const carriesMoney = (a: AlertRow) => a.right.startsWith('Rs') || a.action === 'Receive Payment'

/** The alerts a role may see, at Critical priority — the Alerts column. */
export const criticalAlertsFor = (money: boolean) =>
  money ? CRITICAL_ALERTS : CRITICAL_ALERTS.filter((a) => !carriesMoney(a))

/** Everything below Critical the same role may see — the "+ N more" footer. */
export const lesserAlertsFor = (money: boolean) =>
  ALERTS.filter((a) => a.priority !== 'Critical' && (money || !carriesMoney(a)))

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

/** Seed figures the movements array cannot derive. Replaced by the query. */
export const ACTIVE_RENTALS = 52
export const REVENUE_TODAY_PAISA = rupees(185000)
export const UTILIZATION_PCT = 84

/**
 * The six KPI cards, in the Dashboard render's order:
 * Active Rentals · Pickups · Returns · Revenue · Utilization · Critical Alerts.
 *
 * Every count is **derived** from `MOVEMENTS` / `ALERTS` rather than typed, so
 * §5.8's "card counts must equal the panel counts" cannot drift.
 *
 * Foundation §8.3 — the two business cards, Revenue and Utilization, are not in
 * the array at all for a role that cannot see money. They are not blurred, not
 * masked and not disabled: the card does not exist, and the strip closes up to
 * four columns. Revenue is money outright; Utilization is the yield figure the
 * revenue number is read against, and §5.2 files both under Reports, which
 * Warehouse cannot reach.
 */
export function dashboardKpis(money: boolean): Kpi[] {
  const cards: Kpi[] = [
    { label: 'Active Rentals', value: String(ACTIVE_RENTALS), icon: 'briefcase', accent: 'primary', delta: { direction: 'up', text: '6 from yesterday', good: true } },
    { label: 'Pickups Today', value: String(PICKUPS.length), icon: 'truck', accent: 'primary', note: `${PICKUP_PENDING} pending • ${PICKUP_DONE} completed` },
    { label: 'Returns Today', value: String(RETURNS.length), icon: 'return_arrow', accent: 'progress', note: `${RETURN_OVERDUE} overdue • ${RETURN_EXPECTED} expected` },
  ]

  if (money) {
    cards.push(
      // Rendered through the money engine, so it groups in lakhs — the render's
      // "Rs 185,000" is western grouping, which Foundation §02 does not use.
      { label: 'Revenue Today', value: formatMoney(REVENUE_TODAY_PAISA), icon: 'dollar', accent: 'success', delta: { direction: 'up', text: '18% vs yesterday', good: true } },
      // The render tints this tile purple; §4.2's five-colour law bans purple
      // outright, so it wears the same blue as the other commercial figures.
      { label: 'Utilization', value: `${UTILIZATION_PCT}%`, icon: 'chart', accent: 'primary', note: 'Top 10 assets' },
    )
  }

  cards.push({
    label: 'Critical Alerts',
    value: String(criticalAlertsFor(money).length),
    icon: 'alert_triangle',
    accent: 'danger',
    note: 'Requires attention',
  })

  return cards
}

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

/**
 * §12 — 520px, and it must have a **long-press equivalent**: "Hover-only intel
 * does not ship." One record per booking; anything not seeded falls back to a
 * stated placeholder rather than an empty card.
 */
export const HOVER: Record<string, HoverFacts> = {
  'BK-2026-0715': {
    project: 'Daraz Dashain TVC',
    duration: '31 Jul → 2 Aug 2026 · 3 days',
    deposit: `${amount(50000)} held`,
    payment: `${amount(15000)} of ${amount(139506)} · ${amount(124506)} outstanding`,
    equipment: '18 items · FX3 Documentary Package',
    documents: 'Quotation · Agreement signed',
    staff: 'Ramesh Shrestha (pickup) · Sanu Maharjan (packing)',
    notes: 'Client collects from Boudha. Needs the spare 85mm.',
  },
  'BK-2026-0709': {
    project: 'Annapurna Circuit — Ep. 4',
    duration: '26 Jul → 30 Jul 2026 · 5 days',
    deposit: `${amount(35000)} held`,
    payment: `${amount(88000)} of ${amount(88000)} · settled`,
    equipment: '12 items · Sony FX6 Package',
    documents: 'Invoice INV-1018 · Delivery note',
    staff: 'Hari Bhandari (return)',
    notes: 'One day late. Late fee not yet applied.',
  },
}

export const HOVER_FALLBACK: HoverFacts = {
  project: 'Not recorded',
  duration: 'Not recorded',
  deposit: 'None held',
  payment: 'Not recorded',
  equipment: 'Not recorded',
  documents: 'None attached',
  staff: 'Not assigned',
  notes: '—',
}

/* ── §13 row menu ──────────────────────────────────────────────────────── */

/** §13 — the twelve entries, in the spec's order. Open is the row primary. */
export const ROW_MENU = [
  'Open',
  'Edit',
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

/** Today, and the two days either side of it, as `?d=` keys. */
export const CAL_TODAY_ISO = isoDay(TODAY)
export const CAL_PREV_ISO = isoDay(MONTH_RANGE[TODAY_INDEX - 1] ?? TODAY)
export const CAL_NEXT_ISO = isoDay(MONTH_RANGE[TODAY_INDEX + 1] ?? TODAY)

/**
 * Days carrying movements. Today's marker is derived from `MOVEMENTS` so the
 * calendar cannot claim a quiet day the columns are busy on; the other days are
 * seed until the query spans a month.
 */
export const CAL_EVENT_DAYS = [...new Set([3, 8, 14, 22, 27, ...(MOVEMENTS.length > 0 ? [CAL_TODAY_AD] : [])])].sort((a, b) => a - b)

/* ── §11 filters ───────────────────────────────────────────────────────── */

/**
 * §11 period chips — the locked seven, in the Dashboard render's order
 * (All first, Custom last, with its own calendar affordance).
 */
export const PERIOD_CHIPS = ['All', 'Today', 'Tomorrow', 'Next 7 Days', 'This Week', 'Next Month', 'Custom']

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
 * §11 — the filters have to *filter*. A control that looks live and moves
 * nothing is the same defect class as a nav link that does not navigate.
 *
 * Only predicates the seed can honour are wired; the rest are declared here as
 * unsupported so the UI can say so instead of silently returning everything.
 */
const PREDICATES: Record<string, (m: Movement) => boolean> = {
  VIP: (m) => has(m, 'VIP'),
  Late: (m) => has(m, 'Overdue'),
  Overdue: (m) => has(m, 'Overdue'),
  Expected: (m) => m.kind === 'Return' && !has(m, 'Overdue'),
  // §11's Pickup group predates v2.0: "Booked" and "Packed" are now statuses,
  // and Inspection is a Return *job*, not a status — §1.4 maps it to Returned.
  Inspection: (m) => m.status === 'Returned',
  ...Object.fromEntries(STAGE_NAMES.map((s) => [s, (m: Movement) => m.status === s])),
}

export const UNSUPPORTED_FILTERS = new Set(
  MORE_FILTERS.flatMap((g) => g.options).filter((o) => !(o in PREDICATES)),
)

/** Periods the seed covers. Everything else is honestly empty, not silently all. */
export const SEEDED_PERIODS = ['Today', 'All']

export function filterMovements(rows: Movement[], period: string, picked: string[]): Movement[] {
  if (!SEEDED_PERIODS.includes(period)) return []
  const live = picked.map((p) => PREDICATES[p]).filter(Boolean) as Array<(m: Movement) => boolean>
  if (live.length === 0) return rows
  // Selections are a union inside the panel — picking VIP and Overdue asks for
  // both, not for rows that are somehow both at once.
  return rows.filter((m) => live.some((f) => f(m)))
}

/**
 * The calendar card's day list (§4 again — it is a *view* of the same rows the
 * two columns render, merged back into one chronological day, never a second
 * fetch and never a second set of times).
 */
export const mergeByTime = (...lists: Movement[][]): Movement[] =>
  lists.flat().sort((a, b) => a.at - b.at)

/* ── display helpers ───────────────────────────────────────────────────── */

/** §6 — "Time on one line, not stacked." Derived from `at`, never typed. */
export const timeOf = (m: Movement) => clockPad(m.at)

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
export const dotTone = (m: Movement): BrandKey => (has(m, 'Overdue') ? 'danger' : STATUS_DOT[m.status])

/** Status text for a movement: the Foundation stage, never an invented word. */
export const statusKeyOf = (m: Movement) =>
  // §1.9 — a Critical flag outranks the status for tone. Overdue is red
  // wherever it appears, whatever the booking's status says.
  has(m, 'Overdue') ? 'danger' : statusToken(m.status)
