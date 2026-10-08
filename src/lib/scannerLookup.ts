import { supabase } from './supabase'

export type ScanLookupResult =
  | {
      status: 'unit_matched'
      code: string
      label: string
      unitId: string
      serialNo: string | null
      assetTag: string | null
      productName: string
      unitStatus: string
    }
  | {
      status: 'product_matched'
      code: string
      label: string
      productId: string
      assetCode: string
      productName: string
    }
  | {
      status: 'booking_matched'
      code: string
      label: string
      bookingId: string
      bookingNo: string
      stage: string
    }
  | {
      status: 'unknown_code'
      code: string
      message: string
    }
  | {
      status: 'query_failed'
      code: string
      error: string
    }

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolves a scanned barcode, QR code, or serial number against the inventory
 * and bookings database with an honest, strict contract (AUD-002).
 */
export async function resolveScannedCode(rawCode: string): Promise<ScanLookupResult> {
  const code = (rawCode || '').trim()
  if (!code) {
    return {
      status: 'unknown_code',
      code: '',
      message: 'Empty barcode string provided.',
    }
  }

  const isUuid = UUID_REGEX.test(code)
  const uuidParam = isUuid ? code : ZERO_UUID

  try {
    // 1. Check serialized physical units in product_units_v
    const { data: unit, error: unitError } = await supabase
      .from('product_units_v')
      .select(`
        id,
        serial_no,
        asset_tag,
        barcode,
        qr_code,
        status,
        condition,
        product:products_v (
          id,
          name,
          brand,
          model,
          asset_code
        )
      `)
      .or(`barcode.eq.${code},serial_no.eq.${code},asset_tag.eq.${code},id.eq.${uuidParam}`)
      .maybeSingle()

    if (unitError && unitError.code !== 'PGRST116') {
      // Non-404 error
      console.warn('[ScannerLookup] product_units_v query error:', unitError.message)
    }

    if (unit) {
      const p = (unit as unknown as { product?: { brand?: string; model?: string; name?: string; asset_code?: string } }).product
      const brandStr = p?.brand ? `${p.brand} ` : ''
      const nameStr = p?.model || p?.name || 'Unit'
      const label = `${brandStr}${nameStr}`.trim()

      return {
        status: 'unit_matched',
        code,
        label,
        unitId: unit.id,
        serialNo: unit.serial_no ?? null,
        assetTag: unit.asset_tag ?? null,
        productName: p?.name || label,
        unitStatus: unit.status,
      }
    }

    // 2. Check catalog products in products_v (bulk or model-level barcode)
    const { data: prod } = await supabase
      .from('products_v')
      .select('id, name, brand, model, asset_code')
      .or(`asset_code.eq.${code},id.eq.${uuidParam}`)
      .maybeSingle()

    if (prod) {
      const brandStr = prod.brand ? `${prod.brand} ` : ''
      const nameStr = prod.model || prod.name
      const label = `${brandStr}${nameStr}`.trim()

      return {
        status: 'product_matched',
        code,
        label,
        productId: prod.id,
        assetCode: prod.asset_code,
        productName: prod.name,
      }
    }

    // 3. Check bookings by booking_no or UUID
    const { data: booking } = await supabase
      .from('bookings')
      .select('id, booking_no, stage')
      .or(`booking_no.eq.${code},id.eq.${uuidParam}`)
      .maybeSingle()

    if (booking) {
      return {
        status: 'booking_matched',
        code,
        label: `Booking ${booking.booking_no} (${booking.stage})`,
        bookingId: booking.id,
        bookingNo: booking.booking_no,
        stage: booking.stage,
      }
    }

    // 4. Honest: Not found
    return {
      status: 'unknown_code',
      code,
      message: `Unknown code "${code}" — no unit or booking matches.`,
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      status: 'query_failed',
      code,
      error: errorMsg,
    }
  }
}
