import type { Kpi } from '../components/ui/Page'
import type { Slice } from '../components/ui/Charts'

/**
 * Expense Reports seed data — transcribed from render `09168AC3`.
 *
 * Every figure below is read off that render rather than invented, so the built
 * screen can be diffed against it. Amounts use South Asian lakh grouping
 * (`Rs 18,72,500`, never `Rs 1,872,500`).
 *
 * NOT wired to Supabase.
 */

export const PERIOD_CHIPS = [
  'Today',
  'Yesterday',
  'This Week',
  'Last Week',
  'Last 7 Days',
  'Last 30 Days',
  'Last 90 Days',
  'This Month',
  'Last Month',
  'This Quarter',
  'This Year',
  'Last Year',
  'Financial Year',
  'Custom',
]

export const FILTERS = [
  'All Expense Categories',
  'All Vendors',
  'All Branches',
  'All Staff',
  'All Payment Methods',
  'All Status',
]

export const KPIS: Kpi[] = [
  {
    label: 'Total Expenses',
    value: 'Rs 18,72,500',
    icon: 'receipt',
    accent: 'primary',
    delta: { direction: 'down', text: '8.4% vs last month', good: true },
    spark: [42, 55, 38, 61, 47, 70, 52, 64, 58, 73, 61, 55],
  },
  {
    label: 'Total Transactions',
    value: '246',
    icon: 'checklist',
    accent: 'primary',
    delta: { direction: 'up', text: '12.6% vs last month', good: true },
    spark: [30, 45, 40, 52, 48, 60, 55, 68, 62, 71, 66, 74],
  },
  {
    label: 'Monthly Budget',
    value: 'Rs 25,00,000',
    icon: 'dollar',
    accent: 'primary',
    note: '75.0% of budget used',
    spark: [50, 52, 49, 55, 53, 58, 56, 61, 59, 63, 60, 64],
  },
  {
    label: 'Pending Approvals',
    value: '9',
    icon: 'alert_triangle',
    accent: 'danger',
    note: 'Rs 1,35,000',
    spark: [30, 42, 36, 50, 44, 58, 47, 61, 53, 66, 58, 62],
  },
]

/** Expense Trend — one series, so no legend box; the card title names it. */
export const TREND = {
  points: [180, 240, 210, 320, 290, 380, 350, 460, 420, 560, 610, 720, 690, 830, 960],
  labels: ['1 May', '6 May', '11 May', '16 May', '21 May', '26 May', '31 May'],
  yTicks: ['0', '200K', '400K', '600K', '800K', '1M'],
}

export const BY_CATEGORY: Slice[] = [
  { label: 'Equipment Purchase', value: 524000, display: 'Rs 5,24,000', percent: '28.0%' },
  { label: 'Office Expenses', value: 318500, display: 'Rs 3,18,500', percent: '17.0%' },
  { label: 'Salaries & Wages', value: 275000, display: 'Rs 2,75,000', percent: '14.7%' },
  { label: 'Maintenance', value: 180000, display: 'Rs 1,80,000', percent: '9.6%' },
  { label: 'Marketing', value: 125000, display: 'Rs 1,25,000', percent: '6.7%' },
  { label: 'Transport', value: 98000, display: 'Rs 98,000', percent: '5.2%' },
  { label: 'Utilities', value: 75000, display: 'Rs 75,000', percent: '4.0%' },
  { label: 'Others', value: 76000, display: 'Rs 76,000', percent: '4.1%' },
]

export const BY_METHOD: Slice[] = [
  { label: 'Bank Transfer', value: 1042000, display: 'Rs 10,42,000', percent: '55.6%' },
  { label: 'Cash', value: 485000, display: 'Rs 4,85,000', percent: '25.9%' },
  { label: 'eSewa', value: 162000, display: 'Rs 1,62,000', percent: '8.6%' },
  { label: 'Khalti', value: 112000, display: 'Rs 1,12,000', percent: '6.0%' },
  { label: 'Card', value: 48500, display: 'Rs 48,500', percent: '2.6%' },
  { label: 'Others', value: 23000, display: 'Rs 23,000', percent: '1.3%' },
]

export const AGEING: Slice[] = [
  { label: 'Current (0–7 Days)', value: 1242000, display: 'Rs 12,42,000', percent: '66.4%' },
  { label: '8–30 Days', value: 428000, display: 'Rs 4,28,000', percent: '22.9%' },
  { label: '31–60 Days', value: 135000, display: 'Rs 1,35,000', percent: '7.2%' },
  { label: '61–90 Days', value: 52000, display: 'Rs 52,000', percent: '2.8%' },
  { label: '90+ Days', value: 15500, display: 'Rs 15,500', percent: '0.8%' },
]

export const APPROVAL: Slice[] = [
  { label: 'Approved', value: 1737500, display: 'Rs 17,37,500', percent: '92.8%' },
  { label: 'Pending', value: 135000, display: 'Rs 1,35,000', percent: '7.2%' },
  { label: 'Rejected', value: 0, display: 'Rs 0', percent: '0%' },
]

export const BUDGET_VS_ACTUAL = {
  series: ['Budget (Rs)', 'Actual (Rs)'],
  yTicks: ['0', '1M', '2M', '3M', '4M'],
  groups: [
    { label: 'Jan', values: [25, 21] },
    { label: 'Feb', values: [25, 23] },
    { label: 'Mar', values: [25, 19] },
    { label: 'Apr', values: [25, 24] },
    { label: 'May', values: [25, 19] },
    { label: 'Jun', values: [28, 26] },
    { label: 'Jul', values: [28, 22] },
    { label: 'Aug', values: [30, 27] },
    { label: 'Sep', values: [30, 25] },
    { label: 'Oct', values: [32, 30] },
    { label: 'Nov', values: [32, 28] },
    { label: 'Dec', values: [35, 31] },
  ],
}

