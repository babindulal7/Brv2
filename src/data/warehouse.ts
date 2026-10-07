import type { IconName } from '../components/ui/Icon'
import type { StatusKey } from '../lib/status'
import { toBs, formatAd } from '../lib/bs'
import { grouped } from '../lib/money'

/**
 * **Warehouse Management seed** — `06 Inventory/Warehouse.md` v3.0 (Build Locked)
 * reconciled against `Warehouse.PNG`.
 *
 * Every figure this screen shows is either a field on one of the four arrays
 * below or is **derived from them here**. The file used to also carry a
 * `WAREHOUSE_KPIS` array of pre-formatted strings ('82%', '2,507', '18'), which
 * is the failure mode the KPI cards exist to avoid: the strings drifted from the
 * rows (the set actually stands at 81% capacity, not 82%) and nothing could
 * notice. The strings are gone; `totalsOf()` computes them, and `SEED_ERRORS`
 * asserts the rows still reconcile.
 *
 * No BS date is stored. `Calendar.md` §4.2 — BS is rendered from the AD instant
 * through `lib/bs`, never persisted, so the two can never disagree.
 */

/* ── shapes ────────────────────────────────────────────────────────────── */

export interface StorageLocation {
  id: string
  warehouseId: string
  room: string
  zone: string
  rack: string
  shelf: string
  bin: string
  capacity: number
  used: number
}

export interface Warehouse {
  id: string
  name: string
  code: string
  branch: string
  manager: string
  address: string
  phone: string
  /** Slots. `capacity - availableSpace` is the used count, asserted below. */
  capacity: number
  /** Whole percent, asserted below to match `used / capacity`. */
  occupancy: number
  equipmentCount: number
  availableSpace: number
  zonesCount: number
  activeTransfers: number
  accuracyPct: number
  status: 'Active' | 'Maintenance' | 'Full'
  image: string
}

/**
 * Stock-transfer lifecycle. This is a **screen-local vocabulary for a different
 * entity** than anything in `lib/workflow` — a transfer is not a booking, a job
 * or an item — so it lives here and deliberately shares no name with
 * `BookingStatus`, `JobState` or `ItemState`.
 */
export type TransferStatus =
  | 'Pending'
  | 'Approved'
  | 'Packing'
  | 'In Transit'
  | 'Received'
  | 'Completed'
  | 'Cancelled'

export type TransferType =
  | 'Branch Transfer'
  | 'Warehouse Transfer'
  | 'Zone Transfer'
  | 'Temporary Holding'
  | 'Transit'

export interface StockTransfer {
  id: string
  transferNo: string
  type: TransferType
  sourceWarehouse: string
  sourceZone: string
  destinationWarehouse: string
  destinationZone: string
  assetCount: number
  items: Array<{
    assetCode: string
    name: string
    serial: string
    category: string
    condition: string
  }>
  status: TransferStatus
  requestedBy: string
  approvedBy?: string
  dispatchedAt?: string
  receivedAt?: string
  notes?: string
  /** AD, ISO date. The BS line is rendered from this — never stored. */
  dateAD: string
}

/**
 * ⚠️ `role` here is a **job title on the warehouse floor**, not a `SystemRole`.
 * The business 8 (Owner · Admin · Coordinator · Warehouse · Technician ·
 * Accounts · Driver · Client) are the only capability vocabulary; nothing in
 * this file or the screen that reads it may branch on the strings below to
 * grant or withhold anything. They are printed on a staff card and no more.
 */
export interface WarehouseStaff {
  id: string
  name: string
  role: 'Manager' | 'Warehouse Officer' | 'Technician' | 'Helper' | 'Security'
  warehouse: string
  shift: 'Morning (06:00 - 14:00)' | 'Day (09:00 - 18:00)' | 'Evening (14:00 - 22:00)' | 'Night'
  phone: string
  status: 'On Duty' | 'Off Duty' | 'Leave'
}

/* ── tokens ────────────────────────────────────────────────────────────── */

/** §4.2 — five colours plus gold. No hue is invented per status. */
export const WAREHOUSE_STATUS_TONE: Record<Warehouse['status'], StatusKey> = {
  Active: 'in',
  Maintenance: 'progress',
  Full: 'danger',
}

