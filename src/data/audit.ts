import type { Kpi } from '../components/ui/Page'
import type { Slice } from '../components/ui/Charts'

/** Audit Settings seed data — transcribed from render `13590713`. */

export const KPIS: Kpi[] = [
  { label: 'Audit Events Today', value: '12,846', icon: 'checklist', accent: 'primary', delta: { direction: 'up', text: '18.4% vs yesterday' }, spark: [40, 52, 46, 60, 54, 66, 58, 70, 64, 74, 68, 78] },
  { label: 'Monitored Modules', value: '26', icon: 'queues', accent: 'success', delta: { direction: 'up', text: '2 modules' }, spark: [50, 52, 51, 55, 54, 58, 57, 60, 59, 62, 61, 64] },
  { label: 'Audit Rules', value: '84', icon: 'tool', accent: 'primary', delta: { direction: 'up', text: '5 new rules' }, spark: [30, 38, 34, 45, 41, 52, 48, 58, 54, 64, 60, 68] },
  { label: 'Retention Period', value: '7 Years', icon: 'calendar_stats', accent: 'progress', note: 'Configurable' },
  { label: 'Log Integrity', value: '100%', icon: 'checklist', accent: 'success', note: 'All logs verified', spark: [60, 62, 61, 64, 63, 66, 65, 68, 67, 70, 69, 72] },
  { label: 'Compliance Score', value: '98%', icon: 'alert_triangle', accent: 'danger', delta: { direction: 'up', text: '1.2% vs last month' }, spark: [45, 52, 48, 58, 54, 62, 57, 66, 61, 70, 65, 74] },
]

export const LOG_EVENTS = [
  { label: 'Login / Logout', on: true },
  { label: 'Imports', on: true },
  { label: 'Failed Login', on: true },
  { label: 'Permission Changes', on: true },
  { label: 'Booking & Rentals', on: true },
  { label: 'Configuration Changes', on: true },
  { label: 'Inventory Changes', on: true },
  { label: 'API Calls', on: true },
  { label: 'Payments & Finance', on: true },
  { label: 'AI Actions', on: true },
  { label: 'Reports & Exports', on: true },
  { label: 'Backup & Restore', on: true },
]

export const CATEGORIES: Array<{ name: string; events: string; icon: 'crew' | 'users' | 'calendar' | 'box' | 'dollar' | 'settings' | 'plug' | 'file' | 'automation' }> = [
  { name: 'Authentication', events: '12 events today', icon: 'crew' },
  { name: 'Users', events: '215 events today', icon: 'users' },
  { name: 'Rentals', events: '1,824 events today', icon: 'calendar' },
  { name: 'Inventory', events: '2,156 events today', icon: 'box' },
  { name: 'Finance', events: '3,642 events today', icon: 'dollar' },
  { name: 'Administration', events: '892 events today', icon: 'settings' },
  { name: 'Integrations', events: '126 events today', icon: 'plug' },
  { name: 'Documents', events: '368 events today', icon: 'file' },
  { name: 'AI & Automation', events: '87 events today', icon: 'automation' },
]

export const RETENTION = [
  { module: 'Authentication', period: '1 Year', action: 'Archive' },
  { module: 'Users', period: '3 Years', action: 'Archive' },
  { module: 'Rentals', period: '7 Years', action: 'Archive' },
  { module: 'Inventory', period: '7 Years', action: 'Archive' },
  { module: 'Finance', period: '10 Years', action: 'Archive' },
  { module: 'Documents', period: '7 Years', action: 'Archive' },
  { module: 'Reports', period: '5 Years', action: 'Archive' },
  /* Audit logs are the one row that never expires — nothing is deleted. */
  { module: 'Audit Logs', period: 'Forever', action: 'Never Delete' },
  { module: 'Integrations', period: '3 Years', action: 'Archive' },
]

export const AUDIT_RULES = [
  { name: 'High Value Booking', module: 'Rentals', condition: 'Amount > NPR 100,000', level: 'Detailed', at: 'May 21, 2025 08:21 AM' },
  { name: 'Permission Change', module: 'Administration', condition: 'Any permission change', level: 'Detailed', at: 'May 18, 2025 07:45 PM' },
  { name: 'Price Change', module: 'Inventory', condition: 'Price modified', level: 'Detailed', at: 'May 18, 2025 06:20 PM' },
  { name: 'Payment Adjustment', module: 'Finance', condition: 'Any manual adjustment', level: 'Detailed', at: 'May 17, 2025 11:05 AM' },
  { name: 'Data Export', module: 'Reports', condition: 'Export any data', level: 'Detailed', at: 'May 17, 2025 09:34 AM' },
  { name: 'Failed Login Multiple', module: 'Authentication', condition: '> 5 failed attempts', level: 'Detailed', at: 'May 16, 2025 10:22 PM' },
  { name: 'API Key Change', module: 'Administration', condition: 'Create / Update / Delete', level: 'Detailed', at: 'May 16, 2025 04:12 PM' },
]