export const BY_BRANCH = {
  axisTicks: ['0', '2.5L', '5L', '7.5L', '10L'],
  rows: [
    { label: 'Boudha (Head Office)', value: 985000, display: 'Rs 9,85,000' },
    { label: 'Thamel Branch', value: 485000, display: 'Rs 4,85,000' },
    { label: 'Patan Branch', value: 215000, display: 'Rs 2,15,000' },
    { label: 'Pokhara Branch', value: 112000, display: 'Rs 1,12,000' },
    { label: 'Butwal Branch', value: 75500, display: 'Rs 75,500' },
  ],
}

export interface ExpenseRow {
  bs: string
  ad: string
  ref: string
  category: string
  vendor: string
  branch: string
  method: string
  amount: string
  status: 'Approved' | 'Pending' | 'Rejected'
  approvedBy: string
}

export const TRANSACTIONS: ExpenseRow[] = [
  { bs: '2081-02-01', ad: '14 May 2024', ref: 'EXP-2505-001', category: 'Equipment Purchase', vendor: 'Camera Accessories Nepal', branch: 'Boudha', method: 'Bank Transfer', amount: '2,48,000', status: 'Approved', approvedBy: 'Ramesh Dulal' },
  { bs: '2081-02-02', ad: '15 May 2024', ref: 'EXP-2505-002', category: 'Office Expenses', vendor: 'Office Supplier Nepal', branch: 'Boudha', method: 'Cash', amount: '18,500', status: 'Approved', approvedBy: 'Ramesh Dulal' },
  { bs: '2081-02-03', ad: '16 May 2024', ref: 'EXP-2505-003', category: 'Salaries & Wages', vendor: 'Staff Salary', branch: 'All Branches', method: 'Bank Transfer', amount: '2,75,000', status: 'Approved', approvedBy: 'Ramesh Dulal' },
  { bs: '2081-02-05', ad: '18 May 2024', ref: 'EXP-2505-004', category: 'Maintenance', vendor: 'Tech Solutions Nepal', branch: 'Boudha', method: 'eSewa', amount: '45,000', status: 'Pending', approvedBy: '—' },
  { bs: '2081-02-06', ad: '19 May 2024', ref: 'EXP-2505-005', category: 'Marketing', vendor: 'Creative Agency Nepal', branch: 'Boudha', method: 'Bank Transfer', amount: '35,000', status: 'Approved', approvedBy: 'Ramesh Dulal' },
  { bs: '2081-02-07', ad: '20 May 2024', ref: 'EXP-2505-006', category: 'Transport', vendor: 'Pathao Delivery', branch: 'Boudha', method: 'Cash', amount: '12,500', status: 'Approved', approvedBy: 'Ramesh Dulal' },
]

export const SUMMARY = [
  { label: 'Total Expenses', value: 'Rs 18,72,500' },
  { label: 'Total Transactions', value: '246' },
  { label: 'Average Expense Value', value: 'Rs 7,617' },
  { label: 'Approved Expenses', value: 'Rs 17,37,500' },
  { label: 'Pending Expenses', value: 'Rs 1,35,000', tone: 'progress' as const },
  { label: 'Rejected Expenses', value: 'Rs 0' },
  { label: 'Budget Utilization', value: '75.0%' },
]

export const TOP_CATEGORIES = [
  { rank: 1, name: 'Equipment Purchase', amount: '5,24,000', share: '28.0%' },
  { rank: 2, name: 'Office Expenses', amount: '3,18,500', share: '17.0%' },
  { rank: 3, name: 'Salaries & Wages', amount: '2,75,000', share: '14.7%' },
  { rank: 4, name: 'Maintenance', amount: '1,80,000', share: '9.6%' },
  { rank: 5, name: 'Marketing', amount: '1,25,000', share: '6.7%' },
]

export const TOP_VENDORS = [
  { rank: 1, name: 'Camera Accessories Nepal', amount: '2,45,000', share: '13.1%' },
  { rank: 2, name: 'ProMaster Distributors', amount: '1,98,000', share: '10.6%' },
  { rank: 3, name: 'Nepal Electricity Authority', amount: '75,000', share: '4.0%' },
  { rank: 4, name: 'Worldlink Communications', amount: '48,500', share: '2.6%' },
  { rank: 5, name: 'Office Supplier Nepal', amount: '42,000', share: '2.2%' },
]

export const INSIGHTS: Array<{ icon: 'arrow_up' | 'alert_triangle' | 'info' | 'arrow_down'; text: string; tone: 'success' | 'progress' | 'primary' | 'neutral' }> = [
  { icon: 'arrow_up', text: 'Equipment Purchase increased by 18%.', tone: 'success' },
  { icon: 'alert_triangle', text: '9 expenses pending approval.', tone: 'progress' },
  { icon: 'info', text: 'Office Expenses are within budget.', tone: 'primary' },
  { icon: 'arrow_down', text: 'Maintenance cost reduced by 6%.', tone: 'success' },
]

export const QUICK_ACTIONS: Array<{ icon: 'file' | 'chart' | 'calendar_stats' | 'queues'; label: string; tone: 'danger' | 'success' | 'primary' | 'primary' }> = [
  { icon: 'file', label: 'Export PDF', tone: 'danger' },
  { icon: 'chart', label: 'Export Excel', tone: 'success' },
  { icon: 'calendar_stats', label: 'Schedule Report', tone: 'primary' },
  { icon: 'queues', label: 'Create Dashboard Widget', tone: 'primary' },
]
