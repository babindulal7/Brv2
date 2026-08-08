import type { IconName } from '../components/ui/Icon'
import type { Slice } from '../components/ui/Charts'
import type { StatusKey } from '../lib/status'
import { rupees, formatMoney, roundHalfUp, grouped } from '../lib/money'
import type { Paisa } from '../lib/money'
import { BRANCH, CURRENT_USER, FOOTER_NOTE } from './nav'

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
 *  · the render's System Summary reads `v3.2.0`. The footer bar on the same
 *    page reads v3.0.0 from `nav.FOOTER_NOTE`; the version is read from there
 *    so the page cannot state two versions of itself.
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

export type TabKey =
  | 'overview'
  | 'organization'
  | 'branches'
  | 'users'
  | 'system'
  | 'financial'
  | 'integrations'
  | 'communication'
  | 'security'
  | 'ai'

export interface TabDef {
  key: TabKey
  label: string
  /** Money end to end. Omitted outright for a money-blind session (§8.3). */
  money: boolean
}

/**
 * `Organization.md` §Navigation Tabs lists nine. **Branches** is the tenth, and
 * it is not a liberty: §5.1 removed the sidebar's Administration section, which
 * is the only place either render offers Branch Management. A built screen with
 * no way to it is the same defect as a link with nowhere to go.
 */
export const TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', money: false },
  { key: 'organization', label: 'Organization', money: false },
  { key: 'branches', label: 'Branches', money: false },
  { key: 'users', label: 'Users & Roles', money: false },
  { key: 'system', label: 'System', money: false },
  { key: 'financial', label: 'Financial', money: true },
  { key: 'integrations', label: 'Integrations', money: false },
  { key: 'communication', label: 'Communication', money: false },
  { key: 'security', label: 'Security', money: false },
  { key: 'ai', label: 'AI & Automation', money: false },
]

export function isTabKey(v: string | null): v is TabKey {
  return TABS.some((t) => t.key === v)
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
  { label: 'Phone', value: '+977 985-1234567', icon: 'phone' },
  { label: 'Email', value: 'info@babinrentals.com', icon: 'mail' },
  { label: 'Website', value: 'www.babinrentals.com', icon: 'external_link' },
  { label: 'Company type', value: 'Private Limited Company', icon: 'briefcase' },
  { label: 'Owner', value: `${CURRENT_USER.name} · ${CURRENT_USER.role}`, icon: 'crew' },
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
    phone: '+977 985-1234567',
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
    phone: '+977 984-5678901',
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
    phone: '+977 981-2345678',
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
  { label: 'Open Cases', count: 8, tone: 'primary', icon: 'flag', dest: { kind: 'route', to: '/operations/cases' } },
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
    dest: { kind: 'tab', tab: 'users' },
  },
  {
    text: '2 numbering sequences running low',
    priority: 'Medium',
    icon: 'timer',
    dest: { kind: 'route', to: '/admin/numbering' },
  },
  { text: 'VAT return due in 15 days', priority: 'Medium', icon: 'receipt', dest: { kind: 'tab', tab: 'financial' } },
  {
    text: 'WhatsApp token expires in 7 days',
    priority: 'Low',
    icon: 'phone',
    dest: { kind: 'tab', tab: 'communication' },
  },
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

/* ── AI branch insights ────────────────────────────────────────────────── */

export interface Insight {
  text: string
  icon: IconName
  /** Reads out a revenue ranking, so it is omitted for a money-blind session. */
  money: boolean
}

export const BRANCH_INSIGHTS: Insight[] = [
  { text: 'Head Office — Boudha is the top performing branch.', icon: 'chart', money: true },
  { text: 'Pokhara Branch utilization is low. Consider marketing.', icon: 'activity', money: false },
  { text: 'Transfer more lighting equipment to Lalitpur Branch.', icon: 'truck', money: false },
  { text: 'Staff level in Pokhara Branch may need to increase.', icon: 'users', money: false },
]

/* ── system summary ────────────────────────────────────────────────────── */

export interface SummaryRow {
  label: string
  value: string
  tone: 'default' | 'good' | 'warn'
}

/**
 * The version is read from `nav.FOOTER_NOTE`, which the footer bar on this same
 * page also renders. The render hard-codes `v3.2.0` here and the product would
 * have stated two versions of itself in one viewport.
 */
export const SYSTEM_SUMMARY: SummaryRow[] = [
  { label: 'System version', value: FOOTER_NOTE.version.split(' ').pop() ?? '', tone: 'default' },
  { label: 'Database', value: 'Healthy', tone: 'good' },
  { label: 'Storage used', value: '246.8 GB / 1 TB', tone: 'default' },
  { label: 'Backup status', value: 'Successful', tone: 'good' },
  { label: 'Last backup', value: 'Today, 02:15 AM', tone: 'default' },
  { label: 'Next scheduled backup', value: 'Tomorrow, 02:00 AM', tone: 'default' },
  { label: 'Environment', value: 'Production', tone: 'default' },
  { label: 'Active sessions', value: '12', tone: 'default' },
]

