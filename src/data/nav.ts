import type { IconName } from '../components/ui/Icon'
import type { SystemRole } from '../types/database'
import { canViewMoney } from '../lib/rbac'

/**
 * The application's navigation tree — **Foundation v2.0 §5.1**.
 *
 * > "Sidebar — 8 + Settings, hard ceiling… Any render showing 12–16 items is a
 * > defect."
 *
 * This file previously held **15 numbered sections**, transcribed from the
 * Generation C renders and defended in a comment as settling the conflict
 * against "Dashboard.md §15's 7 modules + Settings". v2.0 §0 explains why that
 * was backwards: the renders predate the nav reduction, so three different
 * sidebars exist across 106 screens and the build imported the widest one.
 * **The renders were the defect.**
 *
 * The nesting rule (§5.1): *"tabs for different views of one subject; sidebar
 * children for separate queues with separate owners."* Operations expands
 * because its five queues have different owners. Inventory and Finance do not,
 * so their sub-pages are tabs on one screen.
 *
 * **No numbering.** §5.1 lists the eight as plain names. The `01…15` chips came
 * from the Generation C renders, and they were doing real work back when there
 * were fifteen items to find. At eight they only add a second label to read, and
 * a number in the nav is a promise the rest of the product has to keep — the
 * breadcrumbs and page titles would have to agree with it forever. The field is
 * removed rather than hidden, so it cannot quietly return.
 *
 * Deliberately **not** here, per §5.1's exclusion list — each with where it went:
 *
 * | Was a section | Now |
 * |---|---|
 * | Documents · Reports · Payments · Expenses | Finance tabs |
 * | Administration | Settings |
 * | Automation Center · Notification Center | Settings |
 * | AI Assistant | Settings — §5.4: "AI panels stay dark until the feature is real" |
 * | System Monitor | Settings |
 * | Scanner | a FAB at every width (§5.5), never a nav item |
 *
 * Their routes still resolve; only the sidebar shrank. A destination reachable
 * two ways is the duplication §5.1 exists to prevent.
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

export const NAV: NavSection[] = [
  { label: 'Today', icon: 'home', to: '/today' },
  {
    label: 'Operations',
    icon: 'queues',
    to: '/operations',
    // §1.5 — four verbs, not five. Cleaning is inside Reset. Cases is a queue
    // with its own owner, so it is a child rather than a tab.
    children: [
      { label: 'Packing', to: '/operations?queue=packing' },
      { label: 'Handover', to: '/operations?queue=handover' },
      { label: 'Return & Inspection', to: '/operations?queue=return' },
      { label: 'Reset', to: '/operations?queue=reset' },
      { label: 'Cases', to: '/operations?queue=cases' },
    ],
  },
  { label: 'Rentals', icon: 'checklist', to: '/rentals' },
  { label: 'Crew Assist', icon: 'crew', to: '/crew' },
  { label: 'Inventory', icon: 'box', to: '/inventory' },
  { label: 'Calendar', icon: 'calendar', to: '/calendar' },
  /* §5.1 — "Clients (Memberships merged in)". Memberships is a tab, not a child. */
  { label: 'Clients', icon: 'users', to: '/clients' },
  { label: 'Finance', icon: 'card', to: '/finance' },
]

/** §5.1 — pinned below the divider, outside the eight. */
export const SETTINGS_NAV: NavSection = { label: 'Settings', icon: 'settings', to: '/settings' }

/**
 * The single filter both the Sidebar and the phone bottom bar read, so the two
 * surfaces cannot drift into showing a different set for the same role — the
 * exact failure mode §0 exists to prevent. The money-adjacent sections are the
 * only hard rule (they stay absent, not disabled); everything else stays
 * visible in `NAV` order and `bottomBarNav()` below picks a role-appropriate
 * subset of it for the phone bar.
 *
 * The test was `role === 'Warehouse'` until 11 Aug 2026, which left Technician,
 * Driver and Client — the other three members of `lib/rbac.ts`'s `MONEY_BLIND`
 * set — holding a full sidebar with Finance in it. `App.tsx`'s Shell caught the
 * click and rendered a `RestrictedState`, so the entry was shown, clicked, then
 * refused: exactly the shape Law 6 and Phase 3's RBAC item forbid. Asking
 * `canViewMoney()` instead of naming a role means this filter cannot fall out
 * of step with the engine, or with the Shell guard that reads the same
 * predicate. The Shell guard stays as the backstop for a typed URL, which is
 * the one case nav omission cannot cover.
 */
