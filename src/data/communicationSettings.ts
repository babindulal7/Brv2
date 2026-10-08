import type { IconName } from '../components/ui/Icon'
import type { Slice } from '../components/ui/Charts'
import type { StatusKey } from '../lib/status'
import { grouped } from '../lib/money'
import { CLIENTS_DATA } from './clients'

/**
 * **Communication Settings** seed —
 * `03 Core Modules/Settings/Communication Settings.md` v3.0 (Build Locked),
 * read against `Communication Settings.PNG`.
 *
 * One primitive — `QUEUE` — produces every count, rate, donut, KPI and rail row
 * on the page. The render states its own figures four times and disagrees with
 * itself three of them:
 *
 *  · its donut reads `Failed 0.3%` while its rail reads `Failed 207 (1.6%)`.
 *    207 of 12,842 is 1.6%; the donut is the wrong one.
 *  · its `Delivery Success Rate` KPI and its analytics tile both read 98.6%
 *    while the same rail computes 98.4% from the same two numbers.
 *  · its rail reads `Open Rate 42.7%` while its queue reads `Read 5,642` of
 *    `Delivered 12,635` — which is 44.7%.
 *
 * Deriving all of them from `QUEUE` makes that class of drift unrepresentable.
 *
 * **Deviations from the render — locked rules, never copy these back:**
 *  · the render carries the old 16-item **numbered** sidebar. Foundation §5.1
 *    locks 8 unnumbered sections + Settings and the shell owns it.
 *  · the render's `New Message` button, its Email channel tile and one slice of
 *    its Channel Usage donut are **violet**. §4.2 bans violet outright; the
 *    donut takes the validated categorical palette from `components/ui/Charts`
 *    and the button takes the blue primary.
 *  · the render's template category and activity feed say **Customer** /
 *    "Email sent to 15 customers". The word is banned in UI text — they are
 *    **clients**.
 *  · the render's IDs read `#BR-2087` and `#MN-102`. `BR-` is the *branch*
 *    prefix and belongs to nothing else (§7 ID registry). Since the 12 Aug
 *    ruling bookings are `B-N` and invoices are `INV-N` — no year, no padding,
 *    and no branch segment on the invoice. Maintenance is unruled and stays
 *    `MT-YYYY-NNNN`. The authority is `data/numbering.ts`, never this comment.
 *    Recipients and booking numbers below are read out of `data/clients`, so
 *    this screen cannot address a client who does not exist.
 *  · the render draws a sparkline under each analytics tile. No daily series
 *    exists in this build and one would have to be invented, so the tiles state
 *    the rate and what it is a rate *of* instead.
 *
 * No figure on this screen is money, so §8.3 has nothing to omit here.
 *
 * NOT wired to Supabase.
 */

/* ── where a control goes ──────────────────────────────────────────────── */

export type Dest = { kind: 'route'; to: string } | { kind: 'none'; why: string }

export const TO = (to: string): Dest => ({ kind: 'route', to })
export const NO = (why: string): Dest => ({ kind: 'none', why })

/* ── channels ──────────────────────────────────────────────────────────── */

export type Channel = 'email' | 'sms' | 'whatsapp' | 'push' | 'inapp'

export const CHANNEL_ORDER: Channel[] = ['email', 'sms', 'whatsapp', 'push', 'inapp']

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  push: 'Push',
  inapp: 'In-App',
}

/**
 * Every glyph is a real key in `components/ui/Icon`'s registry — an unregistered
 * name does not compile. The registry has no chat/message glyph, so WhatsApp
 * Business borrows `headset`, the two-way-conversation icon. TODO(decision):
 * add a `message` glyph to the registry and move it there.
 */
export const CHANNEL_ICON: Record<Channel, IconName> = {
  email: 'mail',
  sms: 'phone',
  whatsapp: 'headset',
  push: 'bell',
  inapp: 'activity',
}

