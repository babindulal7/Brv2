import type { Kpi } from '../components/ui/Page'
import type { StatusKey } from '../lib/status'

/** Event Triggers seed data — transcribed from render `1542A77D`. */

export const KPIS: Kpi[] = [
  { label: 'Total Triggers', value: '148', icon: 'automation', accent: 'primary', delta: { direction: 'up', text: '12 this month' } },
  { label: 'Active Triggers', value: '136', icon: 'checklist', accent: 'success', note: '91.9% of total' },
  { label: 'Trigger Events Today', value: '18,542', icon: 'activity', accent: 'primary', delta: { direction: 'up', text: '23.6% vs yesterday' } },
  { label: 'Failed Triggers', value: '5', icon: 'alert_triangle', accent: 'danger', delta: { direction: 'down', text: '28.6% vs yesterday', good: true } },
  { label: 'Average Response Time', value: '42 ms', icon: 'timer', accent: 'progress', delta: { direction: 'down', text: '8 ms vs yesterday', good: true } },
  { label: 'Trigger Health', value: '99.8%', icon: 'chart', accent: 'success', delta: { direction: 'up', text: '0.6% vs last 7 days' } },
]

export const CATEGORIES: Array<{ name: string; count: string; icon: 'calendar' | 'dollar' | 'box' | 'tool' | 'users' | 'crew' | 'settings' }> = [
  { name: 'Rentals', count: '24', icon: 'calendar' },
  { name: 'Finance', count: '16', icon: 'dollar' },
  { name: 'Inventory', count: '18', icon: 'box' },
  { name: 'Maintenance', count: '12', icon: 'tool' },
  { name: 'Customers', count: '14', icon: 'users' },
  { name: 'Staff', count: '10', icon: 'crew' },
  { name: 'System', count: '28', icon: 'settings' },
]

export const TIMELINE_RANGES = ['Live', 'Hour', 'Day', 'Week'] as const
export const TIMELINE_DATE = { ad: 'May 21, 2025', bs: 'BS 2082/02/08' }

export const ACTIVITY_CHART = {
  yTicks: ['4K', '3K', '2K', '1K', '0'],
  labels: ['12 AM', '3 AM', '6 AM', '9 AM', '12 PM', '3 PM', '6 PM', '9 PM', '12 AM'],
  series: [
    { name: 'Total Events', points: [58, 62, 55, 70, 64, 78, 72, 84, 76, 88, 80, 92, 84, 90, 82, 86, 78] },
    { name: 'Successful', points: [50, 55, 48, 62, 57, 70, 64, 76, 68, 80, 72, 84, 76, 82, 74, 78, 70] },
    { name: 'Failed', points: [8, 10, 7, 12, 9, 14, 11, 15, 12, 16, 13, 17, 14, 15, 12, 13, 11] },
    { name: 'Delayed', points: [12, 14, 11, 17, 14, 19, 16, 21, 18, 23, 20, 24, 21, 22, 19, 20, 17] },
  ],
}

export const TOTALS = [
  { label: 'Total Events', value: '18,542', tone: 'primary' as const },
  { label: 'Successful', value: '18,487', note: '(99.7%)', tone: 'success' as const },
  { label: 'Failed', value: '47', note: '(0.3%)', tone: 'danger' as const },
  { label: 'Delayed', value: '8', note: '(0.04%)', tone: 'progress' as const },
]

export const DETAIL = {
  name: 'Booking Created',
  id: 'ID: TRG-00023',
  status: 'Active',
  tabs: ['Overview', 'Conditions', 'History', 'Logs', 'Settings'],
  description: 'Triggered when a new booking is created in the system.',
  fields: [
    { label: 'Module', value: 'Rentals' },
    { label: 'Event', value: 'Booking Created' },
    { label: 'Source', value: 'System (Web App)' },
    { label: 'Workflow', value: 'Booking Confirmation', link: true },
  ],
  lastBs: '2082/02/08 09:15:24 AM (BS)',
  lastAd: 'May 21, 2025 09:15:24 AM (AD)',
  stats: [
    { label: 'Response Time', value: '35 ms' },
    { label: 'Success Rate', value: '99.9%' },
    { label: 'Total Executions', value: '12,846' },
    { label: 'Variables', value: '12' },
  ],
}

export interface TriggerRow {
  name: string
  module: string
  event: string
  workflow: string
  bs: string
  ad: string
  response: string
  success: string
  status: 'Active' | 'Paused'
  statusKey: StatusKey
}

