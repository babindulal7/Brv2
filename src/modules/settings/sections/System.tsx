import type { Dest } from '../../../data/settings'
import type { Field, Section } from './shared'

/**
 * **Settings ▸ System** — §11.2: *"appearance (theme, text size),
 * notifications, system preferences"*.
 *
 * **Notifications moved here, and that is not a liberty.** §11.2 parks
 * *Channels / Communication* but lists **notifications** under System, so the
 * four reminder toggles keep a home while the channel configuration (Email,
 * SMS, WhatsApp, Push, templates) goes with the parked section. The Notification
 * Center, SMS Center and Unified Inbox *screens* are still routed and still
 * linked from the System card below, so nothing built lost its only door
 * (Law 3, and this file's own rule that no destination is ever dead).
 */

const R = (to: string): Dest => ({ kind: 'route', to })

/**
 * §5.1 places Administration, Automation Center, Communication Center, AI
 * Assistant and System Monitor **inside Settings** — none keeps a sidebar slot.
 * Their screens were built and routed; what was missing was a door in. This
 * group is that door, and it is the reason parking three Settings *sections*
 * orphaned no *screen*.
 */
const SYSTEM_LINKS: Field[] = [
  { label: 'Numbering Sequences', note: 'Booking, invoice and asset ID formats.', dest: R('/admin/numbering') },
  { label: 'Audit Settings', note: 'What gets logged, and for how long.', dest: R('/admin/audit') },
  { label: 'Backup & Restore', note: 'Scheduled backups and restore points.', dest: R('/admin/backup') },
  { label: 'Automation Center', note: 'Rules, triggers and scheduled jobs.', dest: R('/automation') },
  { label: 'Notification Center', note: 'Broadcasts, templates and delivery.', dest: R('/notifications') },
  { label: 'SMS Center', note: 'SMS templates, credits and delivery log.', dest: R('/notifications/sms') },
  { label: 'Unified Inbox', note: 'Client messages across every channel, one queue.', dest: R('/notifications/inbox') },
  { label: 'AI Assistant', note: 'Ask about bookings, stock and money.', dest: R('/ai') },
  { label: 'System Monitor', note: 'Services, jobs and incidents.', dest: R('/system') },
  { label: 'Documents', note: 'Every generated invoice, quote and agreement.', dest: R('/documents') },
]

export const SYSTEM_SECTIONS: Section[] = [
  {
    key: 'appearance',
    title: 'Appearance',
    icon: 'sun',
    fields: [
      { label: 'Theme', note: 'Light uses a blue primary; dark uses gold.', value: '—' },
      {
        label: 'Text size',
        note: 'Scales the whole application. Additive to browser zoom, not a replacement for it.',
        value: '—',
      },
      { label: 'Density', note: 'Row height across tables.', settingKey: 'density' },
    ],
  },
  {
    key: 'notifications',
    title: 'Notifications',
    icon: 'bell',
    fields: [
      { label: 'Return reminders', note: 'Sent 24 hours before a return is due.', on: true },
      { label: 'Payment reminders', note: 'Sent when an invoice passes its due date.', on: true },
      { label: 'Low stock alerts', note: 'When a SKU falls below its minimum.', on: true },
      { label: 'Daily digest', note: 'One summary each morning.', on: false },
      { label: 'Notification templates', note: 'Wording for every automatic message.', dest: R('/notifications') },
    ],
  },
  {
    key: 'preferences',
    title: 'System preferences',
    icon: 'settings',
    fields: [
      { label: 'Date format', note: 'AD line under every BS line.', settingKey: 'dateFormat' },
      { label: 'Decimal places', note: 'Whole rupees unless an amount carries paise.', settingKey: 'decimalPlaces' },
      /* Same key as Security ▸ Access's row. The two used to be independent
         literals that both said "30 minutes" and could silently disagree the
         moment one was touched. One setting, two places. */
      { label: 'Session timeout', note: 'Signed out after this long idle.', settingKey: 'sessionTimeoutMinutes' },
      { label: 'System maintenance', note: 'Services, jobs and incidents.', dest: R('/system') },
    ],
  },
  { key: 'system', title: 'System', icon: 'activity', fields: SYSTEM_LINKS },
]