/** The one figure the Overview KPI strip needs that no branch row carries. */
export const SYSTEM_STATS = { activeUsers: 28, uptime: '99.98%', activeSessions: 12 }

/* ── quick access ──────────────────────────────────────────────────────── */

export interface QuickAccessCard {
  label: string
  icon: IconName
  dest: Dest
}

/** §Quick Access — twelve shortcut cards, in the render's order. */
export const QUICK_ACCESS: QuickAccessCard[] = [
  { label: 'Branch Management', icon: 'home', dest: { kind: 'tab', tab: 'branches' } },
  { label: 'Warehouse Management', icon: 'box', dest: { kind: 'route', to: '/inventory/warehouses' } },
  { label: 'Staff & Roles', icon: 'users', dest: { kind: 'tab', tab: 'users' } },
  { label: 'Permissions Matrix', icon: 'crew', dest: { kind: 'tab', tab: 'users' } },
  {
    label: 'Approval Workflows',
    icon: 'checklist',
    dest: { kind: 'none', why: 'Approval workflows have no screen in this build.' },
  },
  { label: 'Numbering Sequences', icon: 'invoice', dest: { kind: 'route', to: '/admin/numbering' } },
  {
    label: 'Business Hours & Holidays',
    icon: 'timer',
    dest: { kind: 'none', why: 'The holiday calendar has no screen in this build.' },
  },
  { label: 'Taxes (VAT)', icon: 'receipt', dest: { kind: 'tab', tab: 'financial' } },
  { label: 'Payment Gateways', icon: 'card', dest: { kind: 'tab', tab: 'integrations' } },
  { label: 'Email & SMS Settings', icon: 'mail', dest: { kind: 'tab', tab: 'communication' } },
  { label: 'WhatsApp Integration', icon: 'phone', dest: { kind: 'tab', tab: 'communication' } },
  { label: 'Backup & Restore', icon: 'download', dest: { kind: 'route', to: '/admin/backup' } },
]

/* ── administration modules grid ───────────────────────────────────────── */

export interface ModuleRow {
  label: string
  dest: Dest
}

export interface ModuleGroup {
  title: string
  icon: IconName
  rows: ModuleRow[]
}

const NO = (why: string): Dest => ({ kind: 'none', why })
const TO = (to: string): Dest => ({ kind: 'route', to })
const TAB = (tab: TabKey): Dest => ({ kind: 'tab', tab })

/**
 * §Administration Modules — sixteen groups of five, exactly the render's grid
 * and exactly its ordering. Rows whose screen does not exist are **not links**:
 * they render as a stated `Not built` row, because a control that silently does
 * nothing is worse than one that says it cannot.
 */
