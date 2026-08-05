import type { Kpi } from '../components/ui/Page'
import type { Slice } from '../components/ui/Charts'

/** Backup & Restore seed data — transcribed from render `F134F2C8`. */

export const KPIS: Kpi[] = [
  { label: 'Total Backups', value: '1,248', icon: 'box', accent: 'success', delta: { direction: 'up', text: '18% vs last month' } },
  { label: 'Latest Backup', value: 'Today', icon: 'timer', accent: 'primary', note: '02:15 AM' },
  { label: 'Backup Size', value: '486 GB', icon: 'queues', accent: 'primary', delta: { direction: 'up', text: '8% vs last month' } },
  { label: 'Success Rate', value: '99.8%', icon: 'checklist', accent: 'success', delta: { direction: 'up', text: '0.6% vs last month' } },
  { label: 'Restore Points', value: '156', icon: 'refresh', accent: 'progress', delta: { direction: 'up', text: '12 vs last month' } },
  { label: 'Backup Health', value: 'Healthy', icon: 'activity', accent: 'success', note: 'All systems operational' },
]

export const OVERVIEW: Array<{ label: string; value: string; icon: 'refresh' | 'return_arrow' | 'chart' | 'queues' | 'file' | 'eye' | 'settings' | 'checklist' }> = [
  { label: 'Full Backup', value: '342', icon: 'refresh' },
  { label: 'Incremental', value: '512', icon: 'return_arrow' },
  { label: 'Differential', value: '164', icon: 'chart' },
  { label: 'Database', value: '248', icon: 'queues' },
  { label: 'Documents', value: '621 GB', icon: 'file' },
  { label: 'Media Files', value: '1.2 TB', icon: 'eye' },
  { label: 'Configuration', value: '64', icon: 'settings' },
  { label: 'Audit Logs', value: '128 GB', icon: 'checklist' },
]

export const SCHEDULE = [
  { name: 'Daily Full Backup', frequency: 'Daily', time: '02:00 AM', next: 'Tomorrow 02:00 AM' },
  { name: 'Incremental Backup', frequency: 'Every 6 Hours', time: 'Every 6 Hours', next: 'In 01h 45m' },
  { name: 'Weekly Differential', frequency: 'Weekly (Sun)', time: '01:00 AM', next: 'May 25, 2025' },
  { name: 'Monthly Archive', frequency: 'Monthly (1st)', time: '03:00 AM', next: 'Jun 01, 2025' },
  { name: 'Pre-Update Backup', frequency: 'Before Update', time: 'Manual', next: 'Before Update' },
  { name: 'Pre-Migration Backup', frequency: 'Before Migration', time: 'Manual', next: 'Before Migration' },
]

export interface BackupRow {
  id: string
  type: 'Full' | 'Incremental' | 'Differential'
  startedBs: string
  startedAd: string
  completedBs: string
  completedAd: string
  duration: string
  size: string
  destination: string
  status: 'Completed' | 'Failed' | 'Verifying'
  by: string
}

