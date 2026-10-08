/**
 * Universal Entity ID Lookup & Autocomplete Engine — Babin Rentals OS
 *
 * Provides fast, offline-first search and suggestions for equipment asset tags,
 * booking numbers, clients, invoices, quotes, and transport dispatch records.
 */

import { supabase } from '../supabase'
import type { InternalNote } from './internalNotes'
import { getReferenceKind, type EntityReferenceKind } from './internalNotes'

export type EntityLookupKind =
  | 'all'
  | 'equipment'
  | 'booking'
  | 'client'
  | 'invoice'
  | 'quote'
  | 'transport'
  | 'custom'

export interface EntityLookupItem {
  id: string
  kind: EntityReferenceKind
  code: string // e.g. EQ-SONY-FX6-01, BR-2613, CL-1049, INV-2041, TR-HILUX-01
  title: string
  subtitle: string
  badge?: string | undefined
  badgeTone?: 'neutral' | 'primary' | 'in' | 'warning' | 'danger' | undefined
  status?: string | undefined
}

/** Standard fast catalogue representing Babin Rentals fleet & operations */
export const FLEET_CATALOG_SEED: EntityLookupItem[] = [
  // Equipment
  {
    id: 'eq-sony-fx6-01',
    kind: 'equipment',
    code: 'EQ-SONY-FX6-01',
    title: 'Sony FX6 Cinema Camera #01',
    subtitle: 'Camera · Sensor Cleaned · Ready',
    badge: 'In Stock',
    badgeTone: 'in',
  },
  {
    id: 'eq-sony-fx6-02',
    kind: 'equipment',
    code: 'EQ-SONY-FX6-02',
    title: 'Sony FX6 Cinema Camera #02',
    subtitle: 'Camera · Sensor wet clean required',
    badge: 'Maintenance',
    badgeTone: 'danger',
  },
  {
    id: 'eq-sony-fx6-03',
    kind: 'equipment',
    code: 'EQ-SONY-FX6-03',
    title: 'Sony FX6 Cinema Camera #03',
    subtitle: 'Camera · Out on Himalayan shoot',
    badge: 'On Rent',
    badgeTone: 'warning',
  },
  {
    id: 'eq-arri-sky-01',
    kind: 'equipment',
    code: 'EQ-ARRI-SKY-01',
    title: 'ARRI SkyPanel S60-C Softlight #01',
    subtitle: 'Lighting · Complete with PSU & Case',
    badge: 'In Stock',
    badgeTone: 'in',
  },
  {
    id: 'eq-arri-sky-02',
    kind: 'equipment',
    code: 'EQ-ARRI-SKY-02',
    title: 'ARRI SkyPanel S60-C Softlight #02',
    subtitle: 'Lighting · Shelf C-04',
    badge: 'In Stock',
    badgeTone: 'in',
  },
  {
    id: 'eq-aput-600d-01',
    kind: 'equipment',
    code: 'EQ-APUT-600D-01',
    title: 'Aputure LS 600d Pro Daylight #01',
    subtitle: 'Lighting · Bowens Mount with Reflector',
    badge: 'Reserved',
    badgeTone: 'primary',
  },
  {
    id: 'eq-aput-600d-02',
    kind: 'equipment',
    code: 'EQ-APUT-600D-02',
    title: 'Aputure LS 600d Pro Daylight #02',
    subtitle: 'Lighting · Commercial shoot',
    badge: 'On Rent',
    badgeTone: 'warning',
  },
  {
    id: 'eq-dji-rs3-01',
    kind: 'equipment',
    code: 'EQ-DJI-RS3-01',
    title: 'DJI RS 3 Pro Gimbal Combo #01',
    subtitle: 'Grip · Focus Motor & RavenEye',
    badge: 'In Stock',
    badgeTone: 'in',
  },
  {
    id: 'eq-nisi-prime-01',
    kind: 'equipment',
    code: 'EQ-NISI-PRIME-01',
    title: 'NiSi Athena Cinema Prime Set 5-Lens',
    subtitle: 'Lenses · 14/24/35/50/85mm PL/E',
    badge: 'In Stock',
    badgeTone: 'in',
  },
  {
    id: 'eq-red-v-raptor-01',
    kind: 'equipment',
    code: 'EQ-RED-V-RAPTOR-01',
    title: 'RED V-Raptor 8K VV Cinema Package',
    subtitle: 'Camera · 8K Multi-Format Large Format',
    badge: 'In Stock',
    badgeTone: 'in',
  },
  {
    id: 'eq-blackmagic-6k-01',
    kind: 'equipment',
    code: 'EQ-BLACKMAGIC-6K-01',
    title: 'Blackmagic Pocket Cinema 6K Pro #01',
    subtitle: 'Camera · EF Mount with EVF',
    badge: 'In Stock',
    badgeTone: 'in',
  },
  {
    id: 'eq-senn-g4-mic-01',
    kind: 'equipment',
    code: 'EQ-SENN-G4-MIC-01',
    title: 'Sennheiser EW 100 G4 Wireless Mic Kit',
    subtitle: 'Audio · Bodypack & ME 2-II Omni',
    badge: 'In Stock',
    badgeTone: 'in',
  },
  {
    id: 'eq-teradek-bolt-01',
    kind: 'equipment',
    code: 'EQ-TERADEK-BOLT-01',
    title: 'Teradek Bolt 4K LT 750 Wireless Video',
    subtitle: 'Monitoring · Zero-Delay 4K Transmitter',
    badge: 'Reserved',
    badgeTone: 'primary',
  },
  {
    id: 'eq-easyrig-vario5-01',
    kind: 'equipment',
    code: 'EQ-EASYRIG-VARIO5-01',
    title: 'Easyrig Vario 5 with Gimbal Rig Vest',
    subtitle: 'Support · 5-17kg Weight Support',
    badge: 'In Stock',
    badgeTone: 'in',
  },

  // Bookings
  {
    id: 'br-2613',
    kind: 'booking',
    code: 'BR-2613',
    title: 'BR-2613 · Everest Media Production',
    subtitle: 'Himalayan Documentary Series · 9 Cases',
    badge: 'On Rent',
    badgeTone: 'warning',
  },
  {
    id: 'br-2614',
    kind: 'booking',
    code: 'BR-2614',
    title: 'BR-2614 · Himal Films Music Video',
    subtitle: 'Kathmandu Valley Location Shoot',
    badge: 'Packed',
    badgeTone: 'primary',
  },
  {
    id: 'br-2615',
    kind: 'booking',
    code: 'BR-2615',
    title: 'BR-2615 · Sagarmatha Cine Arts',
    subtitle: 'Bhaktapur Durbar Square Commercial',
    badge: 'Booked',
    badgeTone: 'neutral',
  },
  {
    id: 'br-2616',
    kind: 'booking',
    code: 'BR-2616',
    title: 'BR-2616 · Nepal Studios Fashion Campaign',
    subtitle: 'Pokhara Lakeside Shoot · FX6 + NiSi',
    badge: 'Booked',
    badgeTone: 'neutral',
  },
  {
    id: 'br-2617',
    kind: 'booking',
    code: 'BR-2617',
    title: 'BR-2617 · Creative KTM Fonepay TVC',
    subtitle: 'Patan Studio Floor · SkyPanel Rig',
    badge: 'Confirmed',
    badgeTone: 'in',
  },
  {
    id: 'br-2618',
    kind: 'booking',
    code: 'BR-2618',
    title: 'BR-2618 · Royal Events Docuseries',
    subtitle: 'Wedding Cinema Coverage 3-Day',
    badge: 'On Rent',
    badgeTone: 'warning',
  },

  // Clients
  {
    id: 'cl-1049',
    kind: 'client',
    code: 'CL-1049',
    title: 'Kathmandu Ad Lab Pvt Ltd',
    subtitle: 'Client · Contact: Rajesh Shrestha · +977 9801234567',
    badge: 'Gold Tier',
    badgeTone: 'primary',
  },
  {
    id: 'cl-1050',
    kind: 'client',
    code: 'CL-1050',
    title: 'Everest Cinema Works',
    subtitle: 'Client · Contact: Pema Sherpa · +977 9851098765',
    badge: 'Verified',
    badgeTone: 'in',
  },
  {
    id: 'cl-1051',
    kind: 'client',
    code: 'CL-1051',
    title: 'Pokhara Documentaries',
    subtitle: 'Client · Contact: Anand Gurung · +977 9841223344',
    badge: 'Active',
    badgeTone: 'neutral',
  },
  {
    id: 'cl-1052',
    kind: 'client',
    code: 'CL-1052',
    title: 'Himalayan Broadcast Corp',
    subtitle: 'Client · Accounts: Accounts Dept · +977 9802001122',
    badge: 'VIP Corporate',
    badgeTone: 'primary',
  },

  // Invoices & Quotes
  {
    id: 'inv-2041',
    kind: 'invoice',
    code: 'INV-2041',
    title: 'Tax Invoice INV-2041',
    subtitle: 'Everest Media · Linked to BR-2613',
    badge: 'Pending',
    badgeTone: 'warning',
  },
  {
    id: 'inv-2042',
    kind: 'invoice',
    code: 'INV-2042',
    title: 'Tax Invoice INV-2042',
    subtitle: 'Himal Films · Linked to BR-2614',
    badge: 'Settled',
    badgeTone: 'in',
  },
  {
    id: 'q-1049',
    kind: 'quote',
    code: 'Q-1049',
    title: 'Rental Estimate Q-1049',
    subtitle: 'Kathmandu Ad Lab · 3-Day Lighting Setup',
    badge: 'Quoted',
    badgeTone: 'primary',
  },

  // Transport & Dispatch
  {
    id: 'tr-hilux-01',
    kind: 'transport',
    code: 'TR-HILUX-01',
    title: 'Toyota Hilux 4x4 Crew Cab (BA 2 PA 4455)',
    subtitle: 'Dispatch Vehicle · Driver: Bikash Sharma',
    badge: 'En Route',
    badgeTone: 'warning',
  },
  {
    id: 'tr-hiace-02',
    kind: 'transport',
    code: 'TR-HIACE-02',
    title: 'Toyota HiAce Gear Van (BA 1 JA 9988)',
    subtitle: 'Logistics Van · Warehouse Base',
    badge: 'Available',
    badgeTone: 'in',
  },
]

