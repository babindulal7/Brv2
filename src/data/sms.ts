import type { Kpi } from '../components/ui/Page'
import type { Slice } from '../components/ui/Charts'
import type { StatusKey } from '../lib/status'

/** SMS Center seed data — transcribed from render `2562E6AA`. */

export const KPIS: Kpi[] = [
  { label: 'SMS Sent Today', value: '2,145', icon: 'arrow_right', accent: 'success', delta: { direction: 'up', text: '18.6% vs yesterday' }, spark: [40, 52, 46, 60, 55, 68, 62, 74, 68, 80, 74, 86] },
  { label: 'Delivery Rate', value: '99.1%', icon: 'checklist', accent: 'primary', delta: { direction: 'up', text: '0.7% vs yesterday' }, spark: [70, 73, 71, 76, 74, 79, 77, 82, 80, 85, 83, 88] },
  { label: 'Failed SMS', value: '18', icon: 'alert_triangle', accent: 'danger', delta: { direction: 'down', text: '28.0% vs yesterday', good: true }, spark: [40, 34, 38, 30, 33, 26, 29, 22, 25, 19, 21, 16] },
  { label: 'Pending Queue', value: '34', icon: 'timer', accent: 'progress', delta: { direction: 'down', text: '12.5% vs yesterday', good: true }, spark: [50, 46, 48, 42, 44, 38, 40, 34, 36, 30, 32, 28] },
  { label: 'OTP Success Rate', value: '98.8%', icon: 'crew', accent: 'primary', delta: { direction: 'up', text: '1.3% vs yesterday' }, spark: [62, 65, 63, 68, 66, 71, 69, 74, 72, 77, 75, 80] },
  { label: 'Gateway Health', value: 'Healthy', icon: 'activity', accent: 'success', note: 'All systems operational' },
]

export interface Gateway {
  name: string
  status: 'Healthy' | 'Warning'
  latency: string
  balance: string
  throughput: string
  sync: string
}

export const GATEWAYS: Gateway[] = [
  { name: 'Sparrow SMS', status: 'Healthy', latency: '120 ms', balance: 'NPR 24,560', throughput: '412 msg', sync: '1 min ago' },
  { name: 'Ncell A2P', status: 'Healthy', latency: '98 ms', balance: 'NPR 18,320', throughput: '586 msg', sync: '2 min ago' },
  { name: 'Nepal Telecom', status: 'Healthy', latency: '110 ms', balance: 'NPR 11,780', throughput: '322 msg', sync: '2 min ago' },
  { name: 'Twilio', status: 'Healthy', latency: '150 ms', balance: 'USD 48.30', throughput: '215 msg', sync: '3 min ago' },
  { name: 'Vonage', status: 'Warning', latency: '210 ms', balance: 'USD 12.10', throughput: '98 msg', sync: '5 min ago' },
  { name: 'Custom SMPP', status: 'Healthy', latency: '95 ms', balance: 'NPR 9,870', throughput: '176 msg', sync: '1 min ago' },
]

export const QUEUE_TILES: Array<{ label: string; value: string; tone: 'progress' | 'primary' | 'success' | 'danger' | 'primary' | 'neutral' }> = [
  { label: 'Pending', value: '34', tone: 'progress' },
  { label: 'Sending', value: '12', tone: 'primary' },
  { label: 'Delivered', value: '2,086', tone: 'success' },
  { label: 'Failed', value: '18', tone: 'danger' },
  { label: 'Retrying', value: '6', tone: 'primary' },
  { label: 'Cancelled', value: '2', tone: 'neutral' },
]

export const QUEUE_MIX: Slice[] = [
  { label: 'Delivered', value: 2086, display: '2,086', percent: '96.7%' },
  { label: 'Pending', value: 34, display: '34', percent: '1.6%' },
  { label: 'Sending', value: 12, display: '12', percent: '0.6%' },
  { label: 'Failed', value: 18, display: '18', percent: '0.8%' },
  { label: 'Retrying', value: 6, display: '6', percent: '0.3%' },
  { label: 'Cancelled', value: 2, display: '2', percent: '0.1%' },
]
export const QUEUE_TOTAL = '2,158'

export interface SmsRow {
  id: string
  customer: string
  vip?: boolean
  phone: string
  type: string
  typeKey: StatusKey
  gateway: string
  status: 'Delivered' | 'Failed'
  bs: string
  ad: string
  delivered: string
}

