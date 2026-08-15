import type { Dest } from '../../../data/settings'
import type { Field, Section } from './shared'

/**
 * **Settings ▸ System** — appearance, notifications, preferences, security and
 * the administration tools.
 *
 * ## 15 Aug 2026 — this tab absorbed Security, and lost seven doors
 *
 * Two changes, both cuts:
 *
 * **1. Security folded in here.** It was a tab of eight rows carrying two
 * editable settings. Its two cards are appended below unchanged; nothing moved
 * "under Security" that was not already there, and nothing from the parked
 * Communication or AI sections was re-pointed at it — `CONFLICTS.md` §11.3's
 * rule still holds: *a WhatsApp token alert filed under Security is worse than
 * no alert.*
 *
 * **2. Six administration links are gone because their screens are gone.**
 * Automation Center, Notification Center, SMS Center, Unified Inbox, AI
 * Assistant and System Monitor were ruled into the archive on 12 Aug. Their
 * Settings *sections* were removed then; their *screens* stayed routed and
 * stayed linked from this card, so the doors moved one level deeper instead of
 * closing. They are now closed: the files live under `src/archive/` (Law 3 —
 * nothing is deleted) and nothing in the running app points at them.
 *
 * The four that remain are the ones with a working screen behind them, joined
 * by Audit Log and Activity Log, which moved here from Tools when Tools became
 * calculators only.
 */

const R = (to: string): Dest => ({ kind: 'route', to })

/**
 * The administration tools, all under `/admin/*`.
 *
 * Each of these used to answer to two URLs — `/admin/audit-log` and
 * `/tools/audit-log` both resolved to the same screen, four pages behind eight
 * routes. `/admin/*` is now the only spelling.
 */
const ADMIN_LINKS: Field[] = [
  { label: 'Audit Log', note: 'Append-only — view-only for every role.', dest: R('/admin/audit-log') },
  { label: 'Activity Log', note: 'Who did what, where — newest first.', dest: R('/admin/activity-log') },
  { label: 'Audit Settings', note: 'What gets logged, and for how long.', dest: R('/admin/audit') },
  { label: 'Numbering Sequences', note: 'Booking, invoice and asset ID formats.', dest: R('/admin/numbering') },
  { label: 'Backup & Restore', note: 'Scheduled backups and restore points.', dest: R('/admin/backup') },
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
      /* The four toggles stay; the "Notification templates" row that pointed at
         the archived Notification Center is gone rather than re-aimed. A row
         whose destination no longer exists is a dead control, and this file's
         standing rule is that no destination is ever dead. */
      { label: 'Return reminders', note: 'Sent 24 hours before a return is due.', on: true },
      { label: 'Payment reminders', note: 'Sent when an invoice passes its due date.', on: true },
      { label: 'Low stock alerts', note: 'When a SKU falls below its minimum.', on: true },
      { label: 'Daily digest', note: 'One summary each morning.', on: false },
    ],
  },
  {
    key: 'preferences',
    title: 'System preferences',
    icon: 'settings',
    fields: [
      { label: 'Date format', note: 'AD line under every BS line.', settingKey: 'dateFormat' },
      { label: 'Decimal places', note: 'Whole rupees unless an amount carries paise.', settingKey: 'decimalPlaces' },
      /* Same key as Security ▸ Access's row below. The two used to be
         independent literals that both said "30 minutes" and could silently
         disagree the moment one was touched. One setting, two places. */
      { label: 'Session timeout', note: 'Signed out after this long idle.', settingKey: 'sessionTimeoutMinutes' },
    ],
  },
  { key: 'admin', title: 'Administration', icon: 'activity', fields: ADMIN_LINKS },
  {
    key: 'access',
    title: 'Access',
    icon: 'crew',
    fields: [
      { label: 'Two-factor authentication', note: 'Required for Owner and Admin roles.', on: true },
      { label: 'Password policy', note: 'Min 12 chars, mixed case, number, symbol. 90-day expiry.', settingKey: 'passwordPolicy' },
      { label: 'Shared-device screen lock', note: 'Locks the tablet between operators.', on: true },
    ],
  },
  {
    key: 'controls',
    title: 'Controls & logs',
    icon: 'file',
    fields: [
      {
        label: 'Data access levels',
        note: 'Warehouse, Technician, Driver and Client see no money — enforced by RLS, not the UI.',
        dest: { kind: 'tab', tab: 'people' },
      },
      /* Dropped 15 Aug: "IP access control" and "Login history" both said only
         that they are not built. Twelve such rows across the eight tabs were
         the single largest contributor to Settings feeling heavy — a row that
         exists to report its own absence is a row the reader must process and
         then discard. */
      { label: 'Audit trail', note: 'Immutable record of every write.', dest: R('/admin/audit') },
    ],
  },
]
