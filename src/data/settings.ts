import type { IconName } from '../components/ui/Icon'
import type { Slice } from '../components/ui/Charts'
import type { StatusKey } from '../lib/status'
import { rupees, formatMoney, roundHalfUp, grouped } from '../lib/money'
import type { Paisa } from '../lib/money'
import { APP_VERSION, BRANCH } from './nav'
import { WAREHOUSES } from './warehouse'
import type { Warehouse } from './warehouse'
import { PLANS } from './membership'
import { openCasesCount } from './cases'

/*
 * `FEE_PER_CREW_DAY_PAISA` used to be declared here too, at rupees(500), dead
 * but exported under the same name as `data/crew.ts:382`'s rupees(1000) — the
 * figure `PLAN.md:839` actually records. Rulings §9.11 ordered it deleted
 * before this file was split, because the split would otherwise have imported
 * the Rs 500 one **by name** and halved a billed rate. `data/crew.ts` is the
 * one definition; `lib/settingsStore.ts` derives the Financial section's
 * default from it and this file no longer has an opinion.
 */

/**
 * **Settings** seed — `03 Core Modules/Settings/Organization.md` and
 * `Branch Management.md` (both v3.0, Build Locked), read against
 * `Organization.PNG` and `Branch Management.PNG`.
 *
 * The two renders are one screen here. Foundation §5.1 deleted the sidebar's
 * `Administration` section, and both renders reach Branch Management through
 * it; with that door removed the only remaining way in is Settings, so
 * `Branch Management` is a **pane of Settings**, not a route of its own.
 *
 * Nothing aggregate is typed. Every KPI, share, donut slice, average and
 * growth figure on both panes is **derived from `BRANCHES` and
 * `EQUIPMENT_MIX`** below, the same move `data/expenseReports` makes. The
 * renders state Pokhara's utilisation twice and disagree with themselves (88%
 * on the card, 78% in the table and in Branch Performance) — a derived average
 * settles it: only 78 produces the rail's stated 86% mean. One source cannot
 * contradict itself.
 *
 * What the renders say and this file does not:
 *  · money is **integer paisa** through `lib/money`; no formatted money string
 *    is stored, and `Rs` never becomes `NPR`.
 *  · the render's activity row reads "role: Warehouse Staff". The business 8
 *    (ruled 8 Aug 2026) names it **Warehouse** — there is one role vocabulary.
 *  · the render's System Summary reads `v3.2.0`. The page reads its version
 *    from `nav.APP_VERSION` so it cannot state two versions of itself.
 *  · the render's Monthly Revenue tile claims +18.4% month over month, which is
 *    Head Office's own growth rather than the group's. The group figure is
 *    derived from the three branch growths instead (15.5%).
 *
 * NOT wired to Supabase.
 */

/* ── where a control goes ──────────────────────────────────────────────── */

/**
 * PLAN.md §0 — *no dead controls*. Every navigable item in this file declares
 * exactly one of: a real route, an in-page tab, or `none` **with the reason
 * stated**. There is no fourth case, so a `href="#"` cannot be written by
 * accident and an unbuilt destination has to say why it is unbuilt.
 */
export type Dest =
  | { kind: 'route'; to: string }
  | { kind: 'tab'; tab: TabKey }
  | { kind: 'none'; why: string }

/**
 * `11_SETTINGS.md` §11.2 — **the eight sections.** Automation, Channels /
 * Communication and AI are "removed and parked" in prose, so those two keys
 * (`communication`, `ai`) are gone rather than hidden.
 *
 * The surviving keys keep their old spelling on purpose: `?tab=organization`,
 * `?tab=financial`, `?tab=system`, `?tab=security` and `?tab=integrations` are
 * live deep links, and a rename would break every one of them for a label
 * change. The *labels* follow the spec; the *keys* are the URL contract.
 * A `?tab=ai` or `?tab=communication` link still resolves — `isTabKey` now
 * rejects it and the page falls back to Overview rather than 404ing (Law 3).
 */
export type TabKey =
  | 'business'
  | 'people'
  | 'branches'
  | 'system'

export interface TabDef {
  key: TabKey
  label: string
  /** Money end to end. Omitted outright for a money-blind session (§8.3). */
  money: boolean
}

/**
 * §11.2's table, in its order and with its wording — including the British
 * "Organisation" and "Apps & API" for what the code calls `integrations`.
 *
 * **Branches & Warehouses** is the new home for Warehouse Management
 * (`07_INVENTORY.md` line 4, `11_SETTINGS.md` §11.3). Nothing else moved.
 */