export const MESSAGES: SmsRow[] = [
  { id: 'SMS-2505148', customer: 'Suman Shrestha', vip: true, phone: '+977 9841 234 567', type: 'Booking Confirm.', typeKey: 'primary', gateway: 'Sparrow', status: 'Delivered', bs: '2082/02/31 BS', ad: 'May 14, 2025 10:21 AM', delivered: 'May 14, 2025 10:21 AM' },
  { id: 'SMS-2505147', customer: 'Anita Shakya', phone: '+977 9803 112 228', type: 'Payment Reminder', typeKey: 'progress', gateway: 'Ncell', status: 'Delivered', bs: '2082/02/31 BS', ad: 'May 14, 2025 10:15 AM', delivered: 'May 14, 2025 10:15 AM' },
  { id: 'SMS-2505146', customer: 'Prakash Films', phone: '+977 9849 556 677', type: 'Pickup Reminder', typeKey: 'progress', gateway: 'Nepal Telecom', status: 'Delivered', bs: '2082/02/31 BS', ad: 'May 14, 2025 09:58 AM', delivered: 'May 14, 2025 09:59 AM' },
  { id: 'SMS-2505145', customer: 'Cine Vision Pvt. Ltd.', phone: '+977 9851 009 887', type: 'Invoice Notice', typeKey: 'neutral', gateway: 'Twilio', status: 'Failed', bs: '2082/02/31 BS', ad: 'May 14, 2025 09:40 AM', delivered: '—' },
  { id: 'SMS-2505144', customer: 'Bipin Gurung', phone: '+977 9813 445 566', type: 'Return Reminder', typeKey: 'in', gateway: 'Ncell', status: 'Delivered', bs: '2082/02/31 BS', ad: 'May 14, 2025 09:32 AM', delivered: 'May 14, 2025 09:33 AM' },
  { id: 'SMS-2505143', customer: 'Sunil Shrestha', phone: '+977 9860 778 990', type: 'Payment Receipt', typeKey: 'in', gateway: 'Sparrow', status: 'Delivered', bs: '2082/02/31 BS', ad: 'May 14, 2025 09:25 AM', delivered: 'May 14, 2025 09:26 AM' },
  { id: 'SMS-2505142', customer: 'Nepal Film Academy', phone: '+977 9840 556 221', type: 'OTP', typeKey: 'progress', gateway: 'Twilio', status: 'Delivered', bs: '2082/02/31 BS', ad: 'May 14, 2025 09:18 AM', delivered: 'May 14, 2025 09:18 AM' },
  { id: 'SMS-2505141', customer: 'The Frame Productions', phone: '+977 9800 123 456', type: 'Marketing', typeKey: 'danger', gateway: 'Nepal Telecom', status: 'Delivered', bs: '2082/02/31 BS', ad: 'May 14, 2025 09:05 AM', delivered: 'May 14, 2025 09:06 AM' },
]

export const VIEWER = {
  id: 'SMS-2505148',
  status: 'Delivered',
  customer: 'Suman Shrestha',
  vip: true,
  phone: '+977 9841 234 567',
  gateway: 'Sparrow',
  body: [
    'Hi Suman,',
    'Your booking BK-2082-05-1032 for Sony FX6 (24-70mm GM Lens) has been confirmed from May 15, 2082 BS to May 18, 2082 BS.',
    'Thank you for choosing Babin Rentals.',
    '– Team Babin Rentals',
  ],
  meta: 'Characters: 154 | Segments: 1',
  delivery: [
    { label: 'Sent', at: 'May 14, 2025 10:21 AM', done: true },
    { label: 'Delivered', at: 'May 14, 2025 10:21 AM', done: true },
    { label: 'Read', at: 'May 14, 2025 10:32 AM (via Operator)', done: false },
    { label: 'Action Taken', at: '—', done: false },
  ],
  linked: [
    { label: 'Booking', value: 'BK-2082-05-1032' },
    { label: 'Invoice', value: 'INV-2082-05-2018' },
    { label: 'Payment', value: 'Paid NPR 48,500' },
  ],
}

