import { createAction, type ActionConfig, type ActionContext } from '../core'
import { EVENT_TYPES } from '../../events/eventBus'
import { safeUpdate, idempotentInsert } from '../../lib/dataAccess'
import type { Database } from '../../types/database'
import { supabase } from '../../lib/supabase'
import { getClientRecord } from '../../lib/queries/clients'
import { isValidLocalPhone, canonicalPhone, PHONE_STORED_RE } from '../../lib/phone'

/**
 * The write seam for inline edit on `ClientDetail`.
 *
 * `patch` carries **only the keys the operator changed** — never the whole
 * record. `useEditMode` guarantees that, and it is the guarantee that stops an
 * edit of one field silently rewriting a column nobody touched.
 *
 * `safeUpdate` writes through `lib/dataAccess` with mandatory `client_uuid`
 * idempotency tracking (Law 8). Column read-back is strictly non-monetary
 * ('id, client_code, name, phone, updated_at') to avoid 42501 permission traps
 * under Law 6 (0038/0062).
 */

export type UpdateClientInput = {
  /**
   * The client UUID (`clients.id`) or client code (`client_code`, e.g. `CL-2026-0001`).
   * When a code is passed, it is resolved to the client's row UUID before writing.
   */
  clientId: string
  /** Changed keys only. */
  patch: Record<string, unknown>
  /** Law 8 idempotency key. */
  clientUuid?: string | undefined
}

export type UpdateClientResult = {
  success: boolean
  clientId: string
  clientCode?: string | undefined
  changedKeys: string[]
}

const CLIENT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FORBIDDEN_KEYS = new Set([
  'id',
  'client_code',
  'client_uuid',
  'created_at',
  'created_by',
  'status',
  'deactivated_at',
  'deactivated_by',
  'deactivation_reason',
  'merged_into_client_id',
])