export type ChannelState = 'Connected' | 'Enabled' | 'Testing' | 'Disconnected' | 'Error'

export const CHANNEL_STATE_TONE: Record<ChannelState, StatusKey> = {
  Connected: 'in',
  Enabled: 'in',
  Testing: 'progress',
  Disconnected: 'neutral',
  Error: 'danger',
}

export const CHANNEL_STATE_ICON: Record<ChannelState, IconName> = {
  Connected: 'check',
  Enabled: 'check',
  Testing: 'timer',
  Disconnected: 'dot',
  Error: 'alert_triangle',
}

export interface ChannelCard {
  key: Channel
  label: string
  icon: IconName
  state: ChannelState
  /** What is carrying it — SMTP, the gateways, the Cloud API. */
  transport: string
  /** The one figure the render prints under each tile. */
  meta: string
  dest: Dest
}

export const CHANNELS: ChannelCard[] = [
  {
    key: 'email',
    label: 'Email',
    icon: CHANNEL_ICON.email,
    state: 'Connected',
    transport: 'SMTP',
    meta: 'Transactional + document delivery',
    dest: TO('/notifications'),
  },
  {
    key: 'sms',
    label: 'SMS',
    icon: CHANNEL_ICON.sms,
    state: 'Connected',
    transport: 'Sparrow SMS · Ncell A2P',
    meta: '2 providers',
    dest: TO('/notifications/sms'),
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp Business',
    icon: CHANNEL_ICON.whatsapp,
    state: 'Disconnected',
    transport: 'WhatsApp Cloud API',
    meta: 'No verified business number is provisioned',
    dest: NO('No WhatsApp Business number is provisioned in this build, so there is nothing to configure yet.'),
  },
  {
    key: 'push',
    label: 'Push Notifications',
    icon: CHANNEL_ICON.push,
    state: 'Disconnected',
    transport: 'Web Push',
    meta: 'No service-worker key is registered',
    dest: NO('Push requires a registered service-worker key, which is not provisioned in this build.'),
  },
  {
    key: 'inapp',
    label: 'In-App Notifications',
    icon: CHANNEL_ICON.inapp,
    state: 'Enabled',
    transport: 'Notification Center · Inbox',
    meta: 'Banner, toast and activity feed',
    dest: TO('/notifications'),
  },
]

/* ── the queue — the one primitive ─────────────────────────────────────── */

export type QueueState = 'Pending' | 'Processing' | 'Sent' | 'Delivered' | 'Read' | 'Failed'

/**
 * Counts for the reporting month. `Read` and `Clicked` are **subsets of
 * Delivered**, not separate states, which is exactly the distinction the
 * render's own donut loses.
 */
export const QUEUE = {
  pending: 34,
  processing: 12,
  sent: 156,
  delivered: 12_635,
  failed: 207,
  read: 5_642,
  clicked: 2_312,
} as const

/** Still moving — neither delivered nor failed. */
export const IN_FLIGHT = QUEUE.pending + QUEUE.processing + QUEUE.sent

/** Everything the engine has handled this month. */
export const TOTAL_HANDLED = IN_FLIGHT + QUEUE.delivered + QUEUE.failed

/** Everything that has reached an outcome. */
export const RESOLVED = QUEUE.delivered + QUEUE.failed

export function pct(part: number, whole: number): string {
  if (whole === 0) return '—'
  return `${((part / whole) * 100).toFixed(1)}%`
}

export const DELIVERY_RATE = pct(QUEUE.delivered, RESOLVED)
export const FAILED_RATE = pct(QUEUE.failed, RESOLVED)
export const READ_RATE = pct(QUEUE.read, QUEUE.delivered)
export const CLICK_RATE = pct(QUEUE.clicked, QUEUE.delivered)

export interface QueueRow {
  state: QueueState
  count: number
  tone: StatusKey
  note: string
}

