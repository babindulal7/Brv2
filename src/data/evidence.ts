/**
 * Evidence Workspace seed data — `04 Operations/Evidence Workspace.md` v1.1
 * (Build Locked), with the render's defects corrected rather than copied.
 *
 * §0 "Found in the screen" lists them. The one that shapes this file: a card
 * showed `Portkeys Monitor · PKM-001` while badged **Unmatched**. §7.3 is
 * explicit — "an Unmatched card shows **no product name, no serial**". So the
 * product is modelled as *absent* on Unmatched, not merely hidden.
 */

/** §7.3 — three card states. */
export type MatchState = 'Matched' | 'Review' | 'Unmatched'

/** §7.1 — the first source to resolve wins. */
export type MatchSource = 'QR' | 'Barcode' | 'Serial OCR' | 'AI' | 'Manual'

export interface Photo {
  id: string
  file: string
  at: string
  size: string
  /**
   * Present only when the system actually resolved one. `undefined` on
   * Unmatched — §7.3 forbids showing a product or serial on an Unmatched card,
   * and the cleanest way to honour that is for the data not to carry it.
   */
  product?: { name: string; serial: string; category: string; bundle: string }
  source?: MatchSource
  /** §7.2 — shown for Review only; QR/barcode are deterministic. */
  confidence?: number
  /** Why it is Unmatched, when the system can say. §7.2 last row. */
  reason?: string
  category: string
}

/**
 * §7.2 confidence thresholds. Configured in Settings ▸ Evidence, not hardcoded
 * — held here as the single source the UI reads.
 */
export const THRESHOLDS = { matched: 95, review: 70 }

/** Derive the state from the evidence, so a card cannot contradict itself. */
export function matchState(p: Photo): MatchState {
  if (!p.product) return 'Unmatched'
  if (p.source === 'QR' || p.source === 'Barcode') return 'Matched'
  if (p.source === 'Serial OCR') return 'Matched'
  const c = p.confidence ?? 0
  if (c >= THRESHOLDS.matched) return 'Matched'
  if (c >= THRESHOLDS.review) return 'Review'
  return 'Unmatched'
}

export const PHOTOS: Photo[] = [
  { id: 'p1', file: 'IMG_0001.JPG', at: '10:21 AM', size: '10.8 MB', category: 'Packing', source: 'QR', product: { name: 'Sony FX3', serial: 'SN102', category: 'Camera', bundle: 'FX3 Documentary Package' } },
  { id: 'p2', file: 'IMG_0002.JPG', at: '10:21 AM', size: '9.2 MB', category: 'Packing', source: 'Barcode', product: { name: 'NP-FZ100 Battery', serial: 'SN-BAT-001', category: 'Battery', bundle: 'FX3 Documentary Package' } },
  { id: 'p3', file: 'IMG_0003.JPG', at: '10:21 AM', size: '8.4 MB', category: 'Packing', source: 'Serial OCR', product: { name: '256GB CFexpress Type A', serial: 'SN-CFX-001', category: 'Media', bundle: 'FX3 Documentary Package' } },
  { id: 'p4', file: 'IMG_0004.JPG', at: '10:22 AM', size: '11.1 MB', category: 'Packing', source: 'AI', confidence: 97, product: { name: 'NISI Athena 35mm T1.9', serial: 'SN-LEN-035', category: 'Lens', bundle: 'FX3 Documentary Package' } },
  { id: 'p5', file: 'IMG_0005.JPG', at: '10:22 AM', size: '7.9 MB', category: 'Packing', source: 'AI', confidence: 96, product: { name: 'Manfrotto 504X', serial: 'SN-TRP-001', category: 'Support', bundle: 'FX3 Documentary Package' } },
  { id: 'p6', file: 'IMG_0006.JPG', at: '10:22 AM', size: '6.3 MB', category: 'Packing', source: 'Barcode', product: { name: 'Pelican 1610 Case', serial: 'SN-ACC-002', category: 'Case', bundle: 'FX3 Documentary Package' } },
  // 70–94% → Review. A suggestion is shown and a human must accept it.
  { id: 'p7', file: 'IMG_0007.JPG', at: '10:23 AM', size: '4.1 MB', category: 'Packing', source: 'AI', confidence: 82, product: { name: 'HDMI Cable', serial: 'HC-002', category: 'Cable', bundle: 'FX3 Documentary Package' } },
  { id: 'p8', file: 'IMG_0008.JPG', at: '10:23 AM', size: '5.0 MB', category: 'Packing', source: 'AI', confidence: 74, product: { name: 'Battery Charger', serial: 'CH-001', category: 'Power', bundle: 'FX3 Documentary Package' } },
  /*
   * The render badged this Unmatched while showing "Portkeys Monitor · PKM-001".
   * §7.3 forbids that, and §7.2 gives the real reason a resolved item can be
   * Unmatched: it is not on this booking. The reason is stated; the product is
   * not claimed.
   */
  { id: 'p9', file: 'IMG_0009.JPG', at: '10:24 AM', size: '8.8 MB', category: 'Packing', reason: 'Resolves to an item that is not on this booking' },
  { id: 'p10', file: 'IMG_0010.JPG', at: '10:24 AM', size: '3.7 MB', category: 'Packing', source: 'AI', confidence: 41, reason: 'Recognition below the 70% review threshold' },
]

/** §5.2 — categories, each with a count. Counts sum to the All Photos total. */
export const CATEGORY_NAMES = [
  'Packing',
  'Pickup / Delivery',
  'Return',
  'Inspection',
  'Damage',
  'Cleaning',
  'Maintenance',
  'Warehouse',
  'Client Documents',
  'Marketing',
  'Others',
] as const

/** §5.1 — what ships now, kept separate from the roadmap. */
export const UPLOAD_SOURCES = ['Take Photo', 'Record Video', 'Upload Files', 'Upload Folder'] as const
export const UPLOAD_ROADMAP = ['Import SD Card', 'Import Camera', 'Import Mobile', 'Cloud Sync'] as const

/** §4 — one indicator, four steps. The render's second five-card strip is deleted. */
export const STEPS = ['Upload', 'Processing', 'Review & Match', 'Synced'] as const

/** §9 — the bulk bar's actions. */
export const BULK_ACTIONS = ['Assign Product', 'Assign Category', 'Download', 'Export ZIP', 'Generate PDF', 'Rotate', 'Remove'] as const

/** §11.2 — limits, stated before upload begins rather than after. */
export const LIMITS = {
  image: '50 MB per image',
  video: '500 MB per video · 3 min',
  booking: '500 files per booking',
  formats: 'JPG · PNG · HEIC · RAW · MP4 · MOV · PDF · ZIP',
}