export const COMPLIANCE = [
  { name: 'Internal Audit Compliance', cadence: 'Every 3 Months' },
  { name: 'Financial Audit Compliance', cadence: 'Every 6 Months' },
  { name: 'Tax Audit Compliance', cadence: 'Yearly' },
  { name: 'Inventory Audit Compliance', cadence: 'Every 6 Months' },
  { name: 'Security Audit Compliance', cadence: 'Quarterly' },
]

export const LEGAL_HOLD = {
  note: 'Preserve specific records for legal, regulatory or investigation purposes.',
  active: '3 Active Legal Holds',
  oldest: 'Apr 21, 2025',
  locked: '18,542',
  expires: '—',
}

export const BY_MODULE: Slice[] = [
  { label: 'Rentals', value: 28, display: '28%', percent: '28%' },
  { label: 'Inventory', value: 24, display: '24%', percent: '24%' },
  { label: 'Finance', value: 20, display: '20%', percent: '20%' },
  { label: 'Users', value: 12, display: '12%', percent: '12%' },
  { label: 'Admin', value: 8, display: '8%', percent: '8%' },
  { label: 'Others', value: 8, display: '8%', percent: '8%' },
]
export const TOTAL_EVENTS = '38,642'

export const BY_USER = [
  { name: 'Ramesh Dulal', value: '4,126', pct: 100 },
  { name: 'Sunil Tamang', value: '2,864', pct: 69 },
  { name: 'Anita Gurung', value: '2,156', pct: 52 },
  { name: 'Babin Dulal', value: '1,984', pct: 48 },
  { name: 'Sanjay Shrestha', value: '1,432', pct: 35 },
]

export const BY_BRANCH = [
  { name: 'Head Office', value: '21,648', pct: 100 },
  { name: 'Thamel Branch', value: '8,642', pct: 40 },
  { name: 'Pokhara Branch', value: '4,312', pct: 20 },
  { name: 'Lalitpur Branch', value: '2,040', pct: 9 },
]

export const HIGH_RISK = {
  value: '126',
  note: 'Critical & High Severity',
  sub: 'This Month',
  yTicks: ['150', '100', '50', '0'],
  labels: ['Apr 21', 'Apr 28', 'May 5', 'May 12', 'May 19'],
  points: [58, 82, 66, 104, 78, 118, 92, 126, 108],
}

export const GROWTH = {
  value: '38,642',
  note: 'Events Over Time',
  yTicks: ['40K', '30K', '20K', '10K', '0'],
  labels: ['Apr 21', 'Apr 28', 'May 5', 'May 12', 'May 19'],
  points: [18, 22, 20, 26, 24, 30, 28, 34, 38],
}

export const INSIGHTS = [
  'No unusual behavior detected.',
  'Audit logging level is optimal.',
  'Consider extending retention for Finance.',
  '3 users have high privilege activity.',
  'All critical modules are being monitored.',
]

export const SUMMARY = [
  { label: 'Events Today', value: '12,846' },
  { label: 'Total Events', value: '38,642' },
  { label: 'Storage Used', value: '486 GB (38%)' },
  { label: 'Retention Period', value: '7 Years' },
  { label: 'Log Integrity', value: '100%' },
  { label: 'Compliance Score', value: '98%' },
]

export const ALERTS: Array<{ text: string; when: string; tone: 'danger' | 'progress' | 'primary' }> = [
  { text: 'Audit logging disabled for API', when: '2h', tone: 'danger' },
  { text: 'Storage usage 83%', when: '4h', tone: 'progress' },
  { text: 'Integrity verification due', when: '1d', tone: 'primary' },
  { text: 'Missing audit rule for exports', when: '1d', tone: 'progress' },
  { text: 'Retention period expiring soon', when: '2d', tone: 'progress' },
]

export const QUICK_ACTIONS: Array<{ label: string; icon: 'tool' | 'checklist' | 'file' | 'chart'; tone: 'primary' | 'success' | 'progress' | 'primary' }> = [
  { label: 'Create Rule', icon: 'tool', tone: 'primary' },
  { label: 'Verify Integrity', icon: 'checklist', tone: 'success' },
  { label: 'Export Evidence', icon: 'file', tone: 'progress' },
  { label: 'Generate Report', icon: 'chart', tone: 'primary' },
]

export const ACTIVITY = [
  { what: 'Audit rule updated', at: 'May 21, 2025 09:15 AM', who: 'System', tone: 'primary' as const },
  { what: 'Integrity verification passed', at: 'May 21, 2025 02:30 AM', who: 'System', tone: 'success' as const },
  { what: 'Retention policy changed', at: 'May 20, 2025 11:05 PM', who: 'Ramesh Dulal', tone: 'progress' as const },
  { what: 'Evidence package exported', at: 'May 20, 2025 08:20 PM', who: 'Sanjay Shrestha', tone: 'primary' as const },
  { what: 'Audit logging level changed', at: 'May 20, 2025 05:40 PM', who: 'System', tone: 'danger' as const },
]