export const QUEUE_ROWS: QueueRow[] = [
  { state: 'Pending', count: QUEUE.pending, tone: 'neutral', note: 'Waiting for a send window' },
  { state: 'Processing', count: QUEUE.processing, tone: 'progress', note: 'Handed to a transport' },
  { state: 'Sent', count: QUEUE.sent, tone: 'primary', note: 'Accepted, awaiting receipt' },
  { state: 'Delivered', count: QUEUE.delivered, tone: 'in', note: 'Receipt confirmed' },
  { state: 'Read', count: QUEUE.read, tone: 'in', note: `Subset of Delivered · ${READ_RATE}` },
  { state: 'Failed', count: QUEUE.failed, tone: 'danger', note: 'Bounced or rejected' },
]

/** The Delivery Overview donut — three disjoint outcomes that sum to the total. */
export const DELIVERY_SLICES: Slice[] = [
  {
    label: 'Delivered',
    value: QUEUE.delivered,
    display: grouped(QUEUE.delivered),
    percent: pct(QUEUE.delivered, TOTAL_HANDLED),
  },
  { label: 'In flight', value: IN_FLIGHT, display: grouped(IN_FLIGHT), percent: pct(IN_FLIGHT, TOTAL_HANDLED) },
  { label: 'Failed', value: QUEUE.failed, display: grouped(QUEUE.failed), percent: pct(QUEUE.failed, TOTAL_HANDLED) },
]

/* ── channel mix ───────────────────────────────────────────────────────── */

/** Messages per channel this month. Asserted to partition `TOTAL_HANDLED`. */
export const CHANNEL_VOLUME: Record<Channel, number> = {
  email: 6_261,
  sms: 2_870,
  whatsapp: 2_348,
  push: 913,
  inapp: 652,
}

export const CHANNEL_SLICES: Slice[] = CHANNEL_ORDER.map((c) => ({
  label: CHANNEL_LABEL[c],
  value: CHANNEL_VOLUME[c],
  display: grouped(CHANNEL_VOLUME[c]),
  percent: pct(CHANNEL_VOLUME[c], TOTAL_HANDLED),
}))

/* ── today ─────────────────────────────────────────────────────────────── */

export interface TodayCount {
  channel: Channel
  sent: number
  /** Percent change against yesterday, as the render prints it. */
  deltaPercent: number
}

export const TODAY_SENT: TodayCount[] = [
  { channel: 'email', sent: 156, deltaPercent: 18 },
  { channel: 'sms', sent: 242, deltaPercent: 11 },
  { channel: 'whatsapp', sent: 98, deltaPercent: 25 },
  { channel: 'push', sent: 64, deltaPercent: 7 },
]

export const FAILED_TODAY = { count: 7, deltaPercent: -30 }

/* ── templates ─────────────────────────────────────────────────────────── */

export type TemplateCategory = 'Rentals' | 'Finance' | 'Operations' | 'Clients' | 'Staff'

export const TEMPLATE_CATEGORIES: TemplateCategory[] = ['Rentals', 'Finance', 'Operations', 'Clients', 'Staff']

export interface Template {
  id: string
  name: string
  category: TemplateCategory
  channels: Channel[]
  /**
   * Sends this month. `null` where nobody supplied one — the render measures 8
   * of these and invents nothing for the rest, and neither does this file.
   */
  usage: number | null
  active: boolean
}

/**
 * The library the spec enumerates — 7 Rentals, 6 Finance, 6 Operations,
 * 6 Clients, 5 Staff. The render's tab counts (72 across 8 visible rows) do not
 * describe any list it shows; these 30 are the templates the spec actually
 * names, and every tab count is derived from them.
 */
