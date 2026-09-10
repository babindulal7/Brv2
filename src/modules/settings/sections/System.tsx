import type { Dest } from '../../../lib/queries/settings'
import type { Field, Section } from './shared'
import { DevicePinControl } from './DevicePin'

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
      /* v4.1 §2 retired gold from every action and v4.2 keeps it there: the
         primary is blue in BOTH themes, and gold survives only on the external
         `--ext` outline and the brand mark. The old note ("dark uses gold")
         described a palette that has not existed since 25 Aug, and pointed a
         reader straight at the action colour the spec bans. */
      { label: 'Theme', note: 'Light is the default. Both themes use a blue primary.', value: '—' },
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
      /*
       * The idle lock used to sit here as "Session timeout", and moved to
       * Security ▸ Access on 25 Aug 2026 — it is the duration of the screen
       * lock declared in that card, two rows above the PIN that reopens it.
       *
       * It is NOT duplicated back into this card. The comment that stood here
       * described the row as living in both places deliberately ("one setting,
       * two places"), but by then only this copy existed, and two inputs bound
       * to one settingKey render two ids and two Save affordances for the same
       * value — the FinancialPane double-Save shape.
       */
    ],
  },
  /**
   * **Operations rules** — added 16 Aug 2026.
   *
   * Five rulings (PLAN.md §4.30, §4.31) that were constants in the engines
   * until now. They are here because each is a genuine business decision an
   * owner may need to change without a release — and two of them were ruled
   * close enough that they may well be revisited: the turnaround one was taken
   * *against* the recommendation put with it.
   *
   * Every default is the ruled answer, so surfacing these changed no behaviour.
   * `readBy` names the module that reads each one live, per §11.4 — *"Every
   * value here is read by a screen. None is hardcoded."*
   *
   * ⚠ This card is the one place in Settings where a change alters what the
   * **warehouse** can physically do with gear, not how a number is displayed.
   */
  {
    key: 'operations',
    title: 'Operations rules',
    icon: 'box',
    fields: [
      {
        label: 'Unit availability',
        note: 'Which units Auto Assign Serials will not pick. Gear already booked for the dates is excluded either way — this is about condition.',
        settingKey: 'unitAvailabilityRule',
        readBy: 'lib/queries/availability.ts (every Confirm)',
      },
      {
        label: 'Turnaround between rentals',
        note: 'Whether gear returning at 18:00 can go out again at 18:00, or needs time in between.',
        settingKey: 'rentalTurnaround',
        readBy: 'lib/queries/availability.ts (every Confirm)',
      },
      {
        label: 'Packing tree grouping',
        note: 'How the packing bench groups a booking — by the bundle it was sold as, or by category.',
        settingKey: 'packingTreeGrouping',
        readBy: 'modules/rentals/PackingWorkspace.tsx',
      },
      {
        label: 'Packing photos required',
        note: 'Photos of the packed booking before Complete Packing is allowed. Zero turns the gate off.',
        settingKey: 'packingPhotosRequired',
        readBy: 'modules/rentals/PackingWorkspace.tsx',
      },
      {
        label: 'Evidence photo retention',
        note: 'How long a photo file is kept after a booking completes. The record of who took it, and when, is always kept.',
        settingKey: 'evidenceRetentionDays',
        readBy: 'modules/rentals/EvidenceWorkspace.tsx',
      },
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
      /*
       * How long that lock waits — moved here from System preferences on
       * 25 Aug 2026, by ruling. It reads as one idea in this order: the lock,
       * its delay, and the PIN that reopens it.
       *
       * **Off is the default and 0 spells it.** The old row said "Session
       * timeout / Signed out after this long idle", which was wrong twice
       * over: `lib/auth.tsx` locks the screen and never signs anyone out, and
       * the timer does nothing at all until someone puts a number here.
       *
       * The "if a PIN is set" clause is load-bearing rather than a caveat: with
       * no PIN there is nothing to unlock with, so the timer stands down
       * instead of stranding — or, as it used to, signing the operator out
       * mid-Handover.
       */
      {
        label: 'Idle screen lock',
        note: 'Locks the screen after this long idle, if a PIN is set. 0 = off. Never signs you out.',
        settingKey: 'sessionTimeoutMinutes',
      },
      /*
       * Device PIN — added 24 Aug 2026, deliberately as a row in THIS card and
       * not a card of its own. It belongs beside the screen-lock toggle because
       * it is the credential that toggle's lock consumes; separated, a reader
       * has to work out that the two are one feature.
       *
       * It is also the only row on this page whose control is live against the
       * database, which is why `Field.custom` exists. See its comment in
       * `shared.tsx`.
       *
       * ⚠ The password policy row above does NOT govern this PIN, and the note
       * says six digits so the two cannot be read as one rule. A 12-character
       * minimum would make a 6-digit PIN unsettable; they are different
       * credential classes — one is proof of identity, the other re-admits a
       * session that already proved it (migration 0066).
       */
      {
        label: 'Device PIN',
        note: 'Six digits, used only to re-open a session locked on this device. It cannot sign you in, and it is not governed by the password policy above.',
        custom: <DevicePinControl />,
      },
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
