/**
 * Damage findings seed.
 *
 * ⚠ **Seed layer.** `damage_findings` and `cases` exist in the schema and
 * nothing writes them yet, so these stand in for rows until the Return
 * workspace persists a finding. Every figure below is either taken from the
 * return-inspection seed (the FX3 Documentary Package booking) or from the
 * asset's own replacement value in `data/inventory.ts` — none is invented to
 * make a screen look populated.
 *
 * The three rows are chosen to cover the branches the engine actually has:
 * one under the Rs 25,000 Manager/Owner threshold, one over it, and one that
 * consumes the whole deposit and leaves a shortfall.
 */

import { rupees } from '../lib/money'
import type { Paisa } from '../lib/money'
import type { DamageState } from '../lib/damage'

export interface DamageFinding {
  id: string
  /** The booking the damage was found on, at return. */
  bookingNo: string
  client: string
  unitName: string
  serial: string
  /** Reported at return triage; the description is the finding. */
  description: string
  photos: number
  /** Reference figure only — the charge is decided case-by-case. */
  replacementPaisa: Paisa
  /** What the operator proposes to charge. */
  chargePaisa: Paisa
  /** The deposit held against the booking, for the settlement line. */
  depositPaisa: Paisa
  state: DamageState
  raisedBy: string
  raisedAtAd: string
  approvedBy?: string | undefined
}

export const DAMAGE_FINDINGS: DamageFinding[] = [
  {
    id: 'DMG-2026-0041',
    bookingNo: 'B-715',
    client: 'Himalayan Films Pvt. Ltd.',
    unitName: 'Manfrotto 504X Tripod',
    serial: 'SN-TRP-0007',
    description: 'Centre column locking collar cracked; leg will not hold at full extension.',
    photos: 3,
    replacementPaisa: rupees(48000),
    chargePaisa: rupees(8000),
    depositPaisa: rupees(50000),
    state: 'Awaiting Approval',
    raisedBy: 'Sagar Maharjan',
    raisedAtAd: '19 Jul 2026',
  },
  {
    id: 'DMG-2026-0042',
    bookingNo: 'B-712',
    client: 'Classic Media',
    unitName: 'RED Komodo X Body',
    serial: 'SN-CAM-0201',
    description: 'Sensor cover shattered and mount flange bent — returned in a bag with no case.',
    photos: 5,
    replacementPaisa: rupees(1450000),
    /* Over the Rs 25,000 threshold, so this one routes to the Owner. */
    chargePaisa: rupees(185000),
    depositPaisa: rupees(150000),
    state: 'Awaiting Approval',
    raisedBy: 'Sunil Shrestha',
    raisedAtAd: '21 Jul 2026',
  },
  {
    id: 'DMG-2026-0039',
    bookingNo: 'B-708',
    client: 'Pixel Studio',
    unitName: 'Aputure 600D Pro',
    serial: 'SN-LGT-0013',
    description: 'Yoke sheared and the ballast housing is cracked through; unit will not mount.',
    photos: 4,
    replacementPaisa: rupees(210000),
    chargePaisa: rupees(96000),
    /* Smaller than the charge, so this row exercises the shortfall branch. */
    depositPaisa: rupees(40000),
    state: 'Approved',
    raisedBy: 'Sagar Maharjan',
    raisedAtAd: '11 Jul 2026',
    approvedBy: 'Babin Shrestha',
  },
]