export const TEMPLATES: Template[] = [
  { id: 'tpl-01', name: 'Booking Confirmation', category: 'Rentals', channels: ['email', 'sms', 'whatsapp'], usage: 1245, active: true },
  { id: 'tpl-02', name: 'Booking Approved', category: 'Rentals', channels: ['email', 'inapp'], usage: null, active: true },
  { id: 'tpl-03', name: 'Booking Cancelled', category: 'Rentals', channels: ['email', 'sms'], usage: null, active: true },
  { id: 'tpl-04', name: 'Pickup Reminder', category: 'Rentals', channels: ['sms', 'whatsapp'], usage: 864, active: true },
  { id: 'tpl-05', name: 'Return Reminder', category: 'Rentals', channels: ['email', 'sms', 'whatsapp'], usage: 756, active: true },
  { id: 'tpl-06', name: 'Extension Approved', category: 'Rentals', channels: ['email', 'inapp'], usage: null, active: true },
  { id: 'tpl-07', name: 'Booking Completed', category: 'Rentals', channels: ['email'], usage: null, active: true },

  { id: 'tpl-08', name: 'Invoice Issued', category: 'Finance', channels: ['email'], usage: 912, active: true },
  { id: 'tpl-09', name: 'Payment Received', category: 'Finance', channels: ['email', 'sms'], usage: null, active: true },
  { id: 'tpl-10', name: 'Payment Reminder', category: 'Finance', channels: ['sms', 'whatsapp'], usage: 1103, active: true },
  { id: 'tpl-11', name: 'Deposit Received', category: 'Finance', channels: ['email'], usage: null, active: true },
  { id: 'tpl-12', name: 'Deposit Refund', category: 'Finance', channels: ['email', 'sms'], usage: null, active: true },
  { id: 'tpl-13', name: 'Outstanding Reminder', category: 'Finance', channels: ['email', 'sms'], usage: null, active: true },

  { id: 'tpl-14', name: 'Maintenance Due', category: 'Operations', channels: ['email', 'inapp'], usage: 298, active: true },
  { id: 'tpl-15', name: 'Damage Report', category: 'Operations', channels: ['email', 'inapp'], usage: null, active: true },
  { id: 'tpl-16', name: 'Missing Equipment', category: 'Operations', channels: ['email', 'inapp'], usage: null, active: true },
  { id: 'tpl-17', name: 'Case Assigned', category: 'Operations', channels: ['inapp', 'push'], usage: null, active: true },
  { id: 'tpl-18', name: 'Case Closed', category: 'Operations', channels: ['email', 'inapp'], usage: null, active: true },
  { id: 'tpl-19', name: 'Equipment Ready', category: 'Operations', channels: ['sms', 'inapp'], usage: null, active: true },

  { id: 'tpl-20', name: 'Welcome Message', category: 'Clients', channels: ['email', 'whatsapp'], usage: 432, active: true },
  { id: 'tpl-21', name: 'Membership Renewal', category: 'Clients', channels: ['email', 'sms'], usage: 187, active: true },
  { id: 'tpl-22', name: 'Birthday Greeting', category: 'Clients', channels: ['sms'], usage: null, active: false },
  { id: 'tpl-23', name: 'Coupon', category: 'Clients', channels: ['email', 'sms'], usage: null, active: false },
  { id: 'tpl-24', name: 'Promotion', category: 'Clients', channels: ['email', 'whatsapp'], usage: null, active: false },
  { id: 'tpl-25', name: 'Feedback Request', category: 'Clients', channels: ['email'], usage: null, active: true },

  { id: 'tpl-26', name: 'Shift Reminder', category: 'Staff', channels: ['sms', 'inapp'], usage: null, active: true },
  { id: 'tpl-27', name: 'Attendance Reminder', category: 'Staff', channels: ['inapp'], usage: null, active: true },
  { id: 'tpl-28', name: 'Task Assignment', category: 'Staff', channels: ['inapp', 'push'], usage: null, active: true },
  { id: 'tpl-29', name: 'Approval Request', category: 'Staff', channels: ['email', 'inapp'], usage: null, active: true },
  { id: 'tpl-30', name: 'Internal Announcement', category: 'Staff', channels: ['email', 'inapp'], usage: null, active: true },
]

export const MEASURED_TEMPLATES = TEMPLATES.filter((t) => t.usage !== null).length

