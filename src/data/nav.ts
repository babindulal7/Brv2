import type { IconName } from '../components/ui/Icon'
import type { SystemRole } from '../types/database'
import { canViewMoney, isStaff } from '../lib/rbac'

/**
 * The application's navigation tree — simplified global navigation.
 *
 * Primary navigation (7 items):
 * Dashboard · Rentals · Calendar · Operations · Inventory · Clients · Finance
 *
 * Secondary navigation (More):
 * Crew Assist · Tools · Settings
 *
 * New Rental is an action, not a module — it lives under Header Create ▾
 * and redirects to `/rentals?action=new`.
 */

export interface NavChild {
  label: string
  to: string
  children?: NavChild[]
}

export interface NavSection {
  label: string
  icon: IconName
  to: string
  children?: NavChild[]
  action?: {
    label: string
    to: string
    title?: string
  }
}

export interface NavGroup {
  id: string
  title: string
  sections: NavSection[]
}

/**
 * Declared before navigation arrays and inserted by reference.
 */
const SETTINGS_SECTION: NavSection = { label: 'Settings', icon: 'settings', to: '/settings' }

/**
 * The 3 operational domains:
 * 1. Daily Dispatch (Dashboard, Rentals, Operations, Calendar)
 * 2. Assets & Relationships (Inventory, Clients, Crew Assist)
 * 3. Business & Back Office (Finance, Documents, Analytics)
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dispatch',
    title: 'Daily Dispatch',
    sections: [
      { label: 'Dashboard', icon: 'home', to: '/dashboard' },
      {
        label: 'Rentals',
        icon: 'checklist',
        to: '/rentals',
        action: { label: '+ New', to: '/rentals/new', title: 'Create new rental booking' },
      },
      { label: 'Operations', icon: 'queues', to: '/operations' },
      { label: 'Calendar', icon: 'calendar', to: '/calendar' },
    ],
  },
  {
    id: 'assets',
    title: 'Assets & Relationships',
    sections: [
      { label: 'Inventory', icon: 'box', to: '/inventory' },
      { label: 'Clients', icon: 'users', to: '/clients' },
      { label: 'Crew Assist', icon: 'crew', to: '/crew' },
    ],
  },
  {
    id: 'business',
    title: 'Business & Back Office',
    sections: [
      { label: 'Finance', icon: 'card', to: '/finance' },
      { label: 'Documents', icon: 'file', to: '/documents' },
      { label: 'Analytics', icon: 'chart', to: '/reports/pulse' },
    ],
  },
]

/**
 * Primary navigation destinations for desktop and tablet shells.
 */
export const PRIMARY_NAV: NavSection[] = NAV_GROUPS.flatMap((g) => g.sections)

/**
 * Secondary lower-frequency modules exposed under More or Settings.
 */
export const MORE_NAV: NavSection[] = [
  { label: 'Tools', icon: 'tool', to: '/tools' },
  SETTINGS_SECTION,
]

export const ALL_NAV: NavSection[] = [...PRIMARY_NAV, ...MORE_NAV]
export const NAV: NavSection[] = PRIMARY_NAV

export const SETTINGS_NAV: NavSection = SETTINGS_SECTION

export function filterNavByRole(sections: NavSection[], role: SystemRole | undefined): NavSection[] {
  if (!role) return []
  let nav = sections
  if (!canViewMoney(role)) {
    nav = nav.filter((s) => !isMoneySurface(s.to))
  }
  if (!isStaff(role)) {
    nav = nav.filter((s) => !isStaffSurface(s.to))
  }
  return nav
}

export function permittedNavGroups(role: SystemRole | undefined): NavGroup[] {
  if (!role) return []
  return NAV_GROUPS.map((group) => ({
    ...group,
    sections: filterNavByRole(group.sections, role),
  })).filter((group) => group.sections.length > 0)
}

export function permittedNav(role: SystemRole | undefined): NavSection[] {
  return filterNavByRole(PRIMARY_NAV, role)
}

export function permittedMoreNav(role: SystemRole | undefined): NavSection[] {
  return filterNavByRole(MORE_NAV, role)
}

export function permittedAllNav(role: SystemRole | undefined): NavSection[] {
  return filterNavByRole(ALL_NAV, role)
}