export const HISTORY: BackupRow[] = [
  { id: 'BKP-2025-0519-0215', type: 'Full', startedBs: '2082-02-07', startedAd: 'May 19, 2025 02:15 AM', completedBs: '2082-02-07', completedAd: 'May 19, 2025 03:02 AM', duration: '47m 12s', size: '86.4 GB', destination: 'AWS S3', status: 'Completed', by: 'Ramesh Dulal' },
  { id: 'BKP-2025-0518-2000', type: 'Incremental', startedBs: '2082-02-06', startedAd: 'May 18, 2025 08:00 PM', completedBs: '2082-02-06', completedAd: 'May 18, 2025 08:18 PM', duration: '18m 32s', size: '12.7 GB', destination: 'Google Drive', status: 'Completed', by: 'System' },
  { id: 'BKP-2025-0518-1400', type: 'Incremental', startedBs: '2082-02-06', startedAd: 'May 18, 2025 02:00 PM', completedBs: '2082-02-06', completedAd: 'May 18, 2025 02:16 PM', duration: '16m 05s', size: '11.3 GB', destination: 'Dropbox', status: 'Completed', by: 'System' },
  { id: 'BKP-2025-0518-0800', type: 'Incremental', startedBs: '2082-02-06', startedAd: 'May 18, 2025 08:00 AM', completedBs: '2082-02-06', completedAd: 'May 18, 2025 08:15 AM', duration: '15m 10s', size: '10.9 GB', destination: 'OneDrive', status: 'Completed', by: 'System' },
  { id: 'BKP-2025-0517-0100', type: 'Full', startedBs: '2082-02-05', startedAd: 'May 17, 2025 01:00 AM', completedBs: '2082-02-05', completedAd: 'May 17, 2025 02:01 AM', duration: '1h 01m', size: '84.1 GB', destination: 'Backblaze B2', status: 'Completed', by: 'Ramesh Dulal' },
  { id: 'BKP-2025-0516-2300', type: 'Differential', startedBs: '2082-02-04', startedAd: 'May 16, 2025 11:00 PM', completedBs: '2082-02-04', completedAd: 'May 16, 2025 11:27 PM', duration: '27m 19s', size: '32.6 GB', destination: 'AWS S3', status: 'Failed', by: 'System' },
  { id: 'BKP-2025-0516-1700', type: 'Incremental', startedBs: '2082-02-04', startedAd: 'May 16, 2025 05:00 PM', completedBs: '2082-02-04', completedAd: 'May 16, 2025 05:14 PM', duration: '14m 21s', size: '10.2 GB', destination: 'Google Drive', status: 'Completed', by: 'System' },
  { id: 'BKP-2025-0516-1100', type: 'Incremental', startedBs: '2082-02-04', startedAd: 'May 16, 2025 11:00 AM', completedBs: '2082-02-04', completedAd: 'May 16, 2025 11:15 AM', duration: '14m 53s', size: '9.8 GB', destination: 'Dropbox', status: 'Verifying', by: 'System' },
]

export const RESTORE_SCOPES = [
  'Entire System',
  'Database Only',
  'Inventory',
  'Customers',
  'Bookings',
  'Finance',
  'Documents',
  'Audit Logs',
  'Selected Records',
]

export const RESTORE_OPTIONS = [
  { label: 'Create recovery checkpoint', on: true },
  { label: 'Validate data before restore', on: true },
  { label: 'Restore to new environment', on: false },
]

export const RESTORE_POINT = {
  id: 'BKP-2025-0519-0215',
  kind: 'Full Backup',
  at: 'May 19, 2025 02:15 AM',
  size: 'Size: 86.4 GB',
}

export const DESTINATIONS = [
  { name: 'AWS S3', used: 'Used: 245 GB / 500 GB', pct: 49, primary: true },
  { name: 'Google Drive', used: 'Used: 120 GB / 200 GB', pct: 60 },
  { name: 'Dropbox', used: 'Used: 68 GB / 100 GB', pct: 68 },
  { name: 'Backblaze B2', used: 'Used: 32 GB / 100 GB', pct: 32 },
  { name: 'OneDrive', used: 'Used: 18 GB / 100 GB', pct: 18 },
  { name: 'Local NAS', used: 'Used: 95 GB / 1 TB', pct: 9 },
]

export const INTEGRITY: Slice[] = [
  { label: 'Passed', value: 1242, display: '1,242', percent: '99.5%' },
  { label: 'Warning', value: 4, display: '4', percent: '0.3%' },
  { label: 'Failed', value: 2, display: '2', percent: '0.2%' },
]
export const INTEGRITY_TOTAL = '1,248'