export function templateCount(category: TemplateCategory | 'All'): number {
  return category === 'All' ? TEMPLATES.length : TEMPLATES.filter((t) => t.category === category).length
}

/** The variables the spec locks. Rendered as chips, never as free text. */
export const VARIABLES = [
  '{{ClientName}}',
  '{{BookingNumber}}',
  '{{InvoiceNumber}}',
  '{{EquipmentList}}',
  '{{PickupDateBS}}',
  '{{PickupDateAD}}',
  '{{ReturnDateBS}}',
  '{{ReturnDateAD}}',
  '{{OutstandingAmount}}',
  '{{BranchName}}',
  '{{StaffName}}',
  '{{CompanyName}}',
]

/* ── automation ────────────────────────────────────────────────────────── */

export type TriggerKind = 'Before Event' | 'After Event' | 'Scheduled' | 'Status Change' | 'Recurring'

export interface AutomationRule {
  id: string
  name: string
  trigger: TriggerKind
  /** The template it fires. Asserted to exist in `TEMPLATES`. */
  template: string
  channels: Channel[]
  active: boolean
}

export const AUTOMATION_RULES: AutomationRule[] = [
  { id: 'au-1', name: '24 hours before pickup', trigger: 'Before Event', template: 'Pickup Reminder', channels: ['sms', 'whatsapp'], active: true },
  { id: 'au-2', name: '2 hours before return', trigger: 'Before Event', template: 'Return Reminder', channels: ['email', 'sms'], active: true },
  { id: 'au-3', name: 'Payment overdue (3 days)', trigger: 'After Event', template: 'Payment Reminder', channels: ['sms', 'whatsapp'], active: true },
  { id: 'au-4', name: 'Membership expiring (7 days)', trigger: 'Scheduled', template: 'Membership Renewal', channels: ['email', 'sms'], active: true },
  { id: 'au-5', name: 'Maintenance scheduled', trigger: 'Status Change', template: 'Maintenance Due', channels: ['email', 'inapp'], active: true },
]

/* ── timeline ──────────────────────────────────────────────────────────── */

export type DeliveryState = 'Delivered' | 'Read' | 'Failed' | 'Queued'

export const DELIVERY_TONE: Record<DeliveryState, StatusKey> = {
  Delivered: 'in',
  Read: 'primary',
  Failed: 'danger',
  Queued: 'neutral',
}

export const DELIVERY_ICON: Record<DeliveryState, IconName> = {
  Delivered: 'check',
  Read: 'eye',
  Failed: 'alert_triangle',
  Queued: 'timer',
}

export interface TimelineRow {
  id: string
  channel: Channel
  /** The client's own address, read out of `data/clients`. Never invented. */
  to: string
  who: string
  subject: string
  status: DeliveryState
  ago: string
  related: string
  dest: Dest
}

const client = (i: number) => CLIENTS_DATA[i]

/** A client's first live booking, or null when they have none. */
function firstBooking(i: number): string | null {
  return client(i)?.activeBookings[0] ?? null
}

function bookingDest(no: string | null): Dest {
  return no ? TO(`/rentals/${no}`) : NO('This client has no live booking to open.')
}

