import type { IconName } from '../components/ui/Icon'
import type { SystemRole } from '../types/database'
import { canViewMoney } from '../lib/rbac'

/**
 * The application's navigation tree — **the updated wireframes, "Shell —
 * identical on every page"**, repeated verbatim at the top of all eleven spec
 * files (`updated mds/01_NEW_RENTAL.md` lines 6–28 … `11_SETTINGS.md`).
 *
 * > **Nav (fixed, 11):** New Rental · Today · Operation · Rentals · Calendar ·
 * > Crew Assist · Inventory · Clients · Finance · Tools · Settings
 *
 * ## This supersedes Foundation v2.0 §5.1's "8 + Settings, hard ceiling"
 *
 * That ceiling is gone, and this file no longer argues for it. §5.1 was written
 * against a 15-item sidebar transcribed from the Generation C renders; the fix
 * at the time was to cut to eight and pin Settings below a divider so the array
 * could not quietly grow back. The updated wireframes are the newer artefact and
 * they state a different, equally explicit number: **eleven, in one flat list,
 * with Settings as item 11 inside it.** Eleven named destinations chosen by a
 * spec is not the fifteen-item drift §5.1 was defending against — it is a
 * decision, and this is the decision.
 *
 * Two consequences a future reader should not mistake for a mistake:
 *
 *  1. **Settings is item 11 of `NAV`**, not a separate pinned row. `SETTINGS_NAV`
 *     still exists and still points at *the same object*, so no surface can show
 *     a Settings entry that has drifted from the one in the list.
 *  2. **The nav is flat — no children anywhere.** Operation's five queues
 *     (`?queue=packing` …) were sidebar children; spec `03_OPERATION.md` §3.1
 *     makes them *filter chips on the /operations page*: "queue chips filter one
 *     time-ordered list". `NavChild` survives as a type only so a future spec
 *     that re-introduces nesting has somewhere to land.
 *
 * Scanner is still never a nav item: the wireframe keeps it a FAB "at every
 * width — not phone-only", plus a centre slot on the phone bar that triggers
 * that same FAB (see `components/shell/ScannerFab.tsx`).
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
}

/**
 * Declared before `NAV` and inserted into it by reference, so `SETTINGS_NAV`
 * and `NAV[10]` are one object. Anything else lets the two drift.
 */
const SETTINGS_SECTION: NavSection = { label: 'Settings', icon: 'settings', to: '/settings' }

/**
 * The fixed eleven, in the wireframe's order. The order is the specification —
 * do not sort, group, or re-rank by role.
 *
 * Note **"Operation"**, singular. Every one of the eleven spec files writes it
 * that way; the route stays `/operations` because that is what the router,
 * the breadcrumbs and every existing deep link already use.
 */
export const NAV: NavSection[] = [
  { label: 'New Rental', icon: 'plus', to: '/rentals/new' }, //      1
  { label: 'Today', icon: 'home', to: '/today' }, //                 2
  { label: 'Operation', icon: 'queues', to: '/operations' }, //      3
  { label: 'Rentals', icon: 'checklist', to: '/rentals' }, //        4
  { label: 'Calendar', icon: 'calendar', to: '/calendar' }, //       5
  { label: 'Crew Assist', icon: 'crew', to: '/crew' }, //            6
  { label: 'Inventory', icon: 'box', to: '/inventory' }, //          7
  { label: 'Clients', icon: 'users', to: '/clients' }, //            8
  { label: 'Finance', icon: 'card', to: '/finance' }, //             9
  { label: 'Tools', icon: 'tool', to: '/tools' }, //                10
  SETTINGS_SECTION, //                                              11
]

/**
 * Item 11, by reference.
 *
 * **No surface imports this today** — the sidebar renders `permittedNav()` and
 * the phone More sheet renders `moreNav()`, both of which reach Settings through
 * `NAV` like any other item, which is the point of folding it back in. It stays
 * exported as the deliberate handle for a surface that must name Settings
 * specifically (a "pin Settings last" affordance, a first-run wizard), because
 * the alternative such a surface reaches for is a fresh literal that drifts.
 * Since it *is* `NAV[10]` rather than a copy, a filter applied to `NAV` covers
 * it too.
 */
export const SETTINGS_NAV: NavSection = SETTINGS_SECTION

/**
 * The single filter every nav surface reads, so the sidebar, the phone bar and
 * the More sheet cannot drift into showing a different set for the same role.
 *
 * **Law 6 — money-blind roles must not see money surfaces.** The "fixed 11" is
 * the nav for a *permitted* role; it is not a bypass of RBAC. This filter is
 * unchanged from the pre-wireframe build and must stay: the test was
 * `role === 'Warehouse'` until 11 Aug 2026, which left Technician, Driver and
 * Client — the other three members of `lib/rbac.ts`'s `MONEY_BLIND` set —
 * holding a sidebar with Finance in it, shown and then refused by `App.tsx`'s
 * Shell guard. Asking `canViewMoney()` instead of naming a role means this
 * filter cannot fall out of step with the engine. The Shell guard stays as the
 * backstop for a typed URL, the one case nav omission cannot cover — and it
 * reads {@link isMoneySurface} too, so guard and nav cannot answer differently.
 */
