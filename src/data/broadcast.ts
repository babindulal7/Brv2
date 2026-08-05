import type { Kpi } from '../components/ui/Page'
import type { Slice } from '../components/ui/Charts'
import type { StatusKey } from '../lib/status'

/** Broadcast Center seed data — transcribed from render `3B62B8D9`. */

export const PERIOD = { bs: '2082 BS', range: 'May 15, 2082 BS', ad: 'Apr 28 – May 14, 2025 AD' }

export const KPIS: Kpi[] = [
  { label: 'Broadcasts Today', value: '42', icon: 'arrow_right', accent: 'primary', delta: { direction: 'up', text: '16.7% vs yesterday' }, spark: [30, 45, 38, 55, 48, 62, 54, 68, 60, 72, 66, 78] },
  { label: 'Total Recipients', value: '18,540', icon: 'users', accent: 'success', delta: { direction: 'up', text: '23.5% vs yesterday' }, spark: [25, 40, 34, 52, 46, 60, 55, 66, 62, 74, 70, 82] },
  { label: 'Delivery Rate', value: '98.9%', icon: 'checklist', accent: 'primary', delta: { direction: 'up', text: '1.3% vs yesterday' }, spark: [70, 74, 72, 78, 76, 82, 80, 85, 83, 88, 86, 90] },
  { label: 'Read Rate', value: '91.4%', icon: 'eye', accent: 'progress', delta: { direction: 'up', text: '2.6% vs yesterday' }, spark: [55, 62, 58, 68, 64, 72, 70, 76, 74, 80, 78, 84] },
  { label: 'Click Rate', value: '28.6%', icon: 'arrow_up', accent: 'primary', delta: { direction: 'up', text: '4.2% vs yesterday' }, spark: [20, 28, 24, 34, 30, 40, 36, 46, 42, 50, 48, 56] },
  { label: 'Conversion Rate', value: '11.2%', icon: 'dollar', accent: 'danger', delta: { direction: 'up', text: '3.1% vs yesterday' }, spark: [12, 18, 15, 22, 19, 26, 23, 30, 27, 34, 31, 38] },
]

export const SEGMENTS: Array<{ name: string; note: string; count: string; tone: 'primary' | 'success' | 'progress' | 'danger' | 'primary' | 'neutral' }> = [
  { name: 'All Customers', note: 'Everyone in customer database', count: '12,845', tone: 'primary' },
  { name: 'VIP Customers', note: 'High value and loyal customers', count: '1,256', tone: 'success' },
  { name: 'Active Customers', note: 'Rented in last 90 days', count: '7,842', tone: 'primary' },
  { name: 'Inactive Customers', note: 'No rental in last 180 days', count: '3,215', tone: 'neutral' },
  { name: 'Overdue Rentals', note: 'Rentals past due date', count: '624', tone: 'danger' },
  { name: 'Gold Members', note: 'Active Gold membership', count: '1,025', tone: 'progress' },
  { name: 'New Customers', note: 'Joined in last 30 days', count: '2,145', tone: 'primary' },
  { name: 'Custom Segment', note: 'High spend + Camera category', count: '856', tone: 'neutral' },
]

export const CAMPAIGN_TABS = [
  { label: 'All', count: '56' },
  { label: 'Draft', count: '8' },
  { label: 'Scheduled', count: '14' },
  { label: 'Running', count: '6' },
  { label: 'Completed', count: '24' },
  { label: 'Paused', count: '2' },
  { label: 'Failed', count: '2' },
]

export interface Campaign {
  name: string
  note: string
  channels: Array<'whatsapp' | 'email' | 'sms' | 'push'>
  audience: string
  status: 'Running' | 'Scheduled' | 'Completed'
  statusKey: StatusKey
  bs: string
  ad: string
  delivery: string
  read: string
  click: string
}

export const CAMPAIGNS: Campaign[] = [
  { name: 'Dashain Festival Offer 2082', note: 'Special discount for Dashain', channels: ['whatsapp', 'email', 'sms'], audience: '8,540', status: 'Running', statusKey: 'primary', bs: '2082/01/15 BS', ad: 'Apr 28, 2025 10:00 AM', delivery: '98.7%', read: '92.1%', click: '31.2%' },
  { name: 'Overdue Payment Reminder', note: 'Reminder for overdue invoices', channels: ['sms', 'email'], audience: '2,145', status: 'Scheduled', statusKey: 'progress', bs: '2082/01/17 BS', ad: 'Apr 30, 2025 09:00 AM', delivery: '–', read: '–', click: '–' },
  { name: 'New Camera Arrivals', note: 'Promote new equipment', channels: ['whatsapp', 'email', 'push'], audience: '5,200', status: 'Completed', statusKey: 'in', bs: '2082/01/10 BS', ad: 'Apr 23, 2025 05:00 PM', delivery: '99.4%', read: '89.6%', click: '26.8%' },
  { name: 'Membership Renewal May', note: 'Renew your membership', channels: ['email', 'sms'], audience: '1,852', status: 'Completed', statusKey: 'in', bs: '2082/01/08 BS', ad: 'Apr 21, 2025 11:00 AM', delivery: '97.8%', read: '91.3%', click: '22.4%' },
  { name: 'Return Reminder (7 Days)', note: 'Upcoming return reminder', channels: ['whatsapp', 'sms'], audience: '1,024', status: 'Running', statusKey: 'primary', bs: '2082/01/15 BS', ad: 'Apr 28, 2025 09:00 AM', delivery: '97.1%', read: '93.2%', click: '27.3%' },
  { name: 'Office Holiday Notice', note: 'Office closed on May 1', channels: ['email', 'push'], audience: '3,420', status: 'Completed', statusKey: 'in', bs: '2082/01/11 BS', ad: 'Apr 24, 2025 02:00 PM', delivery: '99.8%', read: '95.4%', click: '18.6%' },
]