export const WAREHOUSE_STATUS_ICON: Record<Warehouse['status'], IconName> = {
  Active: 'check',
  Maintenance: 'tool',
  Full: 'alert_triangle',
}

/** "Solid = out, soft = in" — a transfer on the road is `out`; a landed one `in`. */
export const TRANSFER_STATUS_TONE: Record<TransferStatus, StatusKey> = {
  Pending: 'neutral',
  Approved: 'primary',
  Packing: 'progress',
  'In Transit': 'out',
  Received: 'in',
  Completed: 'in',
  Cancelled: 'danger',
}

/** §4.2 — colour is never the sole carrier; every status ships an icon too. */
export const TRANSFER_STATUS_ICON: Record<TransferStatus, IconName> = {
  Pending: 'timer',
  Approved: 'check',
  Packing: 'package',
  'In Transit': 'truck',
  Received: 'return_arrow',
  Completed: 'check',
  Cancelled: 'close',
}

/**
 * The one lifecycle. The screen renders the single next step from this map, so
 * a transfer cannot be advanced out of order or skipped forward.
 */
export const TRANSFER_FLOW: Record<TransferStatus, { next: TransferStatus; label: string } | null> = {
  Pending: { next: 'Approved', label: 'Approve' },
  Approved: { next: 'Packing', label: 'Start Packing' },
  Packing: { next: 'In Transit', label: 'Dispatch' },
  'In Transit': { next: 'Received', label: 'Mark Received' },
  Received: { next: 'Completed', label: 'Reconcile & Complete' },
  Completed: null,
  Cancelled: null,
}

export const TRANSFER_TERMINAL: ReadonlySet<TransferStatus> = new Set<TransferStatus>([
  'Completed',
  'Cancelled',
])

/* ── rows ──────────────────────────────────────────────────────────────── */

export const WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-01',
    name: 'Kathmandu Main Hub (HQ)',
    code: 'WH-KTM-01',
    branch: 'Kathmandu (HQ)',
    manager: 'Rajesh Shrestha',
    address: 'Baluwatar-04, Kathmandu, Nepal',
    phone: '+977-9801234501',
    capacity: 1500,
    occupancy: 86,
    equipmentCount: 1290,
    availableSpace: 210,
    zonesCount: 8,
    activeTransfers: 7,
    accuracyPct: 99.6,
    status: 'Active',
    // Placeholder Unsplash stock photo pending a real photo of this warehouse.
    image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'wh-02',
    name: 'Patan Studio Depository',
    code: 'WH-PTN-01',
    branch: 'Lalitpur',
    manager: 'Pooja Thapa',
    address: 'Kupondole Heights, Lalitpur',
    phone: '+977-9801234502',
    capacity: 700,
    occupancy: 78,
    equipmentCount: 546,
    availableSpace: 154,
    zonesCount: 5,
    activeTransfers: 4,
    accuracyPct: 99.2,
    status: 'Active',
    // Placeholder Unsplash stock photo pending a real photo of this warehouse.
    image: 'https://images.unsplash.com/photo-1553413077-190dd305871c?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'wh-03',
    name: 'Pokhara Regional Hub',
    code: 'WH-PKR-01',
    branch: 'Pokhara Lakeside',
    manager: 'Anil Gurung',
    address: 'Lakeside-6, Pokhara, Gandaki',
    phone: '+977-9801234503',
    capacity: 500,
    occupancy: 84,
    equipmentCount: 420,
    availableSpace: 80,
    zonesCount: 4,
    activeTransfers: 5,
    accuracyPct: 99.5,
    status: 'Active',
    // Placeholder Unsplash stock photo pending a real photo of this warehouse.
    image: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=600&auto=format&fit=crop&q=80',
  },
  {
    id: 'wh-04',
    name: 'Bhaktapur Heavy Grip & Rigging',
    code: 'WH-BKT-01',
    branch: 'Bhaktapur',
    manager: 'Bikash Tamang',
    address: 'Sallaghari Industrial Area, Bhaktapur',
    phone: '+977-9801234504',
    capacity: 400,
    occupancy: 63,
    equipmentCount: 251,
    availableSpace: 149,
    zonesCount: 3,
    activeTransfers: 2,
    accuracyPct: 98.9,
    status: 'Active',
    // Placeholder Unsplash stock photo pending a real photo of this warehouse.
    image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=600&auto=format&fit=crop&q=80',
  },
]