export function permittedNav(role: SystemRole | undefined): NavSection[] {
  if (!role) return []
  if (!canViewMoney(role)) {
    return NAV.filter((s) => !isMoneySurface(s.to))
  }
  return NAV
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
  return best === null ? null : best.to
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
export const BOTTOM_BAR_ROUTES: readonly string[] = ['/today', '/rentals', '/inventory']

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
 *
 * TODO(decision) — **item 8 (Clients) is missing from the spec's own list.**
 * The bar holds items 2 (Today), 4 (Rentals) and 7 (Inventory). 11 − 3 = 8
 * overflow items, but the spec names only seven: 1, 3, 5, 6, 9, 10, 11.
 * Clients appears in neither the five slots nor the More list, which would make
 * `/clients` unreachable on a phone for every role — including Coordinator,
 * whose whole job is client-facing. This reads as an omission in the spec, not
 * an instruction to hide it, so Clients is listed here in its natural NAV
 * position (between Crew Assist and Finance) and flagged rather than silently
 * "fixed". The reversible choice is to show it: dropping a line is cheaper than
 * discovering a module is unreachable on the floor. **Ruling needed:** is
 * Clients meant to be in More, or was it meant to take a bar slot from
 * Inventory?
 */
export const MORE_ROUTES: readonly string[] = [
  '/rentals/new', //  1  New Rental
  '/operations', //   3  Operation
  '/calendar', //     5  Calendar
  '/crew', //         6  Crew Assist
  '/clients', //      8  Clients — TODO(decision) above; not in the spec's list
  '/finance', //      9  Finance
  '/tools', //       10  Tools
  '/settings', //    11  Settings
]

/** The More sheet's contents for a role, resolved against `permittedNav()`. */
export function moreNav(role: SystemRole | undefined): NavSection[] {
  const permitted = permittedNav(role)
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
  '/inventory': ['Equipment', 'Bundles', 'Stock Check', 'Maintenance'],

  /* `09_FINANCE.md` line 4 — "Dashboard · Invoices · Payments · Expenses ·
     Documents · Reports." Payments and Expenses are new tabs (§9.3, §9.4);
     "Audit" is gone — the audit log is a Tools card (`10_TOOLS.md` §10.4). */
  '/finance': ['Dashboard', 'Invoices', 'Payments', 'Expenses', 'Documents', 'Reports'],

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
 *
 * `SPEC_TABS['/finance']` above names the six tabs `09_FINANCE.md` line 4 rules.
 * It does not say where any of them LIVES, and on Finance that gap has already
 * cost something: `modules/finance/Finance.tsx`'s tab strip links Expenses to
 * `/reports/expenses`, which is the Expense **report** — twelve hand-typed rows
 * out of `src/data/expenseReports.ts` — rather than the ledger §9.4 specifies.
 * Two different screens, one tab, and nothing wrote down which is which.
 *
 * So this is the record: tab label → the route that serves it today, or `null`
 * where no screen exists. `null` is deliberate and must stay honest — pointing
 * an unbuilt tab at the nearest plausible page is exactly how Expenses came to
 * mean the report.
 *
 * ⚠ Like `SPEC_TABS`, **no page reads this yet**. `Finance.tsx` still holds its
 * own literal strip and is owned by another pass; re-pointing it is that pass's
 * work, and this is the one place it should read from when it does. Nothing here
 * routes anything on its own.
 */
export const FINANCE_TAB_ROUTES: Readonly<Record<string, string | null>> = {
  /* Both are the Finance page itself — `Finance.tsx` switches between them in
     local state rather than by URL. */
  Dashboard: '/finance',
  Invoices: '/finance',
  /* §9.3 — `modules/finance/Payments.tsx`, added 12 Aug 2026. The receipt
     ledger with its deposits rail and the shared Record Payment modal, reading
     `payments` through `lib/queries/finance.ts`. NOT `Finance.tsx`'s Dashboard
     payment-method breakdown, which is an aggregate over the same table and not
     the ledger §9.3 draws. Read-only by law: `payments` is immutable, so the
     screen records and reverses, and offers no edit. */
  Payments: '/finance/payments',
  /* §9.4 — `modules/finance/Expenses.tsx`, added 12 Aug 2026. Reads `expenses`
     through `lib/queries/finance.ts`. NOT `/reports/expenses`. */
  Expenses: '/finance/expenses',
  Documents: '/finance/documents',
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

/** Footer note bar, present on every deep screen. */
export const FOOTER_NOTE = {
  dates: 'All dates are shown in BS above AD',
  timezone: 'Timezone: Asia/Kathmandu (NPT)',
  version: 'Babin Rentals OS v3.0.0',
}