/**
 * **Four tabs, ruled 15 Aug 2026.** Down from eight.
 *
 * The eight were counted before this cut: 100 rows across them, of which 18
 * were an actual editable setting and 12 existed only to say "not built". The
 * rest were doors to other pages. Settings had become a directory of the
 * application rather than a place to change something.
 *
 * What went where:
 *
 *   · `overview`     → deleted. A stat panel nobody could act on (uptime,
 *                      active sessions) plus a second copy of the
 *                      administration links that already live under System.
 *   · `organization` ┐
 *   · `financial`    ┘ → **Business**. One place for what this company is and
 *                      what it charges, instead of two tabs to guess between.
 *   · `users`        → **People**.
 *   · `integrations` → deleted outright. Nine rows: seven said "not built",
 *                      one pointed at the now-archived Automation Center, one
 *                      pointed at Finance. Nothing built lost a door.
 *   · `security`     → folded into **System** as its own two cards.
 *
 * **Law 6 moved down a level, it did not weaken.** `financial` used to be a
 * money-gated TAB; its content is now money-gated SECTIONS inside Business, so
 * a money-blind session gets Business with the organisation cards and no
 * financial cards at all — removed, never rendered disabled. `Settings.tsx`
 * owns that filter: it renders `FinancialPane` only when `useCanViewMoney()`
 * is true, the same test that used to drop the whole tab.
 *
 * Old `?tab=` links still work: `LEGACY_TAB` maps every retired key onto its
 * new home rather than dropping the user on a fallback.
 */
export const TABS: TabDef[] = [
  { key: 'business', label: 'Business', money: false },
  { key: 'people', label: 'People', money: false },
  { key: 'branches', label: 'Branches', money: false },
  { key: 'system', label: 'System', money: false },
]

/**
 * Retired tab keys, and where each now lands.
 *
 * A deep link is a contract: Administration Modules rows, the phone section
 * list and any bookmark a user made all carry `?tab=`. Mapping them is a few
 * lines; letting them fall back to the default silently sends someone looking
 * for VAT to the wrong page.
 */
export const LEGACY_TAB: Record<string, TabKey> = {
  overview: 'business',
  organization: 'business',
  financial: 'business',
  users: 'people',
  security: 'system',
  integrations: 'system',
  /* Parked well before this cut — kept here so their links resolve too. */
  communication: 'system',
  automation: 'system',
  ai: 'system',
}

/** The default when no `?tab=` is present, and the fallback for an unknown one. */
export const DEFAULT_TAB: TabKey = 'business'

/** Short label for the phone list and the tablet strip, where width is scarce. */
export const TAB_SHORT_LABEL: Record<TabKey, string> = {
  business: 'Business',
  people: 'People',
  branches: 'Branches',
  system: 'System',
}

export const TAB_ICON: Record<TabKey, IconName> = {
  business: 'briefcase',
  people: 'users',
  branches: 'box',
  system: 'settings',
}

/** One line under each row of the phone section list, so a tap is not a guess. */
export const TAB_SUMMARY: Record<TabKey, string> = {
  business: 'Name, VAT and language \u00b7 tax, terms, deposits and memberships.',
  people: 'User list, role assignment, and the nine-role permissions matrix.',
  branches: 'Branch list, and the warehouses, racks and zones under each one.',
  system: 'Appearance, notifications, preferences, security and the admin tools.',
}


export function isTabKey(v: string | null): v is TabKey {
  return TABS.some((t) => t.key === v)
}

/**
 * Whether a destination can be reached by *this* session.
 *
 * A `tab` destination pointing at a tab Law 6 removed is a dead control — the
 * page would render "Taxes (VAT) →" for a Warehouse operator and land them
 * back on Overview. Rows that fail this are dropped from their list entirely,
 * which is the same treatment the tab itself gets: removed, not disabled.
 */
export function isDestVisible(dest: Dest, visible: readonly TabDef[]): boolean {
  return dest.kind !== 'tab' || visible.some((t) => t.key === dest.tab)
}

/* ── organization profile ──────────────────────────────────────────────── */

export interface OrgField {
  label: string
  value: string
  icon: IconName
}

export const ORG = {
  legalName: BRANCH.name,
  trading: 'Film Equipment Rental & Media Services',
  verified: true,
  /** Two-letter mark; the render draws a logo tile and no asset exists for it. */
  mark: 'BR',
}

/**
 * The render's profile block, in its order. `Business Registration Number`,
 * `Primary Warehouse` and `Created Date` are in `Organization.md` §Organization
 * Overview but appear in neither render and nobody supplied them —
 * TODO(decision): they are omitted rather than invented.
 */