/**
 * Bin-level records. This is a **sample, not the full layout** — 9 bins are
 * seeded against 20 declared zones — so the profile panel states its own
 * coverage rather than implying the rest of the racks are empty.
 */
export const STORAGE_LOCATIONS: StorageLocation[] = [
  { id: 'loc-01', warehouseId: 'wh-01', room: 'Camera Vault A', zone: 'Zone A (Cinema Bodies)', rack: 'Rack 01', shelf: 'Shelf 02', bin: 'Bin A-1', capacity: 12, used: 9 },
  { id: 'loc-02', warehouseId: 'wh-01', room: 'Camera Vault A', zone: 'Zone A (Cinema Bodies)', rack: 'Rack 01', shelf: 'Shelf 03', bin: 'Bin A-2', capacity: 10, used: 8 },
  { id: 'loc-03', warehouseId: 'wh-01', room: 'Optics Room B', zone: 'Zone B (Prime Cine Lenses)', rack: 'Rack 02', shelf: 'Shelf 01', bin: 'Bin B-1', capacity: 24, used: 20 },
  { id: 'loc-04', warehouseId: 'wh-01', room: 'Optics Room B', zone: 'Zone B (Zoom Lenses)', rack: 'Rack 02', shelf: 'Shelf 02', bin: 'Bin B-2', capacity: 16, used: 14 },
  { id: 'loc-05', warehouseId: 'wh-01', room: 'Lighting Bay C', zone: 'Zone C (Aputure / Nanlite LEDs)', rack: 'Rack 03', shelf: 'Shelf 01', bin: 'Bin C-1', capacity: 15, used: 12 },
  { id: 'loc-06', warehouseId: 'wh-01', room: 'Grip & Rigging', zone: 'Zone D (Stands & C-Stands)', rack: 'Rack 04', shelf: 'Floor Bay', bin: 'Bay D-1', capacity: 40, used: 35 },
  { id: 'loc-07', warehouseId: 'wh-01', room: 'Audio Vault', zone: 'Zone E (Wireless & Microphones)', rack: 'Rack 05', shelf: 'Shelf 02', bin: 'Bin E-2', capacity: 30, used: 25 },
  { id: 'loc-08', warehouseId: 'wh-02', room: 'Main Storage Room', zone: 'Zone 1 (Field Kits)', rack: 'Rack 01', shelf: 'Shelf 01', bin: 'Bin 1-A', capacity: 20, used: 16 },
  { id: 'loc-09', warehouseId: 'wh-03', room: 'Lakeside Storage', zone: 'Zone A (Outdoor & Drone)', rack: 'Rack 01', shelf: 'Shelf 01', bin: 'Bin A', capacity: 25, used: 21 },
]