/**
 * **The money surfaces — one list, read by every gate.**
 *
 * `permittedNav()` filters `NAV` by it, `App.tsx`'s Shell guard refuses a typed
 * URL by it, and `modules/tools/ToolsLanding.tsx` drops a card by it. Before
 * this list was shared, the guard was the literal `pathname.startsWith('/finance')`
 * while this file already called `/reports` and `/admin` money-adjacent — two
 * answers to one question, which is the drift the single list removes.
 *
 * Entries are route **prefixes**, matched by {@link isMoneySurface} as
 * `path === r || path.startsWith(r + '/')`, never bare `startsWith` — otherwise
 * `/finance-notes` would be caught by `/finance`.
 *
 *  - `/finance` — nav item 9, the module itself.
 *  - `/reports` — not in `NAV` (Reports is a Finance tab per `09_FINANCE.md`),
 *    kept so that restoring it as a section cannot silently restore it for the
 *    floor as well. The report screens each omit their own figures via
 *    `useCanViewMoney()`; this makes the module itself unreachable rather than
 *    reachable-but-hollowed.
 *  - `/admin` — likewise not in `NAV`; `/admin/*` now redirects into `/tools/*`.
 *  - `/tools/pricing`, `/tools/depreciation` — **the two calculators, not Tools
 *    itself.** Tools is nav item 10 and `10_TOOLS.md` restricts none of its four
 *    admin cards, so `/tools` stays in the nav for every role. Its two
 *    calculators are money screens by their own spec (§10.2 "purchase date ·
 *    price … opening │ dep │ WDV", §10.3 "rate / discount chips / VAT"), so they
 *    are listed one level down. Putting `/tools` here instead would hide Audit
 *    Log, Activity Log, Numbering and Backup & Restore from the floor, which no
 *    spec asks for.
 */
export const MONEY_ROUTES: readonly string[] = [
  '/finance',
  '/reports',
  '/admin',
  '/tools/pricing',
  '/tools/depreciation',
]

/** True when `path` is inside a money surface. Prefix match on a path segment. */
export function isMoneySurface(path: string): boolean {
  const base = path.split('?')[0] ?? path
  return MONEY_ROUTES.some((r) => base === r || base.startsWith(r + '/'))
}

/**
 * **The staff-only surfaces — `isStaff`'s route list, Law 6's sibling.**
 *
 * Added 22 Aug 2026 (audit theme 3 #7). `lib/rbac.ts` has said since the roles
 * were drawn: *"Client is external. Guard every staff surface with this."* But
 * until this list existed no route surface asked — an external Client session
 * could reach the floor workspaces, `/clients/import`, `/clients/duplicates`
 * and `/crew`, stopped only by RLS returning empty results. An empty screen is
 * not a refusal: it reads as "nothing here today", leaks the surface's shape
 * and labels, and contradicts the app's own rule that forbidden things are
 * absent or refused, never hollowed out.
 *
 * Same discipline as {@link MONEY_ROUTES}: **one list, read by every gate.**
 * `permittedNav()` filters `NAV` by it and `App.tsx`'s Shell guard refuses a
 * typed URL by it, so nav and guard cannot answer differently.
 *
 * Entries are route **prefixes**, matched exactly like `MONEY_ROUTES`:
 *
 *  - `/crew` — nav item 6. Crew scheduling is staff coordination; a client
 *    hiring crew goes through their booking, not the roster.
 *  - `/clients/import`, `/clients/duplicates` — bulk intake and merge tooling
 *    over the whole client book. `client_merges_all` is Owner/Admin/Manager in
 *    the database; the surface itself is meaningless to the one client a
 *    Client session can see.
 *
 * The floor workspaces are covered by {@link FLOOR_ROUTE_SUFFIXES} below —
 * they are `/rentals/:bookingNo/<step>` routes, so a prefix cannot name them.
 *
 * ⚠ This list is a ROUTE gate for the external role only. It does not replace
 * the per-capability predicates (`canWriteFloor`, `canMergeClients`, …) that
 * decide which STAFF roles may act once inside — mirroring rule, Law 6.
 */
export const STAFF_ROUTES: readonly string[] = [
  '/notes',
  '/crew',
  '/clients/import',
  '/clients/duplicates',
]

/**
 * The five floor-workspace suffixes under `/rentals/:bookingNo/…`.
 *
 * Moved here from `App.tsx` on 22 Aug 2026 so its two readers share one list:
 * `App.tsx`'s Shell still reads it to apply the floor UI scale
 * (`data-floor` — DEVICES.md §7 build order item 3), and `isStaffSurface()`
 * reads it because the floor is staff ground (audit theme 3 #7). Two copies of
 * the same five suffixes would drift exactly the way the money guard once did.
 */