/**
 * Searches local catalog and Supabase live tables for matching entities.
 * Returns fast, deduplicated search results.
 */
export async function searchEntityLookup(
  term: string,
  kind: EntityLookupKind = 'all',
  limit: number = 15,
): Promise<EntityLookupItem[]> {
  const query = term.trim().toLowerCase()
  const results: EntityLookupItem[] = []
  const seenCodes = new Set<string>()

  const matchesKind = (itemKind: EntityReferenceKind) => {
    if (kind === 'all') return true
    if (kind === 'equipment') return itemKind === 'equipment'
    if (kind === 'booking') return itemKind === 'booking'
    if (kind === 'client') return itemKind === 'client'
    if (kind === 'invoice') return itemKind === 'invoice' || itemKind === 'payment'
    if (kind === 'quote') return itemKind === 'quote'
    if (kind === 'transport') return itemKind === 'transport'
    return true
  }

  // 1. Filter local fleet catalog
  for (const item of FLEET_CATALOG_SEED) {
    if (!matchesKind(item.kind)) continue

    const matchesQuery =
      !query ||
      item.code.toLowerCase().includes(query) ||
      item.title.toLowerCase().includes(query) ||
      item.subtitle.toLowerCase().includes(query)

    if (matchesQuery) {
      results.push(item)
      seenCodes.add(item.code.toUpperCase())
    }
  }

  // 2. Query live database if online and search query is at least 2 chars
  if (query.length >= 2) {
    try {
      if (kind === 'all' || kind === 'equipment') {
        const { data: units } = await supabase
          .from('product_units_v')
          .select('id, asset_tag, serial_no, status, product:products_v(name, category)')
          .or(`asset_tag.ilike.%${query}%,serial_no.ilike.%${query}%`)
          .limit(limit)

        if (units) {
          for (const u of units) {
            const rawTag = (u.asset_tag ?? '').trim().toUpperCase()
            if (rawTag && !seenCodes.has(rawTag)) {
              seenCodes.add(rawTag)
              const prod = u.product as { name?: string; category?: string } | null
              results.push({
                id: u.id,
                kind: 'equipment',
                code: rawTag,
                title: prod?.name || `Unit ${rawTag}`,
                subtitle: `${prod?.category || 'Gear'} · Serial: ${u.serial_no || 'None'}`,
                badge: u.status || 'Active',
                badgeTone: u.status === 'In Stock' ? 'in' : u.status === 'On Rent' ? 'warning' : 'neutral',
              })
            }
          }
        }
      }

      if (kind === 'all' || kind === 'booking') {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, booking_no, project, stage, client_name')
          .or(`booking_no.ilike.%${query}%,project.ilike.%${query}%,client_name.ilike.%${query}%`)
          .limit(limit)

        if (bookings) {
          for (const b of bookings) {
            const code = `BR-${b.booking_no}`.toUpperCase()
            if (!seenCodes.has(code)) {
              seenCodes.add(code)
              results.push({
                id: b.id,
                kind: 'booking',
                code,
                title: `${code} · ${b.client_name || 'Booking'}`,
                subtitle: b.project || `Stage: ${b.stage}`,
                badge: b.stage,
                badgeTone: b.stage === 'On Rent' ? 'warning' : b.stage === 'Packed' ? 'primary' : 'neutral',
              })
            }
          }
        }
      }

      if (kind === 'all' || kind === 'client') {
        const { data: clients } = await supabase
          .from('clients')
          .select('id, name, phone, company')
          .or(`name.ilike.%${query}%,company.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(limit)

        if (clients) {
          for (const c of clients) {
            const code = `CL-${c.id.substring(0, 5).toUpperCase()}`
            if (!seenCodes.has(code)) {
              seenCodes.add(code)
              results.push({
                id: c.id,
                kind: 'client',
                code,
                title: c.name || c.company || 'Client Record',
                subtitle: `${c.company ? `${c.company} · ` : ''}${c.phone || 'No phone'}`,
                badge: 'Client',
                badgeTone: 'primary',
              })
            }
          }
        }
      }
    } catch {
      // Fallback silently to seed results on network / permission denial
    }
  }

  return results.slice(0, limit)
}

/** Extracts all unique entity IDs currently referenced across internal notes */
export function getRecentEntitiesFromNotes(notes: InternalNote[]): EntityLookupItem[] {
  const result: EntityLookupItem[] = []
  const seen = new Set<string>()

  for (const n of notes) {
    const refs = n.referenceIds && n.referenceIds.length > 0
      ? n.referenceIds
      : n.referenceId ? [n.referenceId] : []

    for (const ref of refs) {
      const upper = ref.toUpperCase().trim()
      if (!upper || seen.has(upper)) continue
      seen.add(upper)

      // Find in seed catalog or construct dynamic item
      const found = FLEET_CATALOG_SEED.find(item => item.code.toUpperCase() === upper)
      if (found) {
        result.push(found)
      } else {
        const kind = getReferenceKind(upper)
        result.push({
          id: `recent-${upper}`,
          kind,
          code: upper,
          title: `Entity ${upper}`,
          subtitle: `Referenced by ${n.author}`,
          badge: 'Recent',
          badgeTone: 'neutral',
        })
      }
    }
  }

  return result
}

/** Constructs an EntityLookupItem for a manual/custom ID typed by an operator */
export function createCustomEntityItem(code: string): EntityLookupItem {
  const cleanCode = code.trim().toUpperCase()
  const kind = getReferenceKind(cleanCode)
  return {
    id: `custom-${cleanCode}`,
    kind,
    code: cleanCode,
    title: `Custom Ref ${cleanCode}`,
    subtitle: 'Operator attached identifier',
    badge: 'Custom',
    badgeTone: 'neutral',
  }
}