export const CHANNEL_MIX: Slice[] = [
  { label: 'WhatsApp', value: 8540, display: '8,540', percent: '46.1%' },
  { label: 'Email', value: 4520, display: '4,520', percent: '24.4%' },
  { label: 'SMS', value: 3245, display: '3,245', percent: '17.5%' },
  { label: 'Push', value: 1345, display: '1,345', percent: '7.3%' },
  { label: 'In-App', value: 890, display: '890', percent: '4.8%' },
]
export const TOTAL_SENT = '18,540'

export const BUILDER_STEPS = ['Campaign Info', 'Audience', 'Channels', 'Message', 'Schedule', 'Review & Confirm']

export const PREVIEW_TABS = ['WhatsApp Preview', 'Email Preview', 'SMS Preview', 'In-App Preview']

/**
 * The message body is Nepali, as in the render. It is data, not UI copy — the
 * interface chrome around it stays English.
 */
export const PREVIEW_MESSAGE = [
  'नमस्ते {{customer_name}}! 🎉',
  'दशैं को अवसरमा Cine Sewa बाट',
  'सबै रेन्टलमा 15% छुट!',
  '{{booking_equipment}} रेन्ट गर्नुहोस् र',
  'उत्तम सेवा पाउनुहोस्।',
  'अफर मिति: {{offer_start}} देखि {{offer_end}}',
  'बुकिङको लागि: {{website_link}}',
  'धन्यवाद!',
  '– Cine Sewa Team',
]

export const VARIABLES = ['{{customer_name}}', '{{booking_id}}', '{{equipment}}', '{{offer_start}}', '{{offer_end}}', '{{website_link}}']

export const FUNNEL = [
  { label: 'Recipients', value: '18,540', pct: '100%', width: 100 },
  { label: 'Queued', value: '18,102', pct: '97.6%', width: 92 },
  { label: 'Sent', value: '17,980', pct: '97.0%', width: 84 },
  { label: 'Delivered', value: '17,752', pct: '95.7%', width: 74 },
  { label: 'Read', value: '16,140', pct: '87.1%', width: 62 },
  { label: 'Clicked', value: '5,302', pct: '28.6%', width: 42 },
  { label: 'Converted', value: '2,077', pct: '11.2%', width: 24 },
]

export const PERFORMANCE = {
  labels: ['May 8 BS', 'May 9 BS', 'May 10 BS', 'May 11 BS', 'May 12 BS', 'May 13 BS', 'May 14 BS'],
  yTicks: ['0', '2K', '4K', '6K', '8K'],
  series: [
    { name: 'Sent', points: [52, 58, 55, 64, 60, 70, 74] },
    { name: 'Delivered', points: [48, 55, 52, 60, 57, 66, 70] },
    { name: 'Read', points: [34, 40, 37, 46, 42, 50, 55] },
    { name: 'Clicked', points: [12, 16, 14, 20, 18, 24, 27] },
  ],
}

export const UPCOMING = [
  { bs: 'Apr 30', bsYear: '2082 BS', name: 'Overdue Payment Reminder', detail: 'SMS, Email · 2,145 recipients', at: '9:00 AM' },
  { bs: 'May 02', bsYear: '2082 BS', name: 'Monthly Newsletter May', detail: 'Email, In-App · 5,620 recipients', at: '11:00 AM' },
  { bs: 'May 05', bsYear: '2082 BS', name: 'Weekend Promo Offer', detail: 'WhatsApp, SMS · 3,842 recipients', at: '10:30 AM' },
]

export const QUICK_ACTIONS: Array<{ label: string; icon: 'arrow_right' | 'calendar_stats' | 'queues' | 'file'; tone: 'success' | 'primary' | 'progress' | 'primary' }> = [
  { label: 'New Broadcast', icon: 'arrow_right', tone: 'success' },
  { label: 'Schedule Campaign', icon: 'calendar_stats', tone: 'primary' },
  { label: 'Duplicate Campaign', icon: 'queues', tone: 'progress' },
  { label: 'Create Template', icon: 'file', tone: 'primary' },
]

export const ACTIVITY = [
  { what: 'Campaign "Dashain Festival Offer 2082" started', at: '10:21 AM', tone: 'success' as const },
  { what: 'Template "Dashain Greeting" updated', at: '09:58 AM', tone: 'primary' as const },
  { what: 'Campaign "New Camera Arrivals" completed', at: '09:32 AM', tone: 'success' as const },
  { what: 'Approval granted for "Overdue Reminder"', at: '09:10 AM', tone: 'primary' as const },
  { what: 'Audience segment "VIP Customers" updated', at: '08:45 AM', tone: 'progress' as const },
]

export const ADVISOR = [
  'Best time to send today: 11 AM – 1 PM',
  'Dashain campaign has high engagement potential.',
  'Use WhatsApp for urgent reminders.',
  'Personalize messages for higher conversion.',
  'Segment Gold members for exclusive offers.',
  'Consider A/B test for subject lines.',
]