export const FLOOR_ROUTE_SUFFIXES: readonly string[] = [
  '/packing',
  '/handover',
  '/return',
  '/reset',
  '/evidence',
]

/**
 * True when `path` is a staff-only surface an external Client session must be
 * refused. Prefix match over {@link STAFF_ROUTES} (same rule as
 * {@link isMoneySurface}), plus suffix match over {@link FLOOR_ROUTE_SUFFIXES}
 * for the parameterised floor routes a prefix cannot express.
 */
export function isStaffSurface(path: string): boolean {
  const base = path.split('?')[0] ?? path
  return (
    STAFF_ROUTES.some((r) => base === r || base.startsWith(r + '/')) ||
    FLOOR_ROUTE_SUFFIXES.some((s) => base.endsWith(s))
  )
}

/**
 * Which nav entry owns a route — **most specific wins, exactly one answer.**
 *
 * Lives here rather than in `Sidebar.tsx` because the sidebar and the phone bar
 * must agree; when each had its own rule they did not. The old sidebar test was
 * `base === s.to || base.startsWith(s.to + '/')` evaluated per row, which is
 * fine while no nav route is a prefix of another. The fixed 11 breaks that:
 * **New Rental is `/rentals/new` and Rentals is `/rentals`**, so `/rentals/new`
 * lit up both rows, and `aria-current="page"` landed on neither (that check
 * compared against the query-bearing string, which never matches a bare `to`).
 *
 * Longest matching `to` wins, so every route has one owner:
 *
 * | route | owner |
 * |---|---|
 * | `/rentals/new` | New Rental — `/rentals/new` (12) outranks `/rentals` (8) |
 * | `/rentals` | Rentals |
 * | `/rentals/B-715` | Rentals — `/rentals/new` does not match at all |
 * | `/rentals/B-715/packing` | Rentals |
 * | `/operations?queue=packing` | Operation — the query is stripped first |
 *
 * The query string is stripped because Operation's queues are `?queue=` filter
 * chips on one page (`03_OPERATION.md` §3.1), not separate destinations.
 * `startsWith(s.to + '/')` and not `startsWith(s.to)`, so `/rentals-archive`
 * would never be claimed by `/rentals`.
 */
export function activeNavTo(sections: NavSection[], path: string): string | null {
  const base = path.split('?')[0] ?? path
  let best: NavSection | null = null
  for (const s of sections) {
    if (base === s.to || base.startsWith(s.to + '/')) {
      if (best === null || s.to.length > best.to.length) best = s
    }
  }
  if (best) return best.to
  // Analytics opens Pulse directly, while the other reports are sibling routes.
  if (base === '/reports' || base.startsWith('/reports/')) {
    return sections.find((s) => s.to === '/reports/pulse')?.to ?? null
  }
  return null
}

/* ══ phone bottom bar ════════════════════════════════════════════════════ */

/**
 * The three *routed* slots of the phone bar, in order. Scan and More are not
 * routes, so they are not here — see `bottomBarSlots()`.
 *
 * **This replaces the per-role `BOTTOM_BAR_ROUTES` table.** That table gave each
 * of the nine roles its own curated three (Warehouse got Operations, Accounts
 * got Finance, …), citing `DEVICES.md` §4: "a Driver's bar is not a
 * Coordinator's." The updated wireframe overrules it with one bar for everyone:
 *
 * > **Phone bar (5 slots):** Today · Rentals · **Scan ⦿** · Inventory · More.
 *
 * Fixed does **not** mean unfiltered. Every routed slot is still resolved
 * against `permittedNav()`, so a role that cannot reach a route never gets a
 * slot for it and the fixed bar cannot become an RBAC hole. A dropped slot
 * leaves four, not a dead button.
 */
export const BOTTOM_BAR_ROUTES: readonly string[] = ['/dashboard', '/rentals', '/inventory']

/**
 * Where **Scan ⦿** sits among {@link BOTTOM_BAR_ROUTES} — index 2, the centre of
 * the five, exactly as the wireframe draws `▪ ▪ ⦿ ▪ ▪`.
 *
 * Counted against the *declared* routes rather than the resolved slots, so a
 * routed slot dropped by RBAC cannot slide Scan out of the middle.
 */