export const TRANSFERS: StockTransfer[] = [
  {
    id: 'tr-001',
    transferNo: 'TR-2026-0045',
    type: 'Branch Transfer',
    sourceWarehouse: 'Kathmandu Main Hub (HQ)',
    sourceZone: 'Zone A (Cinema Bodies)',
    destinationWarehouse: 'Pokhara Regional Hub',
    destinationZone: 'Zone A (Outdoor & Drone)',
    assetCount: 3,
    items: [
      { assetCode: 'EQ000234', name: 'Sony FX3 Cinema Camera', serial: 'SN-FX3-003', category: 'Camera', condition: 'Excellent' },
      { assetCode: 'EQ000240', name: 'Sony FE 24-70mm f/2.8 GM II', serial: 'SN-LEN-0089', category: 'Lens', condition: 'Good' },
      { assetCode: 'EQ000301', name: 'DJI RS3 Pro Gimbal Stabilizer', serial: 'SN-GMB-0012', category: 'Grip', condition: 'Excellent' },
    ],
    status: 'In Transit',
    requestedBy: 'Anil Gurung',
    approvedBy: 'Rajesh Shrestha',
    dispatchedAt: '2026-08-06 09:30',
    dateAD: '2026-08-06',
    notes: 'Urgent transfer for Annapurna documentary shoot starting 24 Shrawan.',
  },
  {
    id: 'tr-002',
    transferNo: 'TR-2026-0044',
    type: 'Warehouse Transfer',
    sourceWarehouse: 'Patan Studio Depository',
    sourceZone: 'Zone 1 (Field Kits)',
    destinationWarehouse: 'Kathmandu Main Hub (HQ)',
    destinationZone: 'Zone C (Aputure / Nanlite LEDs)',
    assetCount: 2,
    items: [
      { assetCode: 'EQ000410', name: 'Aputure LS 600d Pro Light Storm', serial: 'SN-LGT-0044', category: 'Lighting', condition: 'Excellent' },
      { assetCode: 'EQ000412', name: 'Aputure Light Dome 150', serial: 'SN-MOD-0019', category: 'Lighting', condition: 'Good' },
    ],
    status: 'Packing',
    requestedBy: 'Rajesh Shrestha',
    approvedBy: 'Pooja Thapa',
    dateAD: '2026-08-06',
    notes: 'Rebalancing lighting stock for evening commercial production.',
  },
  {
    id: 'tr-003',
    transferNo: 'TR-2026-0043',
    type: 'Zone Transfer',
    sourceWarehouse: 'Kathmandu Main Hub (HQ)',
    sourceZone: 'Zone A (Cinema Bodies)',
    destinationWarehouse: 'Kathmandu Main Hub (HQ)',
    destinationZone: 'Inspection Room Bay 3',
    assetCount: 1,
    items: [
      { assetCode: 'EQ000230', name: 'RED V-Raptor 8K VV', serial: 'SN-RED-0002', category: 'Camera', condition: 'Good' },
    ],
    status: 'Approved',
    requestedBy: 'Sunil Sharma',
    approvedBy: 'Rajesh Shrestha',
    dateAD: '2026-08-05',
    notes: 'Scheduled sensor calibration and deep firmware diagnostics.',
  },
  {
    id: 'tr-004',
    transferNo: 'TR-2026-0042',
    type: 'Branch Transfer',
    sourceWarehouse: 'Kathmandu Main Hub (HQ)',
    sourceZone: 'Zone B (Prime Cine Lenses)',
    destinationWarehouse: 'Bhaktapur Heavy Grip & Rigging',
    destinationZone: 'Zone Heavy Grip',
    assetCount: 4,
    items: [
      { assetCode: 'EQ000501', name: 'Matthews Hollywood C-Stand (x4)', serial: 'AST-CSTD-04', category: 'Grip', condition: 'Good' },
    ],
    status: 'Completed',
    requestedBy: 'Bikash Tamang',
    approvedBy: 'Rajesh Shrestha',
    dispatchedAt: '2026-08-04 11:00',
    receivedAt: '2026-08-04 14:15',
    dateAD: '2026-08-04',
    notes: 'Completed stock relocation for studio setup.',
  },
  {
    id: 'tr-005',
    transferNo: 'TR-2026-0041',
    type: 'Branch Transfer',
    sourceWarehouse: 'Pokhara Regional Hub',
    sourceZone: 'Zone A (Outdoor & Drone)',
    destinationWarehouse: 'Kathmandu Main Hub (HQ)',
    destinationZone: 'Inspection Room Bay 1',
    assetCount: 1,
    items: [
      { assetCode: 'EQ000888', name: 'DJI Mavic 3 Pro Cine', serial: 'SN-DRN-0055', category: 'Drone', condition: 'Fair' },
    ],
    status: 'Received',
    requestedBy: 'Anil Gurung',
    approvedBy: 'Rajesh Shrestha',
    dispatchedAt: '2026-08-05 08:00',
    receivedAt: '2026-08-06 14:00',
    dateAD: '2026-08-05',
    notes: 'Drone returning to HQ for scheduled maintenance.',
  },
  {
    id: 'tr-006',
    transferNo: 'TR-2026-0046',
    type: 'Warehouse Transfer',
    sourceWarehouse: 'Kathmandu Main Hub (HQ)',
    sourceZone: 'Zone B (Prime Cine Lenses)',
    destinationWarehouse: 'Patan Studio Depository',
    destinationZone: 'Zone 1 (Field Kits)',
    assetCount: 2,
    items: [
      { assetCode: 'EQ000241', name: 'Sony FE 70-200mm f/2.8 GM II', serial: 'SN-LEN-0090', category: 'Lens', condition: 'Excellent' },
      { assetCode: 'EQ000242', name: 'Sony FE 16-35mm f/2.8 GM II', serial: 'SN-LEN-0091', category: 'Lens', condition: 'Excellent' },
    ],
    status: 'Pending',
    requestedBy: 'Pooja Thapa',
    dateAD: '2026-08-07',
    notes: 'Requesting extra GM lenses for a wedding shoot this weekend.',
  },
]