export const TRIGGERS: TriggerRow[] = [
  { name: 'Booking Created', module: 'Rentals', event: 'Booking Created', workflow: 'Booking Confirmation', bs: '2082/02/08 09:15:24 AM', ad: 'May 21, 2025 09:15:24 AM', response: '35 ms', success: '99.9%', status: 'Active', statusKey: 'in' },
  { name: 'Payment Received', module: 'Finance', event: 'Payment Received', workflow: 'Payment Reconciliation', bs: '2082/02/08 09:12:11 AM', ad: 'May 21, 2025 09:12:11 AM', response: '28 ms', success: '100%', status: 'Active', statusKey: 'in' },
  { name: 'Equipment Returned', module: 'Rentals', event: 'Return Completed', workflow: 'Equipment Inspection', bs: '2082/02/08 09:10:05 AM', ad: 'May 21, 2025 09:10:05 AM', response: '42 ms', success: '99.8%', status: 'Active', statusKey: 'in' },
  { name: 'Low Stock Alert', module: 'Inventory', event: 'Stock Below Limit', workflow: 'Low Stock Notification', bs: '2082/02/08 09:05:33 AM', ad: 'May 21, 2025 09:05:33 AM', response: '38 ms', success: '99.6%', status: 'Active', statusKey: 'in' },
  { name: 'Invoice Generated', module: 'Finance', event: 'Invoice Generated', workflow: 'Invoice Notification', bs: '2082/02/08 08:58:41 AM', ad: 'May 21, 2025 08:58:41 AM', response: '30 ms', success: '100%', status: 'Active', statusKey: 'in' },
  { name: 'Maintenance Due', module: 'Maintenance', event: 'Service Due', workflow: 'Maintenance Reminder', bs: '2082/02/08 08:45:10 AM', ad: 'May 21, 2025 08:45:10 AM', response: '55 ms', success: '99.7%', status: 'Paused', statusKey: 'progress' },
  { name: 'Customer Created', module: 'Customers', event: 'Customer Created', workflow: 'Welcome Email', bs: '2082/02/08 08:40:22 AM', ad: 'May 21, 2025 08:40:22 AM', response: '25 ms', success: '100%', status: 'Active', statusKey: 'in' },
]

export const QUEUE: Array<{ label: string; value: string; icon: 'timer' | 'arrow_right' | 'refresh' | 'checklist' | 'alert_triangle'; tone: 'progress' | 'primary' | 'primary' | 'success' | 'danger' }> = [
  { label: 'Waiting', value: '49', icon: 'timer', tone: 'progress' },
  { label: 'Running', value: '8', icon: 'arrow_right', tone: 'primary' },
  { label: 'Retrying', value: '3', icon: 'refresh', tone: 'primary' },
  { label: 'Completed', value: '1,542', icon: 'checklist', tone: 'success' },
  { label: 'Failed', value: '5', icon: 'alert_triangle', tone: 'danger' },
]

export const SUMMARY = [
  { label: 'Active Triggers', value: '136' },
  { label: 'Disabled Triggers', value: '12' },
  { label: "Today's Events", value: '18,542' },
  { label: 'Queue Size', value: '49' },
  { label: 'Avg. Response Time', value: '42 ms' },
  { label: 'Trigger Health', value: '99.8%' },
]

export const ALERTS: Array<{ text: string; when: string; tone: 'danger' | 'progress' | 'primary' }> = [
  { text: 'Payment Received failed', when: '09:12 AM', tone: 'danger' },
  { text: 'High event volume detected', when: '09:05 AM', tone: 'progress' },
  { text: 'Booking Created delayed', when: '08:57 AM', tone: 'progress' },
  { text: 'API timeout on Webhook', when: '08:45 AM', tone: 'danger' },
  { text: 'Maintenance Due trigger failed', when: '08:30 AM', tone: 'danger' },
]

export const QUICK_ACTIONS: Array<{ label: string; icon: 'plus' | 'tool' | 'refresh' | 'checklist'; tone: 'primary' | 'success' | 'progress' | 'primary' }> = [
  { label: 'Create Trigger', icon: 'plus', tone: 'primary' },
  { label: 'Test Trigger', icon: 'tool', tone: 'success' },
  { label: 'Replay Event', icon: 'refresh', tone: 'progress' },
  { label: 'View Logs', icon: 'checklist', tone: 'primary' },
]

export const ACTIVITY = [
  { what: 'Booking Created trigger updated', at: 'May 21, 2025 09:10 AM', who: 'Ramesh Dulal', tone: 'primary' as const },
  { what: 'Payment Received trigger tested', at: 'May 21, 2025 09:06 AM', who: 'Anita Gurung', tone: 'success' as const },
  { what: 'Low Stock Alert trigger paused', at: 'May 21, 2025 09:00 AM', who: 'Sunil Shrestha', tone: 'progress' as const },
  { what: 'Maintenance Due trigger created', at: 'May 21, 2025 08:50 AM', who: 'System', tone: 'primary' as const },
  { what: 'Webhook trigger tested', at: 'May 21, 2025 08:45 AM', who: 'Babin Dulal', tone: 'primary' as const },
]

export const ADVISOR: Array<{ text: string; weight: 'High' | 'Medium' | 'Low' }> = [
  { text: 'Merge 2 similar booking triggers', weight: 'High' },
  { text: 'Reduce event noise for inventory', weight: 'Medium' },
  { text: 'Optimize response time for webhooks', weight: 'Medium' },
  { text: 'Create trigger for equipment inspection', weight: 'Low' },
]

export const FILTERS = ['All Status', 'All Modules', 'All Workflows', 'All Sources']
