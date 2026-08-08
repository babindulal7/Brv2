import type { IconName } from '../components/ui/Icon'

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
  capacity: number
  occupancy: number
  equipmentCount: number
  availableSpace: number
  zonesCount: number
  activeTransfers: number
  accuracyPct: number
  status: 'Active' | 'Maintenance' | 'Full'
  image: string
}

export type TransferStatus = 'Pending' | 'Approved' | 'Packing' | 'In Transit' | 'Received' | 'Completed' | 'Cancelled'
export type TransferType = 'Branch Transfer' | 'Warehouse Transfer' | 'Zone Transfer' | 'Temporary Holding' | 'Transit'

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
  dateAD: string
  dateBS: string
}

export interface WarehouseStaff {
  id: string
  name: string
  role: 'Manager' | 'Warehouse Officer' | 'Technician' | 'Helper' | 'Security'
  warehouse: string
  shift: 'Morning (06:00 - 14:00)' | 'Day (09:00 - 18:00)' | 'Evening (14:00 - 22:00)' | 'Night'
  phone: string
  status: 'On Duty' | 'Off Duty' | 'Leave'
}

export const WAREHOUSE_KPIS = [
  { label: 'Total Warehouses', value: '4', change: 'Across 2 branches', icon: 'box' as IconName, accent: 'blue' as const },
  { label: 'Active Warehouses', value: '4', change: '100% operational', icon: 'check' as IconName, accent: 'green' as const },
  { label: 'Total Assets Stored', value: '2,507', change: '+34 this month', icon: 'box' as IconName, accent: 'teal' as const },
  { label: 'Capacity Used', value: '82%', change: 'Normal threshold', icon: 'queues' as IconName, accent: 'amber' as const },
  { label: 'Transfers Today', value: '18', change: '5 in transit', icon: 'truck' as IconName, accent: 'orange' as const },
  { label: 'Inventory Accuracy', value: '99.4%', change: 'Verified 4 Shrawan', icon: 'error' as IconName, accent: 'purple' as const },
]

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
    image: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=600&auto=format&fit=crop&q=80',
  },
]

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
    dateBS: '2083-04-22',
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
    dateBS: '2083-04-22',
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
    dateBS: '2083-04-21',
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
    dateBS: '2083-04-20',
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
    dateBS: '2083-04-21',
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
    dateBS: '2083-04-23',
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