export const ORG_FIELDS: OrgField[] = [
  { label: 'Registered address', value: 'Boudha, Kathmandu, Nepal', icon: 'home' },
  { label: 'VAT / PAN', value: BRANCH.vat.replace(/^VAT:\s*/, ''), icon: 'file' },
  { label: 'Phone', value: '+977 985-2941876', icon: 'phone' },
  { label: 'Email', value: 'info@babinrentals.com', icon: 'mail' },
  { label: 'Website', value: 'www.babinrentals.com', icon: 'external_link' },
  { label: 'Company type', value: 'Private Limited Company', icon: 'briefcase' },
  /*
   * The COMPANY's proprietor — a registration fact, sitting with the company's
   * phone, email and website above. It was built from `nav.ts`'s `CURRENT_USER`,
   * which that file documents as "Top-right identity chip", i.e. the SIGNED-IN
   * user. Two different questions were sharing one constant: whoever was at the
   * keyboard was rendered as the business owner, and the row changed meaning
   * depending on who logged in.
   *
   * TODO(decision): the real proprietor is not recorded anywhere in the schema —
   * there is no business-profile table — so this stays a literal alongside the
   * other company facts on this card rather than being derived from a session
   * that cannot answer it.
   */
  { label: 'Owner', value: 'Babin Shrestha · Proprietor', icon: 'crew' },
]

/* ── branches ──────────────────────────────────────────────────────────── */

/**
 * A **branch** lifecycle, not a booking one. `Branch Management.md` §Branch
 * Cards names these four. It is a screen-local vocabulary for a different
 * entity, so it neither shadows nor redefines `lib/workflow.ts`.
 */
export type BranchStatus = 'Active' | 'Inactive' | 'Under Setup' | 'Archived'

export const BRANCH_STATUS_TOKEN: Record<BranchStatus, StatusKey> = {
  Active: 'in',
  'Under Setup': 'progress',
  Inactive: 'neutral',
  Archived: 'neutral',
}

export interface Branch {
  id: string
  /** §7 ID registry — `BR-` is the branch prefix and belongs to nothing else. */
  code: string
  name: string
  city: string
  address: string
  manager: string
  phone: string
  warehouses: number
  staff: number
  equipment: number
  revenue: Paisa
  /** Percent, 0–100. A ratio stays numeric; only amounts are paisa. */
  utilization: number
  /** Month-over-month revenue growth, percent. */
  growthPercent: number
  status: BranchStatus
}

export const BRANCHES: Branch[] = [
  {
    id: 'br-001',
    code: 'BR001',
    name: 'Head Office — Boudha',
    city: 'Kathmandu',
    address: 'Boudha, Kathmandu, Nepal',
    manager: 'Ramesh Dulal',
    phone: '+977 985-2941876',
    warehouses: 2,
    staff: 15,
    equipment: 1258,
    revenue: rupees(1245300),
    utilization: 92,
    growthPercent: 18.4,
    status: 'Active',
  },
  {
    id: 'br-002',
    code: 'BR002',
    name: 'Lalitpur Branch',
    city: 'Lalitpur',
    address: 'Gwarko, Lalitpur',
    manager: 'Sunil Gurung',
    phone: '+977 984-6813729',
    warehouses: 1,
    staff: 8,
    equipment: 687,
    revenue: rupees(874200),
    utilization: 88,
    growthPercent: 14.2,
    status: 'Active',
  },
  {
    id: 'br-003',
    code: 'BR003',
    name: 'Pokhara Branch',
    city: 'Pokhara',
    address: 'New Road, Pokhara',
    manager: 'Prabin Lama',
    phone: '+977 981-3947852',
    warehouses: 1,
    staff: 5,
    equipment: 562,
    revenue: rupees(367000),
    /*
     * The render says 88% on the branch card and 78% in both the table and
     * Branch Performance. 78 is the one that reproduces the rail's stated 86%
     * group average — (92 + 88 + 78) / 3 — so the card is the stale cell.
     */
    utilization: 78,
    growthPercent: 9.6,
    status: 'Active',
  },
]

/**
 * Group figures the branch rows cannot produce on their own — the render gives
 * one company-wide number for each and no per-branch split, and a split nobody
 * supplied is not ours to invent.
 */
export const GROUP_FINANCE = {
  equipmentValue: rupees(31245600),
  monthlyProfit: rupees(756300),
}

export interface BranchTotals {
  branches: number
  activeBranches: number
  warehouses: number
  staff: number
  equipment: number
  revenue: Paisa
  /** Mean utilisation across the branches in the set, whole percent. */
  utilization: number
  /** Month-over-month revenue growth for the set, derived from each branch. */
  growthPercent: number
}