export const TIMELINE: TimelineRow[] = [
  {
    id: 'cm-1',
    channel: 'email',
    to: client(0)?.email ?? '—',
    who: client(0)?.name ?? '—',
    subject: `Booking confirmation ${firstBooking(0) ?? '—'}`,
    status: 'Delivered',
    ago: '5m ago',
    related: firstBooking(0) ?? 'No live booking',
    dest: bookingDest(firstBooking(0)),
  },
  {
    id: 'cm-2',
    channel: 'sms',
    to: client(2)?.phone ?? '—',
    who: client(2)?.name ?? '—',
    subject: 'Payment reminder — invoice INV-492',
    status: 'Delivered',
    ago: '15m ago',
    related: 'INV-492',
    dest: TO('/finance/documents'),
  },
  {
    id: 'cm-3',
    channel: 'whatsapp',
    to: client(3)?.phone ?? '—',
    who: client(3)?.name ?? '—',
    subject: 'Return reminder — equipment due back tomorrow',
    status: 'Read',
    ago: '30m ago',
    related: firstBooking(3) ?? 'No live booking',
    dest: bookingDest(firstBooking(3)),
  },
  {
    id: 'cm-4',
    channel: 'email',
    to: client(4)?.email ?? '—',
    who: client(4)?.name ?? '—',
    subject: 'Invoice INV-492 has been issued',
    status: 'Delivered',
    ago: '1h ago',
    related: 'INV-492',
    dest: TO('/finance/documents'),
  },
  {
    id: 'cm-5',
    channel: 'inapp',
    to: 'Notification Center · Owner',
    who: 'Ramesh Dulal',
    subject: 'Maintenance MT-2026-00054 scheduled',
    status: 'Read',
    ago: '2h ago',
    related: 'MT-2026-00054',
    dest: TO('/operations'),
  },
]

/* ── rail ──────────────────────────────────────────────────────────────── */

export interface Alert {
  id: string
  text: string
  meta: string
  tone: StatusKey
  icon: IconName
  dest: Dest
}

export const ALERTS: Alert[] = [
  {
    id: 'al-failed',
    text: 'Failed messages this month',
    meta: `${grouped(QUEUE.failed)} · ${FAILED_RATE}`,
    tone: 'danger',
    icon: 'alert_triangle',
    dest: TO('/notifications/sms'),
  },
  {
    id: 'al-whatsapp',
    text: 'WhatsApp Business is not provisioned',
    meta: 'Blocking',
    tone: 'danger',
    icon: 'headset',
    dest: NO('No WhatsApp Business number is provisioned in this build.'),
  },
  {
    id: 'al-push',
    text: 'Push has no service-worker key',
    meta: 'Blocking',
    tone: 'danger',
    icon: 'bell',
    dest: NO('Push requires a registered service-worker key, which is not provisioned in this build.'),
  },
  {
    id: 'al-queue',
    text: 'Messages still in flight',
    meta: `${IN_FLIGHT} · ${pct(IN_FLIGHT, TOTAL_HANDLED)}`,
    tone: 'progress',
    icon: 'timer',
    dest: TO('/notifications'),
  },
  {
    id: 'al-inactive',
    text: 'Templates switched off',
    meta: `${TEMPLATES.filter((t) => !t.active).length} of ${TEMPLATES.length}`,
    tone: 'neutral',
    icon: 'file',
    dest: NO('Switching a template on or off is a write, and no backend is connected in this build.'),
  },
]

export interface Activity {
  what: string
  detail: string
  tone: StatusKey
  icon: IconName
  ago: string
}

export const ACTIVITY: Activity[] = [
  { what: 'Template updated', detail: 'Pickup Reminder — SMS body shortened to one segment', tone: 'primary', icon: 'file', ago: '2m ago' },
  { what: 'Email sent', detail: `${CLIENTS_DATA.length} clients on the monthly statement run`, tone: 'in', icon: 'mail', ago: '5m ago' },
  { what: 'SMS failed', detail: `${client(2)?.phone ?? '—'} — handset unreachable`, tone: 'danger', icon: 'phone', ago: '12m ago' },
  { what: 'Automation executed', detail: '2 hours before return — 14 recipients', tone: 'primary', icon: 'automation', ago: '15m ago' },
  { what: 'Channel checked', detail: 'SMTP responded in 240 ms', tone: 'in', icon: 'plug', ago: '1h ago' },
]

export interface Insight {
  text: string
  icon: IconName
  tone: StatusKey
}

/** Ranked by volume, so the top-two claim is read off the data, never asserted. */
const BY_VOLUME = [...CHANNEL_ORDER].sort((a, b) => CHANNEL_VOLUME[b] - CHANNEL_VOLUME[a])