const SCAN_SLOT_INDEX = 2

/** One slot of the phone bar. Only `nav` slots carry a destination. */
export type BottomBarSlot =
  | { kind: 'nav'; section: NavSection }
  | { kind: 'scan' }
  | { kind: 'more' }

/**
 * The bar, built in wireframe order with Scan in the centre. Routed slots the
 * role cannot see are omitted rather than disabled — the same rule the sidebar
 * follows.
 *
 * Built **from** {@link BOTTOM_BAR_ROUTES}, not from a second copy of the same
 * three paths: this function used to re-type `'/today'`, `'/rentals'` and
 * `'/inventory'` inline, which left the exported list describing a bar it could
 * not affect and gave the two somewhere to disagree.
 */
export function bottomBarSlots(role: SystemRole | undefined): BottomBarSlot[] {
  const permitted = permittedNav(role)
  const slots: BottomBarSlot[] = []
  BOTTOM_BAR_ROUTES.forEach((to, i) => {
    if (i === SCAN_SLOT_INDEX) slots.push({ kind: 'scan' })
    const section = permitted.find((s) => s.to === to)
    if (section) slots.push({ kind: 'nav', section })
  })
  slots.push({ kind: 'more' })
  return slots
}

/**
 * What the phone **More** sheet lists, in `NAV` order.
 *
 * The wireframe says: *"Nav items 1, 3, 5, 6, 9, 10, 11 live under More."*
 * That is New Rental · Operation · Calendar · Crew Assist · Finance · Tools ·
 * Settings — seven of the eight items the five-slot bar cannot hold.
/**
 * What the phone **More** sheet lists.
 *
 * Phone 5-slot bar holds Dashboard, Rentals, Scan, Inventory, More.
 * Destinations outside the bar live under More:
 * Calendar · Operations · Clients · Crew Assist · Finance · Tools · Settings
 *
 * New Rental is removed — global creation lives under Header Create ▾.
 */
export const MORE_ROUTES: readonly string[] = [
  '/calendar',
  '/operations',
  '/clients',
  '/crew',
  '/finance',
  '/documents',
  '/reports/pulse',
  '/tools',
  '/settings',
]

/** The More sheet's contents for a role, resolved against `permittedAllNav()`. */
export function moreNav(role: SystemRole | undefined): NavSection[] {
  const permitted = permittedAllNav(role)
  return MORE_ROUTES.map((r) => permitted.find((s) => s.to === r)).filter(
    (s): s is NavSection => s !== undefined,
  )
}

/* ══ page tabs ═══════════════════════════════════════════════════════════ */

/**
 * Tabs are *views of one subject* and belong on the page, never in the sidebar.
 * Each entry records which spec file ruled on it — these changed with the
 * wireframes and none of them is a free choice.
 *
 * ## What this is, and what it is not
 *
 * **It is the specs' ruling, written down. No page reads it yet.** The rendered
 * strips still come from each module's own constant, and two of them have not
 * been brought to the updated specs:
 *
 * | route | rendered today | source | matches the spec? |
 * |---|---|---|---|
 * | `/inventory` | Inventory · Bundles · Sub Rental · Maintenance · Cases | `data/inventory.ts:96` → `modules/inventory/Inventory.tsx` | **no** — 5 tabs, and `07_INVENTORY.md` drops Sub-Rental and Cases and renames the first to Equipment |
 * | `/clients` | Clients · Membership · Referral · Credit | `data/membership.ts:16` → `modules/clients/Membership.tsx` | **no** — `08_CLIENTS.md` says "Directory only — no tabs" |
 * | `/settings` | see `data/settings.ts:81` | `modules/settings/Settings.tsx` | not ruled on here |
 *
 * So the name is `SPEC_TABS`, not `TABS`: a reader who finds it must not take it
 * for the thing on screen. Re-pointing the modules at it is page work, not shell
 * work — those tabs are whole subscreens (`modules/operations/SubRental.tsx`,
 * `modules/operations/CasesWorkspace.tsx`) that need somewhere to go before the
 * tab that reaches them is deleted, and `PLAN.md`'s module batches own that.
 * Until then this constant is the record of what those batches owe.
 */