export const WAREHOUSE_STAFF: WarehouseStaff[] = [
  { id: 'stf-01', name: 'Rajesh Shrestha', role: 'Manager', warehouse: 'Kathmandu Main Hub (HQ)', shift: 'Day (09:00 - 18:00)', phone: '+977-9801234501', status: 'On Duty' },
  { id: 'stf-02', name: 'Ramesh Karki', role: 'Warehouse Officer', warehouse: 'Kathmandu Main Hub (HQ)', shift: 'Morning (06:00 - 14:00)', phone: '+977-9801234511', status: 'On Duty' },
  { id: 'stf-03', name: 'Dipendra KC', role: 'Technician', warehouse: 'Kathmandu Main Hub (HQ)', shift: 'Day (09:00 - 18:00)', phone: '+977-9801234512', status: 'On Duty' },
  { id: 'stf-04', name: 'Pooja Thapa', role: 'Manager', warehouse: 'Patan Studio Depository', shift: 'Day (09:00 - 18:00)', phone: '+977-9801234502', status: 'On Duty' },
  { id: 'stf-05', name: 'Anil Gurung', role: 'Manager', warehouse: 'Pokhara Regional Hub', shift: 'Day (09:00 - 18:00)', phone: '+977-9801234503', status: 'On Duty' },
  { id: 'stf-06', name: 'Bikash Tamang', role: 'Manager', warehouse: 'Bhaktapur Heavy Grip & Rigging', shift: 'Day (09:00 - 18:00)', phone: '+977-9801234504', status: 'On Duty' },
]

/**
 * `Warehouse.md` — Analytics ▸ Inventory Distribution, the seven categories and
 * counts the spec's render states. They sum to 2,507, which is the same total
 * `WAREHOUSES` reaches by a different route; `SEED_ERRORS` asserts the two
 * agree, so a category edit that breaks the tie is visible immediately.
 */
export const EQUIPMENT_DISTRIBUTION: Array<{ category: string; count: number; icon: IconName }> = [
  { category: 'Cameras', count: 412, icon: 'camera' },
  { category: 'Lenses', count: 687, icon: 'eye' },
  { category: 'Lighting', count: 612, icon: 'sun' },
  { category: 'Grip', count: 298, icon: 'tool' },
  { category: 'Audio', count: 210, icon: 'headset' },
  { category: 'Drone', count: 128, icon: 'video' },
  { category: 'Accessories', count: 160, icon: 'box' },
]

/* ── derivations ───────────────────────────────────────────────────────── */

/** Slots in use. Never a stored field — `capacity - availableSpace`, once. */
export function usedOf(w: Warehouse): number {
  return w.capacity - w.availableSpace
}

export function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100)
}

export interface WarehouseTotals {
  warehouses: number
  active: number
  capacity: number
  used: number
  available: number
  assets: number
  zones: number
  staff: number
  transfers: number
  occupancyPct: number
  /** Asset-weighted, one decimal — a plain mean over-weights the small depots. */
  accuracyPct: number
}