export function permittedNav(role: SystemRole | undefined): NavSection[] {
  if (!role) return []
  if (!canViewMoney(role)) {
    return NAV.filter((s) => !MONEY_ADJACENT_ROUTES.includes(s.to))
  }
  return NAV
}

/**
 * Routes withheld from money-blind roles. `/reports` and `/admin` are not in
 * `NAV` today (§5.1 folded them into Finance tabs and Settings), but they are
 * kept here so that restoring either as a section cannot silently restore it
 * for the floor as well.
 */
const MONEY_ADJACENT_ROUTES: readonly string[] = ['/finance', '/reports', '/admin']

/**
 * Phone bottom bar item order per role — DEVICES.md §4: "the phone bottom bar
 * is built from permissions... so a Driver's bar is not a Coordinator's."
 * Curated with the user directly on 8 Aug 2026 (three routes per role, from
 * DEVICES.md §3's device-per-role table): floor roles get Operations +
 * Inventory over Rentals/Clients, money-facing roles get Finance, Driver gets
 * Calendar for the day's schedule instead of a client-facing surface.
 * `Settings` is added separately in `BottomBar.tsx` — it sits outside `NAV`
 * by design (§5.1) and stays reachable for every role.
 */
export const BOTTOM_BAR_ROUTES: Record<SystemRole, string[]> = {
  Owner: ['/today', '/operations', '/finance'],
  Admin: ['/today', '/operations', '/finance'],
  // Reopened 9 Aug 2026 (Hover Intel System v2.1) — Manager mirrors Admin
  // everywhere unless a spec states otherwise; see types/database.ts.
  Manager: ['/today', '/operations', '/finance'],
  Coordinator: ['/today', '/rentals', '/clients'],
  Warehouse: ['/today', '/operations', '/inventory'],
  Technician: ['/today', '/operations', '/inventory'],
  Accounts: ['/today', '/finance', '/rentals'],
  Driver: ['/today', '/operations', '/calendar'],
  // Client is external-portal-only (never a staff surface — lib/rbac.ts) and
  // should never actually reach this Shell; kept only as a safe fallback.
  Client: ['/today', '/rentals', '/clients'],
}

/** Resolves a role's curated routes against `permittedNav()`, so a route a role can't see (e.g. Warehouse + Finance) can never appear even if the table above is wrong. */
export function bottomBarNav(role: SystemRole | undefined): NavSection[] {
  if (!role) return []
  const routes = BOTTOM_BAR_ROUTES[role] ?? BOTTOM_BAR_ROUTES.Coordinator
  const permitted = permittedNav(role)
  return routes
    .map((r) => permitted.find((s) => s.to === r))
    .filter((s): s is NavSection => s !== undefined)
}

/**
 * Tabs, per §5.1's nesting rule. These are views of one subject and belong on
 * the page, never in the sidebar.
 */
export const TABS: Record<string, string[]> = {
  '/rentals': ['Bookings', 'Productions', 'Sub-Rental'],
  '/inventory': ['Inventory', 'Bundles', 'Sub Rental', 'Maintenance', 'Cases'],
  '/finance': ['Payments', 'Expenses', 'Documents', 'Reports', 'Audit'],
  '/clients': ['Clients', 'Memberships', 'Crew'],
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

/** Top-right identity chip. */
export const CURRENT_USER = { name: 'Ramesh Dulal', role: 'Owner', initials: 'RD' }

/** Footer note bar, present on every deep screen. */
export const FOOTER_NOTE = {
  dates: 'All dates are shown in BS above AD',
  timezone: 'Timezone: Asia/Kathmandu (NPT)',
  version: 'Babin Rentals OS v3.0.0',
}