/** Every KPI, rail row and footer count on the Branches pane comes from here. */
export function totalsOf(rows: Branch[]): BranchTotals {
  const revenue = rows.reduce((s, b) => s + b.revenue, 0) as Paisa
  const prior = rows.reduce((s, b) => s + roundHalfUp(b.revenue / (1 + b.growthPercent / 100)), 0)
  return {
    branches: rows.length,
    activeBranches: rows.filter((b) => b.status === 'Active').length,
    warehouses: rows.reduce((s, b) => s + b.warehouses, 0),
    staff: rows.reduce((s, b) => s + b.staff, 0),
    equipment: rows.reduce((s, b) => s + b.equipment, 0),
    revenue,
    utilization: rows.length === 0 ? 0 : roundHalfUp(rows.reduce((s, b) => s + b.utilization, 0) / rows.length),
    growthPercent: prior === 0 ? 0 : roundHalfUp(((revenue - prior) / prior) * 1000) / 10,
  }
}

/* ── branch ▸ warehouse join (§11.3) ───────────────────────────────────── */

/**
 * **The FK §11.3 forces.**
 *
 * `data/warehouse.ts` keys each warehouse to its branch by a **free-text name**
 * — `'Kathmandu (HQ)'`, `'Lalitpur'`, `'Pokhara Lakeside'`, `'Bhaktapur'` —
 * none of which is a `Branch.name` in `BRANCHES` (`'Head Office — Boudha'`,
 * `'Lalitpur Branch'`, `'Pokhara Branch'`). Matching on that string gives Head
 * Office **one** warehouse where it declares two, and invents a fourth branch
 * that does not exist. The old guard only asserted the group total (4), which
 * passed by coincidence, so §11.3's nested row would have drawn a branch with
 * an empty child list and no error anywhere.
 *
 * This map is the join, keyed on the warehouse **id** — a stable identifier,
 * not a label somebody may re-word. `SEED_ERRORS` now asserts it per branch.
 *
 * TODO(decision) — Rulings §9.12: is `wh-04` "Bhaktapur Heavy Grip & Rigging"
 * a fourth BRANCH or a fourth WAREHOUSE of an existing one? It is joined to
 * `br-001` here because that is the only assignment under which BRANCHES' own
 * declared warehouse counts (2 / 1 / 1) reconcile, and nothing else in the
 * repo settles it. If it is really a fourth branch then BRANCHES gains a row
 * and every render-asserted group total moves with it — 3 branches, 28 staff,
 * 2,507 items, Rs 24,86,500 revenue, 86% mean utilisation.
 *
 * TODO(decision) — this map lives in `data/settings.ts` because
 * `data/warehouse.ts` belongs to the Inventory pass and this one may not edit
 * it. The field belongs on the `Warehouse` record itself as `branchId`,
 * replacing the free-text `branch` string that `Warehouses.tsx` still filters
 * on. Until it moves, two sources describe one relationship.
 */
export const WAREHOUSE_BRANCH_ID: Record<string, string> = {
  'wh-01': 'br-001',
  'wh-02': 'br-002',
  'wh-03': 'br-003',
  'wh-04': 'br-001',
}

/** The warehouses under one branch. Empty is a real answer for a new branch. */
export function warehousesOfBranch(branchId: string): Warehouse[] {
  return WAREHOUSES.filter((w) => WAREHOUSE_BRANCH_ID[w.id] === branchId)
}

/**
 * §11.3 draws a `racks` column. `data/warehouse.ts` carries `zonesCount` but no
 * rack count, and its own comment at `STORAGE_LOCATIONS` says the 9 seeded bins
 * cover only part of the 20 declared zones — so counting distinct racks there
 * would produce a number that is both wrong and confident. Never a figure
 * without a source.
 */
export const RACKS_NOT_TRACKED =
  'not tracked yet — no rack count exists on a warehouse record, and the 9 seeded bin rows cover only part of the 20 declared zones'

/**
 * TODO(decision) — §11.3: *"Rack / shelf / case is structured, never free
 * text."* Today `data/warehouse.ts` types `zone`, `rack` and `shelf` as plain
 * `string` and names the fourth level **`bin`**, not `case` — and a flight case
 * is not obviously the same object as a storage bin. Settle the vocabulary and
 * the number of levels before any of them is given a typed identifier;
 * structuring the wrong four levels is more expensive than structuring none.
 */
export const STORAGE_VOCABULARY_TODO =
  'TODO(decision) — §11.3 asks for "rack / shelf / case, structured, never free text". This build stores zone, rack and shelf as free text and calls the fourth level a bin, not a case. The vocabulary and the level count are unsettled, so no level has a typed identifier yet.'

/* ── equipment mix ─────────────────────────────────────────────────────── */

/**
 * `Branch Management.md` §Analytics ▸ Equipment Distribution. Counts only —
 * every percentage in the legend is computed from them, so a share can never
 * disagree with its own numerator.
 */
export const EQUIPMENT_MIX: Array<{ label: string; count: number }> = [
  { label: 'Available', count: 1256 },
  { label: 'Reserved', count: 325 },
  { label: 'On Rent', count: 687 },
  { label: 'Maintenance', count: 154 },
  { label: 'Missing / Damaged', count: 85 },
]