export function totalsOf(list: Warehouse[]): WarehouseTotals {
  const capacity = list.reduce((a, w) => a + w.capacity, 0)
  const used = list.reduce((a, w) => a + usedOf(w), 0)
  const assets = list.reduce((a, w) => a + w.equipmentCount, 0)
  const names = new Set(list.map((w) => w.name))
  const weighted = list.reduce((a, w) => a + w.accuracyPct * w.equipmentCount, 0)
  return {
    warehouses: list.length,
    active: list.filter((w) => w.status === 'Active').length,
    capacity,
    used,
    available: list.reduce((a, w) => a + w.availableSpace, 0),
    assets,
    zones: list.reduce((a, w) => a + w.zonesCount, 0),
    staff: WAREHOUSE_STAFF.filter((s) => names.has(s.warehouse)).length,
    transfers: list.reduce((a, w) => a + w.activeTransfers, 0),
    occupancyPct: pct(used, capacity),
    accuracyPct: assets === 0 ? 0 : Math.round((weighted / assets) * 10) / 10,
  }
}

export function staffOf(warehouseName: string): WarehouseStaff[] {
  return WAREHOUSE_STAFF.filter((s) => s.warehouse === warehouseName)
}

export function transfersOf(list: StockTransfer[], warehouseName: string): StockTransfer[] {
  return list.filter((t) => t.sourceWarehouse === warehouseName || t.destinationWarehouse === warehouseName)
}

export interface ZoneRollup {
  zone: string
  room: string
  bins: number
  capacity: number
  used: number
}

/** Zone → rack → shelf → bin, rolled up one level for the profile panel. */
export function zonesOf(warehouseId: string): ZoneRollup[] {
  const byZone = new Map<string, ZoneRollup>()
  for (const l of STORAGE_LOCATIONS) {
    if (l.warehouseId !== warehouseId) continue
    const found = byZone.get(l.zone)
    if (found) {
      found.bins += 1
      found.capacity += l.capacity
      found.used += l.used
    } else {
      byZone.set(l.zone, { zone: l.zone, room: l.room, bins: 1, capacity: l.capacity, used: l.used })
    }
  }
  return [...byZone.values()].sort((a, b) => a.zone.localeCompare(b.zone))
}

/* ── alerts ────────────────────────────────────────────────────────────── */

/**
 * Thresholds are named constants and are printed on every alert row, because an
 * alert whose rule is invisible is a number nobody can check. The render's own
 * alert list also carries "Low stock items", "Maintenance due" and "Audit due in
 * 10 days"; those three count records this module does not hold, so they are
 * absent rather than guessed. TODO(decision): whether Warehouse Management reads
 * the Maintenance and Stock Check ledgers for its alert rail.
 */
export const CAPACITY_ALERT_PCT = 85
export const LOW_SPACE_SLOTS = 100
export const ACCURACY_ALERT_PCT = 99

export type AlertKey = 'capacity' | 'space' | 'accuracy' | 'pending' | 'transit'

export interface WarehouseAlert {
  key: AlertKey
  label: string
  count: number
  tone: StatusKey
  icon: IconName
  rule: string
}

export function alertsOf(list: Warehouse[], transfers: StockTransfer[]): WarehouseAlert[] {
  return [
    {
      key: 'capacity',
      label: 'Capacity almost full',
      count: list.filter((w) => w.occupancy >= CAPACITY_ALERT_PCT).length,
      tone: 'danger',
      icon: 'alert_triangle',
      rule: `Warehouses at or above ${CAPACITY_ALERT_PCT}% occupancy.`,
    },
    {
      key: 'space',
      label: 'Low available space',
      count: list.filter((w) => w.availableSpace < LOW_SPACE_SLOTS).length,
      tone: 'progress',
      icon: 'queues',
      rule: `Warehouses with fewer than ${LOW_SPACE_SLOTS} free slots.`,
    },
    {
      key: 'accuracy',
      label: 'Accuracy below target',
      count: list.filter((w) => w.accuracyPct < ACCURACY_ALERT_PCT).length,
      tone: 'danger',
      icon: 'error',
      rule: `Warehouses whose last verification came in under ${ACCURACY_ALERT_PCT}%.`,
    },
    {
      key: 'pending',
      label: 'Transfers awaiting approval',
      count: transfers.filter((t) => t.status === 'Pending').length,
      tone: 'progress',
      icon: 'timer',
      rule: 'Stock transfers still in Pending.',
    },
    {
      key: 'transit',
      label: 'Transfers on the road',
      count: transfers.filter((t) => t.status === 'In Transit').length,
      tone: 'out',
      icon: 'truck',
      rule: 'Stock transfers dispatched but not yet received.',
    },
  ]
}

