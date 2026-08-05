import type { Kpi } from '../components/ui/Page'
import type { Slice } from '../components/ui/Charts'

/**
 * Numbering Sequences seed data — transcribed from render `CD132C04`.
 *
 * This render is also the authority on ID formats. It confirms `BK-YYYY-NNNNN`
 * for bookings — the form used throughout the app — and shows that a branch
 * code may be inserted (`BK-2026-05-KTM-004862`) when scope is Per Branch.
 */

export const KPIS: Kpi[] = [
  { label: 'Active Sequences', value: '18', icon: 'queues', accent: 'primary', note: 'View all' },
  { label: 'Records Generated Today', value: '486', icon: 'checklist', accent: 'success', delta: { direction: 'up', text: '18% vs yesterday' } },
  { label: 'Last Sequence Used', value: 'BK-2026-004861', icon: 'file', accent: 'primary', note: '2 mins ago' },
  { label: 'Duplicate IDs', value: '0', icon: 'alert_triangle', accent: 'danger', note: 'No duplicates' },
  { label: 'Auto Reset Rules', value: '9', icon: 'refresh', accent: 'progress', note: 'View rules' },
  { label: 'Sequence Health', value: '100%', icon: 'activity', accent: 'success', note: 'All good' },
]

export const CATEGORIES: Array<{ name: string; count: string; icon: 'queues' | 'calendar' | 'dollar' | 'box' | 'crew' | 'settings' }> = [
  { name: 'All Sequences', count: '18', icon: 'queues' },
  { name: 'Rental', count: '4', icon: 'calendar' },
  { name: 'Finance', count: '6', icon: 'dollar' },
  { name: 'Inventory', count: '6', icon: 'box' },
  { name: 'Operations', count: '6', icon: 'crew' },
  { name: 'Administration', count: '5', icon: 'settings' },
  { name: 'All Categories', count: '18', icon: 'queues' },
]

export interface SequenceRow {
  code: string
  name: string
  prefix: string
  format: string
  counter: string
  resetRule: string
  scope: string
}

export const SEQUENCES: SequenceRow[] = [
  { code: 'BK', name: 'Booking', prefix: 'BK', format: 'BK-YYYY-NNNNN', counter: '004861', resetRule: 'Calendar Year', scope: 'Per Branch' },
  { code: 'INV', name: 'Invoice', prefix: 'INV', format: 'INV-BR-YYYY-NNNN', counter: '00492', resetRule: 'Calendar Year', scope: 'Per Branch' },
  { code: 'CL', name: 'Client', prefix: 'CL', format: 'CL-YYYY-NNNNN', counter: '002481', resetRule: 'Never', scope: 'Global' },
  { code: 'EQ', name: 'Equipment', prefix: 'EQ', format: 'EQ-CAT-NNNNNN', counter: '000824', resetRule: 'Never', scope: 'Global' },
  { code: 'MT', name: 'Maintenance', prefix: 'MT', format: 'MT-YYYY-NNNNN', counter: '00054', resetRule: 'Nepali Fiscal Year', scope: 'Per Branch' },
  { code: 'CASE', name: 'Incident Case', prefix: 'CASE', format: 'CASE-YYYY-NNNNN', counter: '00182', resetRule: 'Calendar Year', scope: 'Per Branch' },
  { code: 'PAY', name: 'Payment', prefix: 'PAY', format: 'PAY-YYYY-NNNNN', counter: '006103', resetRule: 'Calendar Year', scope: 'Per Branch' },
  { code: 'EXP', name: 'Expense', prefix: 'EXP', format: 'EXP-YYYY-NNNNNN', counter: '00276', resetRule: 'Calendar Year', scope: 'Per Branch' },
  { code: 'PUR', name: 'Purchase', prefix: 'PUR', format: 'PUR-YYYY-NNNNN', counter: '00153', resetRule: 'Calendar Year', scope: 'Per Branch' },
  { code: 'TRF', name: 'Transfer', prefix: 'TRF', format: 'TRF-YYYY-NNNNN', counter: '00092', resetRule: 'Calendar Year', scope: 'Per Branch' },
]

export const PREVIEW = {
  sequence: 'BK – Booking',
  branch: 'Kathmandu',
  warehouse: 'Main Warehouse',
  parts: [
    { label: 'PREFIX', value: 'BK', tone: 'primary' as const },
    { label: 'YEAR', value: '2026', tone: 'success' as const },
    { label: 'MONTH', value: '05', tone: 'primary' as const },
    { label: 'SEPARATOR', value: 'KTM', tone: 'progress' as const },
    { label: 'COUNTER', value: '004862', tone: 'primary' as const },
  ],
  live: 'BK-2026-05-KTM-004862',
  next: 'BK-2026-05-KTM-004862',
  counter: '004861',
  padding: '6',
  totalLength: '19',
  note: 'Preview updates automatically when configuration changes.',
}