export function equipmentSlices(): Slice[] {
  const total = EQUIPMENT_MIX.reduce((s, m) => s + m.count, 0) || 1
  return EQUIPMENT_MIX.map((m) => ({
    label: m.label,
    value: m.count,
    display: grouped(m.count),
    percent: `${(Math.round((m.count / total) * 1000) / 10).toFixed(1)}%`,
  }))
}

/* ── inventory transfers ───────────────────────────────────────────────── */

/** §Inventory Transfers — the five transfer states, in the render's order. */
export const TRANSFER_STAGES: Array<{ label: string; count: number; tone: StatusKey; icon: IconName }> = [
  { label: 'Pending', count: 7, tone: 'progress', icon: 'timer' },
  { label: 'Approved', count: 5, tone: 'primary', icon: 'check' },
  { label: 'In Transit', count: 3, tone: 'out', icon: 'truck' },
  { label: 'Completed (This Month)', count: 18, tone: 'in', icon: 'return_arrow' },
  { label: 'Cancelled', count: 2, tone: 'danger', icon: 'close' },
]

/* ── alerts ────────────────────────────────────────────────────────────── */

export interface CountAlert {
  label: string
  count: number
  tone: StatusKey
  icon: IconName
  dest: Dest
}

/**
 * Each row goes to the queue that would clear it. §Alerts also lists Transfer
 * Delays; the render gives no count for it, so it is not seeded.
 */
export const BRANCH_ALERTS: CountAlert[] = [
  { label: 'Low Stock Items', count: 6, tone: 'danger', icon: 'error', dest: { kind: 'route', to: '/inventory' } },
  { label: 'Maintenance Due', count: 12, tone: 'progress', icon: 'tool', dest: { kind: 'route', to: '/inventory' } },
  { label: 'Overdue Returns', count: 5, tone: 'danger', icon: 'return_arrow', dest: { kind: 'route', to: '/rentals' } },
  { label: 'Staff Shortage', count: 2, tone: 'progress', icon: 'users', dest: { kind: 'route', to: '/crew' } },
  /* Derived, not typed — cases.ts correction #2: this tile navigates to the
     Cases page, so its figure MUST be the page's own `isOpenStatus` count or
     the click contradicts the destination (§5.8). The hand-typed 8 it
     replaced disagreed with the 12 the page derives. */
  { label: 'Open Cases', count: openCasesCount(), tone: 'primary', icon: 'flag', dest: { kind: 'route', to: '/inventory/cases' } },
]

export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'

/** §Important Alerts — "Critical ↓ High ↓ Medium ↓ Low", so the list is sorted. */
const PRIORITY_RANK: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

export const PRIORITY_TONE: Record<Priority, StatusKey> = {
  Critical: 'danger',
  High: 'danger',
  Medium: 'progress',
  Low: 'primary',
}

export interface SystemAlert {
  text: string
  priority: Priority
  icon: IconName
  dest: Dest
}

/*
 * Annotated here rather than on the sorted result: `.sort()` returns the array
 * literal's own inferred type, so with the annotation only on the export every
 * `priority` widened to `string` and stopped satisfying `Priority`.
 */
const ALERTS_SEED: SystemAlert[] = [
  {
    text: '3 staff roles have excessive permissions',
    priority: 'High',
    icon: 'error',
    dest: { kind: 'tab', tab: 'people' },
  },
  {
    text: '2 numbering sequences running low',
    priority: 'Medium',
    icon: 'timer',
    dest: { kind: 'route', to: '/admin/numbering' },
  },
  { text: 'VAT return due in 15 days', priority: 'Medium', icon: 'receipt', dest: { kind: 'tab', tab: 'business' } },
  /*
   * "WhatsApp token expires in 7 days" → tab `communication` used to be the
   * fourth row. §11.2 parks Channels / Communication, which takes its only
   * destination with it. It is **deleted, not re-pointed**: an expiring
   * WhatsApp token filed under Security or System is worse than no alert,
   * because the operator who clicks it finds no token and no way to renew one.
   * The alert comes back with the section that owns it.
   */
]

