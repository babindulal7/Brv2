import type { Dest } from '../../../data/settings'
import type { Section } from './shared'

/**
 * **Settings ▸ Security** — §11.2: *"access, controls & logs, session lock"*.
 *
 * The shared-device screen lock sits in Access rather than in a section of its
 * own: it is one toggle, and `lib/auth`'s `isSharedDevice` is what actually
 * enforces it.
 *
 * Nothing from the parked Communication or AI sections was re-pointed here.
 * `CONFLICTS.md` §11.3's recommendation is the rule that was followed: *"a
 * WhatsApp token alert filed under Security is worse than no alert."*
 */

const R = (to: string): Dest => ({ kind: 'route', to })
const N = (why: string): Dest => ({ kind: 'none', why })

export const SECURITY_SECTIONS: Section[] = [
  {
    key: 'access',
    title: 'Access',
    icon: 'crew',
    fields: [
      { label: 'Two-factor authentication', note: 'Required for Owner and Admin roles.', on: true },
      /* The same `sessionTimeoutMinutes` as System ▸ Preferences — one setting
         surfaced in both places it is looked for, not two literals. */
      { label: 'Session timeout', note: 'Signed out after this long idle.', settingKey: 'sessionTimeoutMinutes' },
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
        dest: { kind: 'tab', tab: 'users' },
      },
      { label: 'IP access control', note: 'Allow-listed ranges for staff sign-in.', dest: N('IP allow-listing is enforced server side; no console exists yet.') },
      { label: 'Login history', note: 'Every sign-in, device and location.', dest: N('Login history needs the auth backend, which is not connected.') },
      { label: 'Audit trail', note: 'Immutable record of every write.', dest: R('/admin/audit') },
    ],
  },
]