export const CONFIG_TABS = ['General', 'Format', 'Reset Rules', 'Scope', 'Advanced']

export const CONFIG_FIELDS = [
  { label: 'Sequence Name', value: 'Booking', required: true },
  { label: 'Code', value: 'BK', required: true },
  { label: 'Description', value: 'Rental booking references' },
  { label: 'Prefix', value: 'BK' },
  { label: 'Suffix (Optional)', value: '' },
  { label: 'Starting Number', value: '1', required: true },
  { label: 'Padding Length', value: '6', required: true },
  { label: 'Separator', value: '-', select: true },
]

export const ANALYTICS = {
  generated: { value: '12,856', note: 'This Month', delta: '24% vs last month' },
  dailyTrend: {
    yTicks: ['3K', '2K', '1K', '0'],
    avg: 'Avg. 1,836/day',
    bars: [
      { label: 'Tue', v: 58 },
      { label: 'Wed', v: 44 },
      { label: 'Thu', v: 66 },
      { label: 'Fri', v: 72 },
      { label: 'Sat', v: 54 },
      { label: 'Sun', v: 78 },
      { label: 'Mon', v: 88 },
    ],
  },
  topSequences: [
    { name: 'BK – Booking', value: '5,812', pct: 100 },
    { name: 'INV – Invoice', value: '3,246', pct: 56 },
    { name: 'PAY – Payment', value: '1,256', pct: 22 },
    { name: 'EQ – Equipment', value: '1,102', pct: 19 },
    { name: 'CASE – Case', value: '682', pct: 12 },
  ],
  resetHistory: {
    total: '17',
    rows: [
      { name: 'BK – Booking', rule: 'Calendar Year', at: '2082-01-01' },
      { name: 'INV – Invoice', rule: 'Calendar Year', at: '2082-01-01' },
      { name: 'MT – Maintenance', rule: 'Nepali Fiscal Year', at: '2082-01-16' },
      { name: 'EXP – Expense', rule: 'Calendar Year', at: '2082-01-01' },
      { name: 'PAY – Payment', rule: 'Calendar Year', at: '2082-01-01' },
    ],
  },
  branchMix: [
    { label: 'Kathmandu', value: 7421, display: '58%', percent: '(7,421)' },
    { label: 'Pokhara', value: 3213, display: '25%', percent: '(3,213)' },
    { label: 'Butwal', value: 1542, display: '12%', percent: '(1,542)' },
    { label: 'Bharatpur', value: 680, display: '5%', percent: '(680)' },
  ] as Slice[],
}

export const SUMMARY = [
  { label: 'Active Sequences', value: '18' },
  { label: 'Archived Sequences', value: '3' },
  { label: 'Records Generated', value: '12,856' },
  { label: 'Last Generated', value: '2 mins ago' },
  { label: 'Health Score', value: '100%' },
]

export const ALERTS = [
  { text: 'Counter Near Limit', count: '0' },
  { text: 'Duplicate Prefix Risk', count: '0' },
  { text: 'Failed Resets', count: '0' },
  { text: 'Disabled Sequences', count: '0' },
  { text: 'Configuration Conflicts', count: '0' },
]

export const QUICK_ACTIONS: Array<{ label: string; icon: 'plus' | 'refresh' | 'download' | 'tool'; tone: 'primary' | 'success' | 'progress' | 'primary' }> = [
  { label: 'Add Sequence', icon: 'plus', tone: 'primary' },
  { label: 'Reset Counter', icon: 'refresh', tone: 'success' },
  { label: 'Export Config', icon: 'download', tone: 'progress' },
  { label: 'Test Sequence', icon: 'tool', tone: 'primary' },
]

export const ACTIVITY = [
  { what: 'Sequence Created', detail: 'TRF – Transfer sequence created', at: 'Today, 10:24 AM' },
  { what: 'Counter Reset', detail: 'BK – Booking counter reset to 1', at: 'Today, 09:15 AM' },
  { what: 'Configuration Updated', detail: 'INV – Invoice format updated', at: 'Yesterday, 04:32 PM' },
  { what: 'Prefix Changed', detail: 'EXP – Prefix changed from EX to EXP', at: 'Yesterday, 11:05 AM' },
]

export const INSIGHTS = [
  'All sequences are healthy.',
  'No unused sequences detected.',
  'Consider adding branch code to EQ.',
  'MT sequence reset will occur in 24 days.',
  'Optimal padding length configured.',
]