/** Rules that name a channel with no transport behind it. */
export const STRANDED_RULES = AUTOMATION_RULES.filter((r) =>
  r.channels.some((c) => CHANNELS.find((ch) => ch.key === c)?.state === 'Disconnected'),
)

/** Every line states something these counts can prove. Nothing here forecasts. */
export const INSIGHTS: Insight[] = [
  {
    text: `${CHANNEL_LABEL[BY_VOLUME[0] ?? 'email']} carries ${pct(CHANNEL_VOLUME[BY_VOLUME[0] ?? 'email'], TOTAL_HANDLED)} of all traffic; ${CHANNEL_LABEL[BY_VOLUME[1] ?? 'sms']} is next at ${pct(CHANNEL_VOLUME[BY_VOLUME[1] ?? 'sms'], TOTAL_HANDLED)}.`,
    icon: 'mail',
    tone: 'primary',
  },
  {
    text: `${READ_RATE} of delivered messages are read and ${CLICK_RATE} clicked. The gap is where a shorter subject line pays.`,
    icon: 'eye',
    tone: 'progress',
  },
  {
    text: `${MEASURED_TEMPLATES} of ${TEMPLATES.length} templates carry a send count. The rest have never been measured in this build.`,
    icon: 'file',
    tone: 'neutral',
  },
  {
    text: `${CHANNELS.filter((c) => c.state === 'Disconnected').length} channels are unprovisioned, which leaves ${STRANDED_RULES.length} automation rules naming a channel with no transport behind it.`,
    icon: 'plug',
    tone: 'danger',
  },
]

export interface QuickAction {
  label: string
  icon: IconName
  dest: Dest
}

/**
 * The spec locks exactly four. Three need a live transport and say so; the
 * fourth — Export Logs — is a real download and is wired in the screen itself,
 * because it runs in the page rather than navigating anywhere.
 */
export const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Send Test Email', icon: 'mail', dest: NO('A test send needs a live SMTP transport. None is connected in this build.') },
  { label: 'Send Test SMS', icon: 'phone', dest: NO('A test send needs a live SMS gateway. None is connected in this build.') },
  {
    label: 'Send Test WhatsApp',
    icon: 'headset',
    dest: NO('No WhatsApp Business number is provisioned, so there is nothing to send a test through.'),
  },
]

/* ── seed invariants ───────────────────────────────────────────────────── */

/** Reported, never thrown — a module-scope throw blanks the app before React mounts. */
export const SEED_ERRORS: string[] = (() => {
  const errs: string[] = []

  const mix = CHANNEL_ORDER.reduce((s, c) => s + CHANNEL_VOLUME[c], 0)
  if (mix !== TOTAL_HANDLED) {
    errs.push(`Channel Usage sums to ${grouped(mix)}; the queue handled ${grouped(TOTAL_HANDLED)}.`)
  }

  if (QUEUE.read > QUEUE.delivered) errs.push('More messages were read than delivered.')
  if (QUEUE.clicked > QUEUE.read) errs.push('More messages were clicked than read.')

  const names = new Set(TEMPLATES.map((t) => t.name))
  for (const r of AUTOMATION_RULES) {
    if (!names.has(r.template)) errs.push(`Automation rule "${r.name}" fires a template that does not exist: "${r.template}".`)
  }

  const catTotal = TEMPLATE_CATEGORIES.reduce((s, c) => s + templateCount(c), 0)
  if (catTotal !== TEMPLATES.length) {
    errs.push(`Template tabs count ${catTotal} rows; the library holds ${TEMPLATES.length}.`)
  }

  for (const t of TEMPLATES) {
    if (t.channels.length === 0) errs.push(`Template "${t.name}" names no channel.`)
  }

  for (const row of TIMELINE) {
    if (row.to === '—') errs.push(`Timeline row ${row.id} has no recipient — data/clients did not supply one.`)
  }

  return errs
})()