export const CLOUD_USAGE: Slice[] = [
  { label: 'AWS S3', value: 49, display: '49%', percent: '49%' },
  { label: 'Google Drive', value: 24, display: '24%', percent: '24%' },
  { label: 'Dropbox', value: 14, display: '14%', percent: '14%' },
  { label: 'Backblaze B2', value: 8, display: '8%', percent: '8%' },
  { label: 'Others', value: 5, display: '5%', percent: '5%' },
]

export const ANALYTICS: Array<{ label: string; value: string; sub: string; delta: { direction: 'up' | 'down'; text: string; good: boolean }; points: number[] }> = [
  { label: 'Backup Trend', value: '125', sub: 'Total Backups', delta: { direction: 'up', text: '12% vs last month', good: true }, points: [40, 62, 35, 70, 48, 80, 55, 72, 60, 85, 66, 90] },
  { label: 'Storage Usage', value: '486 GB', sub: '', delta: { direction: 'up', text: '8% vs last month', good: true }, points: [30, 38, 44, 41, 52, 58, 55, 64, 70, 68, 76, 82] },
  { label: 'Backup Duration (Avg.)', value: '32m 14s', sub: '', delta: { direction: 'down', text: '5% vs last month', good: true }, points: [70, 64, 68, 58, 62, 52, 56, 48, 50, 44, 46, 40] },
  { label: 'Restore Success Rate', value: '98.7%', sub: '', delta: { direction: 'up', text: '1.3% vs last month', good: true }, points: [80, 84, 82, 86, 88, 87, 90, 92, 91, 94, 96, 98] },
  { label: 'Recovery Time (Avg.)', value: '12m 45s', sub: '', delta: { direction: 'down', text: '3% vs last month', good: true }, points: [66, 60, 64, 56, 58, 50, 54, 46, 48, 42, 44, 38] },
]

export const SUMMARY = [
  { label: 'Last Backup', value: 'Today 02:15 AM' },
  { label: 'Next Backup', value: 'Tomorrow 02:00 AM' },
  { label: 'Storage Used', value: '486 GB (83%)' },
  { label: 'Available Space', value: '101 GB / 587 GB' },
]

export const ALERTS: Array<{ text: string; when: string; tone: 'danger' | 'progress' | 'primary' }> = [
  { text: 'Backup verification failed', when: '2h', tone: 'danger' },
  { text: 'Storage usage 83%', when: '4h', tone: 'progress' },
  { text: 'Backblaze B2 connection slow', when: '6h', tone: 'progress' },
  { text: 'AWS S3 nearing capacity', when: '8h', tone: 'progress' },
  { text: 'Old backups ready to archive', when: '1d', tone: 'primary' },
]

export const QUICK_ACTIONS: Array<{ label: string; icon: 'box' | 'refresh' | 'checklist' | 'file'; tone: 'success' | 'primary' | 'progress' | 'primary' }> = [
  { label: 'Create Backup', icon: 'box', tone: 'success' },
  { label: 'Restore Backup', icon: 'refresh', tone: 'primary' },
  { label: 'Verify Backup', icon: 'checklist', tone: 'progress' },
  { label: 'Export Report', icon: 'file', tone: 'primary' },
]

export const ACTIVITY = [
  { what: 'Full backup completed', at: 'May 19, 2025 02:15 AM', who: 'System', tone: 'success' as const },
  { what: 'Restore point created', at: 'May 19, 2025 02:10 AM', who: 'System', tone: 'progress' as const },
  { what: 'Incremental backup completed', at: 'May 18, 2025 08:00 PM', who: 'System', tone: 'success' as const },
  { what: 'Backup schedule updated', at: 'May 18, 2025 06:30 PM', who: 'Ramesh Dulal', tone: 'primary' as const },
  { what: 'Cloud storage connected', at: 'May 18, 2025 05:15 PM', who: 'System', tone: 'danger' as const },
]

export const ADVISOR = [
  'Your backup schedule is optimal.',
  'Consider enabling off-site copy (3-2-1 rule).',
  '2 old backups can be archived.',
  'Run a disaster recovery test this month.',
  'All critical data is properly encrypted.',
]