export const updateClientConfig: ActionConfig<UpdateClientInput, UpdateClientResult> = {
  name: 'UPDATE_CLIENT',
  permissions: ['client.update'],
  implemented: true,

  validate: (input) => {
    if (!input.clientId || input.clientId.trim() === '') {
      throw new Error('Client ID is required.')
    }
    if (!input.patch || Object.keys(input.patch).length === 0) {
      throw new Error('Nothing to update — the patch is empty.')
    }

    for (const key of Object.keys(input.patch)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Field '${key}' cannot be modified through updateClient.`)
      }
    }

    if ('phone' in input.patch) {
      const rawPhone = input.patch.phone
      if (rawPhone === null || rawPhone === undefined || String(rawPhone).trim() === '') {
        throw new Error('Phone is required — duplicate detection and merge match on it.')
      }
      const strPhone = String(rawPhone).trim()
      if (!PHONE_STORED_RE.test(strPhone) && !isValidLocalPhone(strPhone)) {
        throw new Error('Must be a 10-digit Nepali mobile starting 97 or 98 — for example 9801234567.')
      }
    }

    if ('pan' in input.patch || 'pan_vat' in input.patch) {
      const rawPan = input.patch.pan ?? input.patch.pan_vat
      if (rawPan !== null && rawPan !== undefined && String(rawPan).trim() !== '') {
        const strPan = String(rawPan).trim()
        if (!/^[0-9]{9}$/.test(strPan)) {
          throw new Error('PAN/VAT must be exactly 9 digits.')
        }
      }
    }
  },

  execute: async (input, ctx: ActionContext) => {
    const rawId = input.clientId.trim()
    let resolvedId = rawId
    let clientCode: string | undefined

    if (CLIENT_UUID_RE.test(rawId)) {
      resolvedId = rawId
      // Attempt lookup to obtain clientCode if available
      try {
        const profile = await getClientRecord(rawId)
        if (profile) {
          clientCode = profile.record.id
        }
      } catch {
        // Fall back to resolvedId
      }
    } else {
      const profile = await getClientRecord(rawId)
      if (!profile) {
        throw new Error(`No client with identifier '${rawId}' exists, so nothing was changed.`)
      }
      resolvedId = profile.id
      clientCode = profile.record.id
    }

    const patch = input.patch
    const clientPayload: Record<string, unknown> = {}

    if ('name' in patch && patch.name !== undefined) clientPayload.name = String(patch.name).trim()
    if ('phone' in patch && patch.phone !== undefined) {
      const p = String(patch.phone).trim()
      clientPayload.phone = PHONE_STORED_RE.test(p) ? p : canonicalPhone(p)
    }
    if ('email' in patch) clientPayload.email = patch.email ? String(patch.email).trim() : null
    if ('pan' in patch) clientPayload.pan_vat = patch.pan ? String(patch.pan).trim() : null
    if ('pan_vat' in patch) clientPayload.pan_vat = patch.pan_vat ? String(patch.pan_vat).trim() : null
    if ('address' in patch) clientPayload.address_line = patch.address ? String(patch.address).trim() : null
    if ('address_line' in patch) clientPayload.address_line = patch.address_line ? String(patch.address_line).trim() : null
    if ('city' in patch) clientPayload.city = patch.city ? String(patch.city).trim() : null
    if ('district' in patch) clientPayload.district = patch.district ? String(patch.district).trim() : null
    if ('postalCode' in patch) clientPayload.postal_code = patch.postalCode ? String(patch.postalCode).trim() : null
    if ('postal_code' in patch) clientPayload.postal_code = patch.postal_code ? String(patch.postal_code).trim() : null
    if ('country' in patch && patch.country !== undefined) clientPayload.country = String(patch.country).trim()
    if ('businessRegistrationNo' in patch) {
      clientPayload.business_registration = patch.businessRegistrationNo ? String(patch.businessRegistrationNo).trim() : null
    }
    if ('business_registration' in patch) {
      clientPayload.business_registration = patch.business_registration ? String(patch.business_registration).trim() : null
    }
    if ('website' in patch) clientPayload.website = patch.website ? String(patch.website).trim() : null
    if ('billingAddress' in patch) clientPayload.billing_address = patch.billingAddress ? String(patch.billingAddress).trim() : null
    if ('billing_address' in patch) clientPayload.billing_address = patch.billing_address ? String(patch.billing_address).trim() : null
    if ('notes' in patch) clientPayload.notes = patch.notes ? String(patch.notes).trim() : null
    if ('tags' in patch) clientPayload.tags = patch.tags ?? []
    if ('clientType' in patch) clientPayload.type_parent = patch.clientType ?? null
    if ('type_parent' in patch) clientPayload.type_parent = patch.type_parent ?? null
    if ('organisationType' in patch) clientPayload.org_subtype = patch.organisationType ?? null
    if ('org_subtype' in patch) clientPayload.org_subtype = patch.org_subtype ?? null
    if ('paymentTerms' in patch && patch.paymentTerms !== undefined) clientPayload.payment_terms = patch.paymentTerms
    if ('payment_terms' in patch && patch.payment_terms !== undefined) clientPayload.payment_terms = patch.payment_terms
    if ('approvedCreditLimit' in patch) clientPayload.approved_credit_limit = patch.approvedCreditLimit ?? null
    if ('approved_credit_limit' in patch) clientPayload.approved_credit_limit = patch.approved_credit_limit ?? null
    if ('portal_default_language' in patch) clientPayload.portal_default_language = patch.portal_default_language
    if ('preferred_contact_channels' in patch) clientPayload.preferred_contact_channels = patch.preferred_contact_channels

    // Check contact person fields
    const hasContactFields = 'contact_name' in patch || 'contact_designation' in patch || 'contact_phone' in patch
    if (hasContactFields) {
      const { data: existingContact } = await supabase
        .from('client_contacts')
        .select('id')
        .eq('client_id', resolvedId)
        .eq('is_primary', true)
        .eq('status', 'Active')
        .maybeSingle()

      if (existingContact && (existingContact as { id: string }).id) {
        const contactUpdate: Record<string, unknown> = {}
        if ('contact_name' in patch && patch.contact_name !== undefined) {
          contactUpdate.full_name = String(patch.contact_name).trim()
        }
        if ('contact_designation' in patch) {
          contactUpdate.designation = patch.contact_designation ? String(patch.contact_designation).trim() : null
        }
        if ('contact_phone' in patch) {
          contactUpdate.phone = patch.contact_phone ? String(patch.contact_phone).trim() : null
        }
        if (Object.keys(contactUpdate).length > 0) {
          await safeUpdate(
            'client_contacts' as unknown as keyof Database['public']['Tables'],
            (existingContact as { id: string }).id,
            contactUpdate as unknown as Database['public']['Tables']['branches']['Update'],
            input.clientUuid
          )
        }
      } else if (patch.contact_name && String(patch.contact_name).trim()) {
        await idempotentInsert('client_contacts' as unknown as keyof Database['public']['Tables'], {
          client_id: resolvedId,
          full_name: String(patch.contact_name).trim(),
          designation: patch.contact_designation ? String(patch.contact_designation).trim() : null,
          phone: patch.contact_phone ? String(patch.contact_phone).trim() : null,
          is_primary: true,
          client_uuid: input.clientUuid,
        } as unknown as Database['public']['Tables']['branches']['Insert'])
      }
    }

    if (Object.keys(clientPayload).length > 0) {
      const { data: updatedRow, error } = await safeUpdate(
        'clients' as unknown as keyof Database['public']['Tables'],
        resolvedId,
        clientPayload as unknown as Database['public']['Tables']['branches']['Update'],
        input.clientUuid,
        { returnRow: true, returningColumns: 'id, client_code, name, phone, updated_at' }
      )
      if (error) {
        throw new Error(`Failed to update client: ${error}`)
      }
      if (!updatedRow && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        throw new Error(`Update returned no row for client '${resolvedId}'. Nothing was saved.`)
      }
      if (updatedRow && (updatedRow as unknown as { client_code?: string }).client_code) {
        clientCode = (updatedRow as unknown as { client_code: string }).client_code
      }
    }

    const changedKeys = Object.keys(input.patch)
    const events = [
      {
        type: EVENT_TYPES.CLIENT_UPDATED,
        payload: {
          clientId: resolvedId,
          clientCode,
          /* Keys, not values. A client patch can carry PAN, phone and address;
             the event log is read by roles that `fieldGating` keeps those from. */
          changedKeys,
          timestamp: new Date().toISOString(),
          userId: ctx.userId,
        },
      },
    ]

    return {
      result: {
        success: true,
        clientId: resolvedId,
        clientCode,
        changedKeys,
      },
      events,
    }
  },
}

export const updateClient = createAction<UpdateClientInput, UpdateClientResult>(updateClientConfig)