/** §Important Alerts — Critical ↓ High ↓ Medium ↓ Low. Copied, not sorted in place. */
export const SYSTEM_ALERTS: SystemAlert[] = [...ALERTS_SEED].sort(
  (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
)

/* ── activity ──────────────────────────────────────────────────────────── */

export interface ActivityEntry {
  who: string
  what: string
  when: string
  /** Drawn as a mark rather than a photo — no avatar asset exists. */
  initials: string
  system: boolean
}

function entry(who: string, what: string, when: string, system = false): ActivityEntry {
  const initials = system
    ? 'BR'
    : who
        .split(' ')
        .map((p) => p[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase()
  return { who, what, when, initials, system }
}

export const ADMIN_ACTIVITY: ActivityEntry[] = [
  entry('Ramesh Dulal', 'Updated organization profile', 'Today, 10:20 AM'),
  entry('Sunil Gurung', 'Added new user: Prabin Lama', 'Today, 09:45 AM'),
  entry('Anita Thapa', 'Updated VAT settings', 'Today, 08:30 AM'),
  entry('System', 'Backup completed successfully', 'Today, 02:15 AM', true),
  /* The render reads "role: Warehouse Staff". The business 8 name it Warehouse. */
  entry('Ramesh Dulal', 'Changed permission for role: Warehouse', 'Yesterday, 11:20 PM'),
]

export const BRANCH_ACTIVITY: ActivityEntry[] = [
  entry('Sunil Gurung', 'Updated Lalitpur branch info', 'Today, 09:45 AM'),
  entry('Prabin Lama', 'Added warehouse in Pokhara', 'Today, 08:30 AM'),
  entry('Ramesh Dulal', 'Transferred 5 items to Lalitpur', 'Today, 07:15 AM'),
  entry('System', 'Branch backup completed', 'Today, 02:15 AM', true),
]

/*
 * ── AI branch insights — DELETED ───────────────────────────────────────────
 *
 * `BRANCH_INSIGHTS` was four hand-written strings ("Head Office — Boudha is
 * the top performing branch."), rendered under a card titled **AI Branch
 * Insights** with an "Ask the assistant" link. Nothing computed them and no
 * model produced them.
 *
 * PLAN.md §0 Law 16 — *no AI panel renders until backed by a validated
 * computation* — and Rulings §7 order the card deleted with the AI tab. This
 * codebase had already ruled the same way once, on the sibling screen:
 * `Warehouses.tsx` retitled its own version **Warehouse Insights** because
 * "labelling deterministic arithmetic as a model output would be a false
 * claim". Four typed sentences are not even arithmetic.
 *
 * If branch observations are wanted back, `data/warehouse.ts:insightsOf()` is
 * the shape to copy: rules over the rows, re-runnable by hand, titled as what
 * they are.
 */

/* ── §11.4 Financial ───────────────────────────────────────────────────── */

/**
 * **Membership matrix — level │ discount % │ credit │ priority.**
 *
 * Rulings §5: the plan matrix appears in Settings ▸ Financial *in addition to*
 * the Memberships tab on Clients, which a user ruling keeps. So this is a
 * **projection of `data/membership.ts:PLANS`**, never a second transcription —
 * two hand-typed copies of one price list is exactly how a client gets quoted
 * a discount the invoice does not give.
 *
 * The `priority` column reads the plan's own priority feature back verbatim,
 * including whether the plan marks it included, not included, or merely
 * listed. It is not re-scored into a "high / medium / low" ranking: no such
 * ranking exists in the seed, and inventing one here would put a number on a
 * screen that no other screen agrees with.
 */
export interface MembershipMatrixRow {
  level: string
  badge: string
  /** The individual discount, as the plan states it. */
  discount: string
  /** Default credit limit — a rupee figure, so the whole matrix is money-gated. */
  credit: string
  priority: string
}

export const MEMBERSHIP_MATRIX: MembershipMatrixRow[] = PLANS.map((p) => {
  const priority = p.features.find((f) => /priority|vip/i.test(f.text))
  return {
    level: p.name,
    badge: p.badge,
    discount: p.discounts[0]?.split(' Individual')[0] ?? '—',
    credit: p.limits.find((l) => l.label === 'Default Credit Limit')?.value ?? '—',
    priority: priority
      ? `${priority.text} · ${priority.kind === 'on' ? 'included' : priority.kind === 'off' ? 'not included' : 'listed'}`
      : '—',
  }
})

/**
 * §11.4 draws a `category │ % of repl. val` table. **Nothing in this build
 * holds one.** `data/clientIntel.ts:196` already renders the same gap as
 * *"Not set (Open ⭐ #1 — per-category deposit % table)"*, and
 * `GUIDE/OPEN-DECISIONS.md` item 5 names it among "the last things standing
 * between the build and real use".
 *
 * TODO(decision) — the deposit percentage per gear category. Rendered as "not
 * tracked yet". A plausible default here would be charged to a real client.
 */
export const DEPOSIT_BY_CATEGORY_UNAVAILABLE =
  'No deposit-percentage table exists in this build — not a column, not a constant, not a seed row. Deposits are taken per booking today. Seeding a percentage per category would put a figure nobody supplied onto a client’s invoice, so this reads "not tracked yet" until an owner sets one.'

/**
 * §11.4 draws `notice period │ fee %`. Same story: `data/pulse.ts:824` names
 * *"cancellation fee tiers"* as one of the outstanding decisions, and no tier
 * table, enum or constant exists anywhere in `src/`.
 *
 * TODO(decision) — the cancellation fee tiers. Rendered as "not tracked yet".
 */
export const CANCELLATION_TIERS_UNAVAILABLE =
  /* No cancellation fee tiers exist in this build. A booking is cancelled as a named terminal transition (Law 3) and no fee is computed. The notice periods and their percentages are an owner decision that has not been taken, so this reads "not tracked yet" rather than showing a schedule the business never agreed. */ "Cancellation fees have not been defined. Cancelling a booking does not calculate a fee."

/* ── system summary ────────────────────────────────────────────────────── */

export interface SummaryRow {
  label: string
  value: string
  tone: 'default' | 'good' | 'warn'
}

/**
 * The version comes from the app's single version source.
 */
export const SYSTEM_SUMMARY: SummaryRow[] = [
  { label: 'System version', value: APP_VERSION.split(' ').pop() ?? '', tone: 'default' },
  { label: 'Database', value: 'Healthy', tone: 'good' },
  { label: 'Storage used', value: '246.8 GB / 1 TB', tone: 'default' },
  { label: 'Backup status', value: 'Successful', tone: 'good' },
  { label: 'Last backup', value: 'Today, 02:15 AM', tone: 'default' },
  { label: 'Next scheduled backup', value: 'Tomorrow, 02:00 AM', tone: 'default' },
  { label: 'Environment', value: 'Production', tone: 'default' },
  // Same defect as SYSTEM_STATS above: no session store is read, so the
  // figure states its absence rather than inventing one (rulings §8).
  { label: 'Active sessions', value: 'Not tracked yet', tone: 'default' },
]

/**
 * ⛔ `SYSTEM_STATS = { activeUsers: 28, uptime: '99.98%', activeSessions: 12 }`
 * used to live here and was rendered on Settings ▸ Overview under the notes
 * "Last 30 days" and "Signed in right now" — notes that assert a measurement
 * window and a live reading. There is no uptime probe in this repo, no session
 * reader in `lib/queries/`, and no count query behind 28; the figure also
 * disagreed with `/system`'s own invented "Active Sessions 18" on the page it
 * linked to. Rulings §8: *"Never seed a plausible default."*
 *
 * Deleted rather than left exported, so no later screen can print it again.
 * The Overview strip now states what is missing instead.
 */
export const SYSTEM_STATS_UNAVAILABLE = {
  activeUsers: 'No staff-account query exists in this build',
  uptime: 'No uptime monitor is connected',
  activeSessions: 'No session store is read',
} as const

/* ── quick access · administration modules · rail actions — REMOVED ─────── */

/*
 * `QUICK_ACCESS` (10 cards), `MODULE_GROUPS` (the administration modules grid)
 * and `RAIL_ACTIONS` lived here to feed the Overview tab. Overview was deleted
 * on 15 Aug: it was a stat panel nobody could act on plus a second copy of the
 * administration links that already sit under System, and every one of these
 * rows pointed either at a tab a user could reach from the tab strip or at a
 * route they could reach from the System card.
 *
 * They are removed rather than kept unused — an exported list nothing renders
 * is read by the next person as a live surface. The Overview pane itself is at
 * `src/archive/SettingsOverview.tsx` (Law 3: nothing is deleted).
 */

/* ── rail quick actions ────────────────────────────────────────────────── */

/* Local `Dest` constructors. They used to sit above the administration modules
   grid that this file no longer carries; the two quick-action lists below are
   the only remaining users. */
const TO = (to: string): Dest => ({ kind: 'route', to })
const NO = (why: string): Dest => ({ kind: 'none', why })

export interface QuickAction {
  label: string
  icon: IconName
  dest: Dest
}

/** §Quick Actions — "exactly five", in the render's order. */
export const SYSTEM_QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Clear system cache',
    icon: 'refresh',
    dest: NO('Cache lives on the server; nothing is connected to clear.'),
  },
  {
    label: 'Rebuild search index',
    icon: 'search',
    dest: NO('The search index is server side; nothing is connected to rebuild.'),
  },
  { label: 'View audit logs', icon: 'file', dest: TO('/admin/audit') },
  { label: 'System health check', icon: 'activity', dest: TO('/system') },
  { label: 'Update system', icon: 'download', dest: NO('Releases are deployed from the build pipeline, not from this page.') },
]

/**
 * `Branch Management.md` §Quick Actions — "exactly four", in the render's order.
 *
 * Two of them are performed **by the page**, not navigated to, and `Dest` has no
 * case for that on purpose: it exists so a link cannot go nowhere. So an action
 * carries a `dest` when it navigates and a `kind` the pane wires up when it does
 * not — there is still no fourth, silent case.
 */
export type BranchActionKind = 'add-branch' | 'transfer-equipment' | 'export-report' | 'print-labels'

export interface BranchQuickAction {
  kind: BranchActionKind
  label: string
  icon: IconName
  /** Present when the tile navigates; absent when the pane performs it in place. */
  dest?: Dest
}

export const BRANCH_QUICK_ACTIONS: BranchQuickAction[] = [
  { kind: 'add-branch', label: 'Add Branch', icon: 'plus' },
  { kind: 'transfer-equipment', label: 'Transfer Equipment', icon: 'truck', dest: TO('/inventory/warehouses') },
  { kind: 'export-report', label: 'Export Report', icon: 'download' },
  {
    kind: 'print-labels',
    label: 'Print QR Labels',
    icon: 'package',
    dest: NO('QR labels are printed one asset at a time, from Inventory ▸ the asset ▸ Label. No bulk branch label run exists in this build.'),
  },
]

/* ── the render's own figures, asserted ────────────────────────────────── */

/**
 * The numbers both renders print for the group. Nothing below is *displayed* —
 * it exists so that a typo in `BRANCHES` or `EQUIPMENT_MIX` fails loudly here
 * instead of quietly changing a KPI nobody re-checks.
 */
const RENDER_FIGURES = {
  branches: 3,
  activeBranches: 3,
  warehouses: 4,
  staff: 28,
  equipment: 2507,
  revenue: rupees(2486500),
  utilization: 86,
}

/**
 * Reported, never thrown. A module-scope throw runs before React mounts and
 * blanks the app with nothing in it — see the same note in `lib/money.ts`.
 */
export const SEED_ERRORS: string[] = (() => {
  const errs: string[] = []
  const t = totalsOf(BRANCHES)

  const check = (what: string, got: number | string, want: number | string) => {
    if (got !== want) errs.push(`${what}: seed gives ${got}, the render states ${want}.`)
  }

  check('Total branches', t.branches, RENDER_FIGURES.branches)
  check('Active branches', t.activeBranches, RENDER_FIGURES.activeBranches)
  check('Warehouses', t.warehouses, RENDER_FIGURES.warehouses)
  check('Active staff', t.staff, RENDER_FIGURES.staff)
  check('Equipment', t.equipment, RENDER_FIGURES.equipment)
  check('Monthly revenue', formatMoney(t.revenue), formatMoney(RENDER_FIGURES.revenue))
  check('Average utilization', `${t.utilization}%`, `${RENDER_FIGURES.utilization}%`)

  const mix = EQUIPMENT_MIX.reduce((s, m) => s + m.count, 0)
  if (mix !== t.equipment) {
    errs.push(`Equipment distribution sums to ${grouped(mix)} but the branches hold ${grouped(t.equipment)}.`)
  }

  const codes = new Set(BRANCHES.map((b) => b.code))
  if (codes.size !== BRANCHES.length) errs.push('Two branches share a branch code.')
  for (const b of BRANCHES) {
    if (!/^BR\d{3}$/.test(b.code)) errs.push(`${b.name} carries "${b.code}"; the branch prefix is BR followed by three digits.`)
    if (b.utilization < 0 || b.utilization > 100) errs.push(`${b.name} has a utilization of ${b.utilization}%.`)
  }

  /*
   * §11.3's nested row is a JOIN, so the join is what gets asserted — per
   * branch, not as a group total. The old check ("Warehouses: 4") passed while
   * Head Office held one warehouse against a declared two, which is precisely
   * the row that would have drawn empty.
   */
  const branchIds = new Set(BRANCHES.map((b) => b.id))
  for (const w of WAREHOUSES) {
    const owner = WAREHOUSE_BRANCH_ID[w.id]
    if (owner === undefined) {
      errs.push(`Warehouse ${w.code} is under no branch — every warehouse belongs to exactly one.`)
    } else if (!branchIds.has(owner)) {
      errs.push(`Warehouse ${w.code} is joined to branch "${owner}", which is not in BRANCHES.`)
    }
  }
  for (const id of Object.keys(WAREHOUSE_BRANCH_ID)) {
    if (!WAREHOUSES.some((w) => w.id === id)) {
      errs.push(`The branch join names warehouse "${id}", which does not exist.`)
    }
  }
  for (const b of BRANCHES) {
    const joined = warehousesOfBranch(b.id).length
    if (joined !== b.warehouses) {
      errs.push(`${b.name} declares ${b.warehouses} warehouse${b.warehouses === 1 ? '' : 's'} but ${joined} join${joined === 1 ? 's' : ''} to it.`)
    }
  }

  return errs
})()
