import type { Dest } from '../../../data/settings'
import type { Section } from './shared'

/**
 * **Settings ▸ Apps & API** — §11.2: *"integrations, keys, payment gateways"*.
 *
 * The tab key stays `integrations` because `?tab=integrations` is a live deep
 * link and four Administration Modules rows point at it; only the label follows
 * the spec. Every row here is a `Dest` with a stated reason, so a gateway that
 * has no credentials in this build cannot render as a live-looking control.
 */

const R = (to: string): Dest => ({ kind: 'route', to })
const N = (why: string): Dest => ({ kind: 'none', why })

export const APPS_API_SECTIONS: Section[] = [
  {
    key: 'gateways',
    title: 'Payment gateways',
    icon: 'card',
    fields: [
      { label: 'Khalti', note: 'Wallet and QR collection.', dest: N('No gateway credentials exist in this build.') },
      { label: 'eSewa', note: 'Wallet and QR collection.', dest: N('No gateway credentials exist in this build.') },
      { label: 'Fonepay', note: 'Inter-bank QR.', dest: N('No gateway credentials exist in this build.') },
      { label: 'ConnectIPS', note: 'Direct bank debit.', dest: N('No gateway credentials exist in this build.') },
      { label: 'Bank transfer & cash', note: 'Recorded by hand against an invoice.', dest: R('/finance') },
    ],
  },
  {
    key: 'apps',
    title: 'Apps & API',
    icon: 'plug',
    fields: [
      { label: 'Accounting', note: 'Xero, Zoho Books, QuickBooks.', dest: N('No accounting connector is built.') },
      { label: 'Calendar', note: 'Google Calendar and Outlook sync.', dest: N('No calendar connector is built — the in-app calendar is not a sync target.') },
      { label: 'Automation & webhooks', note: 'Event triggers and outbound calls.', dest: R('/automation') },
      { label: 'REST API keys', note: 'Tokens for third-party access.', dest: N('Key issuance needs the auth backend, which is not connected.') },
    ],
  },
]