/** Which warehouses an alert row is about — the rail rows filter the table. */
export function warehousesForAlert(key: AlertKey, list: Warehouse[]): Warehouse[] {
  switch (key) {
    case 'capacity':
      return list.filter((w) => w.occupancy >= CAPACITY_ALERT_PCT)
    case 'space':
      return list.filter((w) => w.availableSpace < LOW_SPACE_SLOTS)
    case 'accuracy':
      return list.filter((w) => w.accuracyPct < ACCURACY_ALERT_PCT)
    case 'pending':
    case 'transit':
      return []
  }
}

/* ── activity ──────────────────────────────────────────────────────────── */

export interface ActivityEntry {
  id: string
  user: string
  action: string
  warehouse: string
  ad: Date
}

const ACTIVITY_VERB: Record<TransferStatus, string> = {
  Pending: 'Requested',
  Approved: 'Approved',
  Packing: 'Started packing',
  'In Transit': 'Dispatched',
  Received: 'Received',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
}

/**
 * §Right Intelligence Rail ▸ Recent Activity — user, action, warehouse, time.
 * Built from the transfer ledger rather than a second hand-written feed, so an
 * advanced transfer changes the rail as well as the table.
 */
export function recentActivity(transfers: StockTransfer[], limit = 5): ActivityEntry[] {
  const landed = new Set<TransferStatus>(['Received', 'Completed'])
  return [...transfers]
    .sort((a, b) => b.dateAD.localeCompare(a.dateAD))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      user: t.requestedBy,
      action: `${ACTIVITY_VERB[t.status]} ${t.transferNo} · ${t.assetCount} ${t.assetCount === 1 ? 'asset' : 'assets'}`,
      warehouse: landed.has(t.status) ? t.destinationWarehouse : t.sourceWarehouse,
      ad: new Date(`${t.dateAD}T00:00:00Z`),
    }))
}

/* ── transfer activity series ──────────────────────────────────────────── */

export interface TransferDay {
  /** "4 Aug" — the AD day the bar group sits on. */
  label: string
  completed: number
  inProgress: number
  pending: number
}

const IN_PROGRESS = new Set<TransferStatus>(['Approved', 'Packing', 'In Transit', 'Received'])

/**
 * Daily transfer counts. The render draws Completed / In Transit / Pending; the
 * middle series is widened to **In Progress** here because four of the seven
 * statuses sit between approval and completion and a chart that showed only
 * "In Transit" would silently drop Packing, Approved and Received.
 */
export function transferActivity(transfers: StockTransfer[]): TransferDay[] {
  const byDay = new Map<string, TransferDay>()
  for (const t of [...transfers].sort((a, b) => a.dateAD.localeCompare(b.dateAD))) {
    if (t.status === 'Cancelled') continue
    const ad = new Date(`${t.dateAD}T00:00:00Z`)
    const label = formatAd(ad)
    const row = byDay.get(t.dateAD) ?? { label, completed: 0, inProgress: 0, pending: 0 }
    if (t.status === 'Completed') row.completed += 1
    else if (t.status === 'Pending') row.pending += 1
    else if (IN_PROGRESS.has(t.status)) row.inProgress += 1
    byDay.set(t.dateAD, row)
  }
  return [...byDay.values()]
}

/* ── insights ──────────────────────────────────────────────────────────── */

export interface Insight {
  text: string
  tone: StatusKey
  icon: IconName
}

/**
 * Observations computed from the rows above. The render titles this panel "AI
 * Warehouse Insights"; nothing here is a model output, so it is not labelled as
 * one — every line is a rule you can re-run by hand against the table.
 */