export const TEMPLATES = [
  { name: 'OTP', count: '12' },
  { name: 'Booking Confirmation', count: '18' },
  { name: 'Pickup Reminder', count: '10' },
  { name: 'Return Reminder', count: '12' },
  { name: 'Payment Reminder', count: '14' },
  { name: 'Invoice Notice', count: '9' },
]

export const VOLUME = {
  yTicks: ['3K', '2K', '1K', '0'],
  labels: ['May 8 BS', 'May 9 BS', 'May 10 BS', 'May 11 BS', 'May 12 BS', 'May 13 BS', 'May 14 BS'],
  series: [
    { name: 'Sent', points: [62, 70, 66, 76, 72, 82, 86] },
    { name: 'Delivered', points: [58, 66, 62, 72, 68, 78, 82] },
    { name: 'Failed', points: [8, 10, 9, 12, 10, 13, 11] },
  ],
}

export const GATEWAY_PERF = [
  { name: 'Sparrow SMS', rate: '99.3%', latency: '120 ms', throughput: '412 msg', status: 'Healthy' },
  { name: 'Ncell A2P', rate: '98.9%', latency: '98 ms', throughput: '586 msg', status: 'Healthy' },
  { name: 'Nepal Telecom', rate: '97.8%', latency: '110 ms', throughput: '322 msg', status: 'Healthy' },
  { name: 'Twilio', rate: '99.6%', latency: '150 ms', throughput: '215 msg', status: 'Healthy' },
  { name: 'Vonage', rate: '96.1%', latency: '210 ms', throughput: '98 msg', status: 'Warning' },
]

export const CAMPAIGN_PERF: Slice[] = [
  { label: 'Delivered', value: 12120, display: '12,120', percent: '97.3%' },
  { label: 'Failed', value: 210, display: '210', percent: '1.7%' },
  { label: 'Pending', value: 80, display: '80', percent: '0.6%' },
  { label: 'Cancelled', value: 40, display: '40', percent: '0.3%' },
]
export const CAMPAIGN_TOTAL = '12,450'
export const CAMPAIGN_EXTRA = [
  { label: 'Click Rate', value: '8.6%' },
  { label: 'Conversion Rate', value: '3.2%' },
]

export const SUMMARY = [
  { label: 'SMS Sent Today', value: '2,145' },
  { label: 'Pending Queue', value: '34' },
  { label: 'Delivery Rate', value: '99.1%' },
  { label: 'Gateway Status', value: 'Healthy', tone: 'success' as const },
  { label: 'Failed SMS', value: '18', tone: 'danger' as const },
]

export const ALERTS: Array<{ text: string; when: string; tone: 'danger' | 'progress' | 'primary' }> = [
  { text: 'Low balance in Sparrow SMS', when: 'NPR 24,560', tone: 'progress' },
  { text: 'Nepal Telecom latency high', when: '210 ms', tone: 'progress' },
  { text: '18 SMS delivery failed', when: 'View', tone: 'danger' },
  { text: 'OTP failure rate increased', when: '2.1%', tone: 'progress' },
  { text: 'High queue size detected', when: '34 Pending', tone: 'primary' },
]

export const QUICK_ACTIONS: Array<{ label: string; icon: 'arrow_right' | 'crew' | 'queues' | 'file'; tone: 'success' | 'primary' | 'primary' | 'progress' }> = [
  { label: 'New SMS', icon: 'arrow_right', tone: 'success' },
  { label: 'Send OTP', icon: 'crew', tone: 'primary' },
  { label: 'Broadcast SMS', icon: 'queues', tone: 'primary' },
  { label: 'Create Template', icon: 'file', tone: 'progress' },
]

export const ACTIVITY = [
  { what: 'SMS sent to Suman Shrestha', at: '10:21 AM', tone: 'success' as const },
  { what: 'OTP delivered to +977 9813 445 566', at: '10:18 AM', tone: 'primary' as const },
  { what: 'Campaign "Dashain Offer" started', at: '10:10 AM', tone: 'primary' as const },
  { what: 'Template "Payment Reminder" updated', at: '09:58 AM', tone: 'progress' as const },
  { what: 'Gateway Sparrow SMS connected', at: '09:45 AM', tone: 'success' as const },
]

export const ADVISOR = [
  'Retry 18 failed SMS',
  'Switch to Nepal Telecom for faster delivery',
  'Reduce message length for 1 SMS',
  'Best time to send: 7 – 9 PM',
  'Personalize payment reminders',
]
