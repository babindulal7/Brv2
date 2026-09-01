/**
 * **What a screen may actually offer to send — `WHATSAPP_LINKS_SPEC_v1.0` §3.**
 *
 * `whatsappTemplates.ts` answers *"which templates suit this stage and this
 * role"*; this module answers the next question, which is the one a button
 * needs: *"can this particular message be composed right now, and if not, what
 * is the true reason?"*
 *
 * It is pure — booking facts, settings and a phone number in, menu descriptors
 * out — so the reasons are unit-testable rather than only reachable by driving
 * a screen with four settings in four states.
 *
 * ## Why the reasons matter more than the happy path
 *
 * Every client-facing template needs at least one value this repo did not have
 * before 1 Sep 2026: a usual pickup time, a usual return time, a contact
 * number. The spec files all three under its own §6.1 OPEN list. They are now
 * owner-set settings that default to **blank**, so the honest state on the day
 * this ships is "most of these are unavailable, and each says why". A
 * disabled control that states its cause is the app working correctly (Law 12);
 * a control that sends "Pickup from 10:00 AM" because a developer picked an
 * hour is the app lying in writing to a client.
 */

import { buildWaLink, NO_PHONE_REASON, normalisePhone } from './whatsapp'
import {
  balanceDue,
  bookingConfirmed,
  gearReady,
  overdue,
  pickupTomorrow,
  returnReminder,
  templatesForStage,
  type WaBusiness,
  type WaStage,
  type WaTemplateId,
  type WaTemplateMeta,
} from './whatsappTemplates'
import type { Paisa } from './money'
import type { SystemRole } from '../types/database'

/** The booking facts a message needs, all read from canonical queries (Law 2). */
export interface WaBookingFacts {
  clientName: string
  bookingNo: string
  stage: WaStage
  startIso: string
  endIso: string
  itemCount: number
  /** A few line descriptions for the confirmation's summary. */
  topLines: string[]
  isOverdue: boolean
  /** `null` when the session may not see money, or when no invoice exists yet. */
  total: Paisa | null
  advance: Paisa | null
  deposit: Paisa | null
  balance: Paisa | null
}

/** The owner-set strings. Blank is legal and means "not set" (§6.1). */
export interface WaSettings {
  businessName: string
  businessPhone: string
  defaultPickupTime: string
  defaultReturnTime: string
}

export interface WaAction {
  id: WaTemplateId
  label: string
  /** The composed `wa.me` URL, or `null` when {@link WaAction.unavailable} is set. */
  href: string | null
  /** Present ⇒ render the control disabled and show this verbatim (Law 12). */
  unavailable?: string
}

const SETTINGS_PATH = 'Settings ▸ Organisation ▸ General'

/**
 * Build the menu for one booking, most likely first.
 *
 * Returns `[]` when the stage offers nothing — a Quote, or a money-blind role
 * on a booking whose only remaining message is a money one. An empty array is
 * the signal to omit the group header entirely rather than render an empty
 * menu section.
 */
export function whatsappActionsFor(args: {
  facts: WaBookingFacts
  settings: WaSettings
  role: SystemRole
  /** As stored on the client record; `null`/blank is the ordinary missing case. */
  clientPhone: string | null
}): WaAction[] {
  const { facts, settings, role, clientPhone } = args

  const offered: WaTemplateMeta[] = templatesForStage({
    stage: facts.stage,
    role,
    isOverdue: facts.isOverdue,
    /* Only offer the balance reminder when a balance is both VISIBLE to this
       session and greater than zero. `null` means "not fetched or not
       permitted", which is not the same as "nothing owed" and must not be
       rendered as a reminder for Rs 0. */
    hasBalance: facts.balance != null && facts.balance > 0,
  })

  const business: WaBusiness = {
    businessName: settings.businessName,
    businessPhone: settings.businessPhone,
  }

  /* One phone check for the whole menu: it is the same recipient for every
     template, so a missing number disables all of them for one reason rather
     than repeating itself per row. */
  const phoneOk = normalisePhone(clientPhone) !== null

  return offered.map((meta): WaAction => {
    if (!phoneOk) return { id: meta.id, label: meta.label, href: null, unavailable: NO_PHONE_REASON }

    const built = compose(meta.id, facts, settings, business)
    if (typeof built !== 'string') {
      return { id: meta.id, label: meta.label, href: null, unavailable: built.reason }
    }
    return { id: meta.id, label: meta.label, href: buildWaLink(clientPhone, built) }
  })
}

/** A template that cannot be composed, and the reason a person can act on. */
interface Blocked {
  reason: string
}

function compose(
  id: WaTemplateId,
  f: WaBookingFacts,
  s: WaSettings,
  b: WaBusiness,
): string | Blocked {
  const base = {
    clientName: f.clientName,
    bookingNo: f.bookingNo,
    startIso: f.startIso,
    endIso: f.endIso,
  }

  switch (id) {
    case 'booking_confirmed': {
      /* Two independent gaps, reported separately — being told "set a pickup
         time" when the real problem is a missing invoice would send someone to
         the wrong screen. */
      if (f.total == null) {
        return {
          reason:
            'This booking has no invoiced total to quote yet. The confirmation states a figure, so it waits for the invoice rather than sending a blank one.',
        }
      }
      if (!s.defaultPickupTime) return { reason: missingTime('pickup') }
      return bookingConfirmed(
        {
          ...base,
          lineCount: f.itemCount,
          topLines: f.topLines,
          total: f.total,
          advance: f.advance,
          deposit: f.deposit,
          pickupTime: s.defaultPickupTime,
        },
        b,
      )
    }

    case 'gear_ready': {
      if (!s.defaultPickupTime) return { reason: missingTime('pickup') }
      return gearReady({ ...base, pickupWindow: s.defaultPickupTime }, b)
    }

    case 'pickup_tomorrow': {
      if (!s.defaultPickupTime) return { reason: missingTime('pickup') }
      return pickupTomorrow({ ...base, pickupTime: s.defaultPickupTime }, b)
    }

    case 'return_reminder': {
      if (!s.defaultReturnTime) return { reason: missingTime('return') }
      return returnReminder({ ...base, returnTime: s.defaultReturnTime }, b)
    }

    case 'overdue': {
      if (!s.businessPhone) {
        return {
          reason: `An overdue notice tells the client to ring instead of replying, and no contact number is set. Add one under ${SETTINGS_PATH}.`,
        }
      }
      return overdue(base, b)
    }

    case 'balance_due': {
      /* Unreachable via templatesForStage, which only offers this when the
         balance is a positive number. Kept as a refusal rather than a `!`
         assertion so a future caller cannot turn it into "Rs 0 outstanding". */
      if (f.balance == null || f.balance <= 0) {
        return { reason: 'No outstanding balance is recorded on this booking.' }
      }
      return balanceDue({ clientName: f.clientName, bookingNo: f.bookingNo, balance: f.balance }, b)
    }

    /* Composed by the payment flow and the closing screen, which hold figures
       a booking row does not — they are not offered from a booking's menu. */
    case 'payment_receipt':
    case 'daily_digest':
      return { reason: 'Sent from its own screen, not from the booking.' }
  }
}

function missingTime(which: 'pickup' | 'return'): string {
  return `No usual ${which} time is set, and this message states one. Add it under ${SETTINGS_PATH} — it is deliberately blank rather than guessed.`
}