export const SPEC_TABS: Record<string, string[]> = {
  /* `04_RENTALS.md` line 3 — "Bookings only. Productions removed. Sub-Rental is
     a filter chip." One list, no tabs at all; §4.1 draws the Sub-Rental chip in
     the filter row next to the table/cards toggle. */
  '/rentals': [],

  /* `07_INVENTORY.md` line 3 — "Tabs: Equipment · Bundles · Stock Check ·
     Maintenance." Line 4 disposes of the rest: "Warehouses moved to Settings.
     Sub-Rental and Cases dropped as duplicates" (§7 closing note repeats it —
     "Warehouses now lives in Settings ▸ Branches & Warehouses"). The first tab
     is "Equipment", not "Inventory" — the page is Inventory, the tab is what it
     lists. */
  '/inventory': ['Equipment', 'Bundles', 'Sub-Rentals', 'Stock Check', 'Maintenance'],

  /* Finance tabs: Dashboard · Invoices · Payments · Expenses · Closing · Reports.
     Documents is a dedicated primary module in Business & Back Office. */
  '/finance': ['Dashboard', 'Invoices', 'Payments', 'Expenses', 'Closing', 'Reports'],

  /* `08_CLIENTS.md` line 3 says "Directory only — no tabs." **Deliberately
     overridden, 12 Aug 2026 (user ruling).** Clients keeps Memberships.

     Do not "fix" this back by reading spec 08 literally — that has been tried.
     The override is narrow and the reasoning is: spec 08 relocates membership to
     the client record (§8.2, "level · benefits resolved") and spec 11 puts the
     plan matrix in Settings ▸ Financial (§11.2) — but neither of those is a home
     for the *plan catalogue* in `modules/clients/Membership.tsx` (PLANS,
     COMPARISON_ROWS, MEMBERS). Following the line literally would delete a
     working screen because nothing told the implementer where it went.

     Crew does leave this set: Crew Assist is nav item 6 with its own page, and a
     destination reachable two ways is the duplication the nav rules exist to
     prevent. See `WIREFRAME_RULINGS_2026-08-12.md` §5. */
  '/clients': ['Clients', 'Memberships'],
}

/**
 * **Where each Finance tab actually goes.**
 */
export const FINANCE_TAB_ROUTES: Readonly<Record<string, string | null>> = {
  /* Both are the Finance page itself — `Finance.tsx` switches between them in
     local state rather than by URL. */
  Dashboard: '/finance',
  Invoices: '/finance',
  /* §9.3 — `modules/finance/Payments.tsx`, added 12 Aug 2026. The receipt
     ledger with its deposits rail and the shared Record Payment modal, reading
     `payments` through `lib/queries/finance.ts`. */
  Payments: '/finance/payments',
  /* §9.4 — `modules/finance/Expenses.tsx`, added 12 Aug 2026. Reads `expenses`
     through `lib/queries/finance.ts`. */
  Expenses: '/finance/expenses',
  Closing: '/finance/closing',
  /* §9.6's catalog of 45 is not built; Pulse is the report index that exists. */
  Reports: '/reports/pulse',
}

/**
 * Sidebar footer — the operating branch, not the signed-in user.
 *
 * `vat` was `609876543` — the PAN the old renders show, and the Decisions doc
 * (8 Aug 2026, §1A + footer) rules the correct number is `623587106`,
 * asserting the wrong one appears "only in the renders, not in any markdown."
 * It was here too: live TypeScript, rendered in the Sidebar footer and in
 * Settings' VAT field, not a render and not markdown. supabase/migrations/
 * 0007_admin_security.sql and 0012_seed_data.sql already had the right number
 * — only this file was still carrying the wrong one forward.
 */
export const BRANCH = {
  name: 'Babin Rentals Pvt. Ltd.',
  address: 'Boudha, Kathmandu',
  vat: 'VAT: 623587106',
}

/*
 * REMOVED — `CURRENT_USER = { name: 'Ramesh Dulal', role: 'Owner', initials: 'RD' }`.
 *
 * It was documented as the "top-right identity chip", i.e. the signed-in user,
 * as a hardcoded constant. The header already reads the real session through
 * `useAuth()`, so the only thing still importing this was `data/settings.ts`,
 * which used it for the COMPANY's proprietor row — a different question
 * entirely, and one whose answer changed depending on who logged in.
 *
 * Not replaced: the signed-in user comes from `useAuth()`, and there is no
 * second source for it. A module-level constant cannot answer "who is looking
 * at this screen" and should not appear to.
 */

/** Single version source for the system settings view. */
export const APP_VERSION = 'Babin Rentals OS v3.0.0'