export function insightsOf(list: Warehouse[]): Insight[] {
  const out: Insight[] = []
  if (list.length === 0) return out

  const byOccupancy = [...list].sort((a, b) => b.occupancy - a.occupancy)
  const fullest = byOccupancy[0]
  const emptiest = byOccupancy[byOccupancy.length - 1]
  if (fullest) {
    out.push({
      text: `${fullest.name} is at ${fullest.occupancy}% — the fullest facility, ${grouped(fullest.availableSpace)} slots left.`,
      tone: fullest.occupancy >= CAPACITY_ALERT_PCT ? 'danger' : 'progress',
      icon: 'queues',
    })
  }
  if (emptiest && emptiest !== fullest) {
    out.push({
      text: `${emptiest.name} has the most spare capacity — ${grouped(emptiest.availableSpace)} free slots at ${emptiest.occupancy}%.`,
      tone: 'in',
      icon: 'box',
    })
  }

  const tightestBin = [...STORAGE_LOCATIONS].sort((a, b) => b.used / b.capacity - a.used / a.capacity)[0]
  if (tightestBin) {
    const home = list.find((w) => w.id === tightestBin.warehouseId)
    out.push({
      text: `${tightestBin.zone} · ${tightestBin.rack} is ${pct(tightestBin.used, tightestBin.capacity)}% full${home ? ` in ${home.name}` : ''}.`,
      tone: 'progress',
      icon: 'home',
    })
  }

  const laggard = [...list].sort((a, b) => a.accuracyPct - b.accuracyPct)[0]
  if (laggard) {
    out.push({
      text: `${laggard.name} verified at ${laggard.accuracyPct}% — the lowest of the ${list.length}.`,
      tone: laggard.accuracyPct < ACCURACY_ALERT_PCT ? 'danger' : 'neutral',
      icon: 'error',
    })
  }

  return out
}

/* ── seed assertions ───────────────────────────────────────────────────── */

/**
 * Reported, never thrown. A module-scope `throw` runs before React mounts and
 * blanks the whole app with no message; the screen renders this list in a banner
 * instead. Same pattern as `data/expenseReports`'s `SEED_ERRORS`.
 */
export const SEED_ERRORS: string[] = (() => {
  const errs: string[] = []
  const names = new Set(WAREHOUSES.map((w) => w.name))
  const ids = new Set(WAREHOUSES.map((w) => w.id))

  for (const w of WAREHOUSES) {
    if (usedOf(w) !== w.equipmentCount) {
      errs.push(`${w.code}: capacity − available (${usedOf(w)}) must equal equipmentCount (${w.equipmentCount}).`)
    }
    if (pct(usedOf(w), w.capacity) !== w.occupancy) {
      errs.push(`${w.code}: occupancy is stored as ${w.occupancy}% but computes to ${pct(usedOf(w), w.capacity)}%.`)
    }
  }

  const totals = totalsOf(WAREHOUSES)
  const distribution = EQUIPMENT_DISTRIBUTION.reduce((a, c) => a + c.count, 0)
  if (distribution !== totals.assets) {
    errs.push(`Inventory Distribution sums to ${grouped(distribution)}; the warehouses hold ${grouped(totals.assets)}.`)
  }

  for (const s of WAREHOUSE_STAFF) {
    if (!names.has(s.warehouse)) errs.push(`Staff ${s.id} is posted to an unknown warehouse "${s.warehouse}".`)
  }
  for (const l of STORAGE_LOCATIONS) {
    if (!ids.has(l.warehouseId)) errs.push(`Storage location ${l.id} points at an unknown warehouse "${l.warehouseId}".`)
    if (l.used > l.capacity) errs.push(`Storage location ${l.id} holds ${l.used} in ${l.capacity} slots.`)
  }
  for (const t of TRANSFERS) {
    if (!names.has(t.sourceWarehouse)) errs.push(`${t.transferNo} leaves an unknown warehouse "${t.sourceWarehouse}".`)
    if (!names.has(t.destinationWarehouse)) errs.push(`${t.transferNo} lands at an unknown warehouse "${t.destinationWarehouse}".`)
    if (t.items.length === 0) errs.push(`${t.transferNo} carries no items.`)
    if (toBs(new Date(`${t.dateAD}T00:00:00Z`)) === null) {
      errs.push(`${t.transferNo} is dated ${t.dateAD}, outside the month lib/bs can convert (Shrawan 2083).`)
    }
  }

  return errs
})()