export const MODULE_GROUPS: ModuleGroup[] = [
  {
    title: 'Organization',
    icon: 'briefcase',
    rows: [
      { label: 'Organization Profile', dest: TAB('organization') },
      { label: 'Company Information', dest: TAB('organization') },
      { label: 'Logo & Branding', dest: NO('There is no brand-asset manager in this build.') },
      { label: 'Document Settings', dest: TO('/documents') },
      { label: 'Business Description', dest: TAB('organization') },
    ],
  },
  {
    title: 'Branch Management',
    icon: 'home',
    rows: [
      { label: 'All Branches', dest: TAB('branches') },
      { label: 'Add New Branch', dest: TAB('branches') },
      { label: 'Branch Settings', dest: TAB('branches') },
      { label: 'Branch Users', dest: TAB('users') },
      { label: 'Branch Documents', dest: TO('/documents') },
    ],
  },
  {
    title: 'Warehouse Management',
    icon: 'box',
    rows: [
      { label: 'All Warehouses', dest: TO('/inventory/warehouses') },
      { label: 'Add New Warehouse', dest: NO('Warehouses are created by an Owner in the facility tree; no form exists yet.') },
      { label: 'Warehouse Zones', dest: TO('/inventory/warehouses') },
      { label: 'Warehouse Users', dest: TO('/inventory/warehouses') },
      { label: 'Stock Transfer Rules', dest: NO('Transfer rules have no screen in this build.') },
    ],
  },
  {
    title: 'Users & Roles',
    icon: 'users',
    rows: [
      { label: 'All Users', dest: TAB('users') },
      { label: 'Add New User', dest: NO('User provisioning needs the auth backend, which is not connected.') },
      { label: 'User Roles', dest: TAB('users') },
      { label: 'Role Management', dest: TAB('users') },
      { label: 'Role Hierarchy', dest: TAB('users') },
    ],
  },
  {
    title: 'Permissions & Security',
    icon: 'crew',
    rows: [
      { label: 'Permissions Matrix', dest: TAB('users') },
      { label: 'Module Permissions', dest: TAB('users') },
      { label: 'Data Access Levels', dest: TAB('security') },
      { label: 'IP Access Control', dest: NO('IP allow-listing is enforced server side; no console exists yet.') },
      { label: 'Two-Factor Authentication', dest: TAB('security') },
    ],
  },
  {
    title: 'Teams & Departments',
    icon: 'users',
    rows: [
      { label: 'All Teams', dest: TO('/crew') },
      { label: 'All Departments', dest: NO('Departments have no screen in this build.') },
      { label: 'Team Members', dest: TO('/crew') },
      { label: 'Department Heads', dest: NO('Departments have no screen in this build.') },
      { label: 'Reporting Structure', dest: TAB('users') },
    ],
  },
  {
    title: 'Approval Workflows',
    icon: 'checklist',
    rows: [
      { label: 'Workflow List', dest: NO('Approval workflows have no screen in this build.') },
      { label: 'Create Workflow', dest: NO('Approval workflows have no screen in this build.') },
      { label: 'Workflow Stages', dest: NO('Approval workflows have no screen in this build.') },
      { label: 'Approval Levels', dest: NO('Approval workflows have no screen in this build.') },
      { label: 'Escalation Rules', dest: TO('/automation') },
    ],
  },
  {
    title: 'Numbering Sequences',
    icon: 'invoice',
    rows: [
      { label: 'Booking Numbers (BK-)', dest: TO('/admin/numbering') },
      { label: 'Equipment Codes (EQ-)', dest: TO('/admin/numbering') },
      { label: 'Maintenance (MT-)', dest: TO('/admin/numbering') },
      { label: 'Cases (CASE-)', dest: TO('/admin/numbering') },
      { label: 'Invoices (INV-)', dest: TO('/admin/numbering') },
    ],
  },
  {
    title: 'System Configuration',
    icon: 'settings',
    rows: [
      { label: 'System Preferences', dest: TAB('system') },
      { label: 'General Settings', dest: TAB('organization') },
      { label: 'Date & Time Formats', dest: TAB('organization') },
      { label: 'Decimal & Currency', dest: TAB('organization') },
      { label: 'System Maintenance', dest: TO('/system') },
    ],
  },
  {
    title: 'Financial Settings',
    icon: 'card',
    rows: [
      { label: 'Taxes (VAT)', dest: TAB('financial') },
      { label: 'Fiscal Year', dest: TAB('financial') },
      { label: 'Currencies', dest: TAB('financial') },
      { label: 'Payment Terms', dest: TAB('financial') },
      { label: 'Late Payment Penalties', dest: TAB('financial') },
    ],
  },
  {
    title: 'Communication Settings',
    icon: 'mail',
    rows: [
      { label: 'Email Settings', dest: TAB('communication') },
      { label: 'SMS Settings', dest: TO('/notifications/sms') },
      { label: 'WhatsApp Settings', dest: TAB('communication') },
      { label: 'Notification Templates', dest: TO('/notifications') },
      { label: 'Communication Preferences', dest: TAB('communication') },
    ],
  },
  {
    title: 'Backup & Restore',
    icon: 'download',
    rows: [
      { label: 'Backup Settings', dest: TO('/admin/backup') },
      { label: 'Manual Backup', dest: TO('/admin/backup') },
      { label: 'Backup History', dest: TO('/admin/backup') },
      { label: 'Restore Data', dest: TO('/admin/backup') },
      { label: 'Disaster Recovery', dest: TO('/admin/backup') },
    ],
  },
  {
    title: 'Integrations',
    icon: 'plug',
    rows: [
      { label: 'Payment Gateways', dest: TAB('integrations') },
      { label: 'Accounting Integrations', dest: TAB('integrations') },
      { label: 'Calendar Integrations', dest: TAB('integrations') },
      { label: 'Third Party Apps', dest: TAB('integrations') },
      { label: 'API & Webhooks', dest: TAB('integrations') },
    ],
  },
  {
    title: 'Audit & Logs',
    icon: 'file',
    rows: [
      { label: 'Audit Settings', dest: TO('/admin/audit') },
      { label: 'Audit Logs', dest: TO('/admin/audit') },
      { label: 'Login History', dest: NO('Login history needs the auth backend, which is not connected.') },
      { label: 'Data Change Logs', dest: TO('/admin/audit') },
      { label: 'User Activity Logs', dest: TO('/admin/audit') },
    ],
  },
  {
    title: 'Localization',
    icon: 'calendar',
    rows: [
      { label: 'Languages', dest: TAB('organization') },
      { label: 'Translations', dest: NO('The translation catalogue has no screen in this build.') },
      { label: 'Nepali (BS) Calendar', dest: TAB('organization') },
      { label: 'Regional Settings', dest: TAB('organization') },
      { label: 'Units & Measurements', dest: TAB('organization') },
    ],
  },
  {
    title: 'AI & Automation',
    icon: 'sparkles',
    rows: [
      { label: 'AI Settings', dest: TAB('ai') },
      { label: 'AI Models', dest: TAB('ai') },
      { label: 'Automation Settings', dest: TO('/automation') },
      { label: 'AI Data Training', dest: NO('Model training happens off-platform; there is no screen for it.') },
      { label: 'AI Usage Logs', dest: TO('/ai') },
    ],
  },
]

/* ── rail quick actions ────────────────────────────────────────────────── */

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

  return errs
})()
