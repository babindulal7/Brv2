import type { OperationItem } from '../lib/operationsShell'
export * from '../lib/operationsShell'

export const SEED_ITEMS: OperationItem[] = [
  { id: 'it-1', name: 'Sony FX3', trackingMode: 'serial', bookingSerial: 'SN102', qtyExpected: 1, location: 'A2-01', packState: 'Pending', qtyPacked: 0, returnState: 'Pending', qtyReturned: 0 },
  { id: 'it-2', name: 'NISI Athena Prime Set (3 Lenses)', trackingMode: 'count', qtyExpected: 3, location: 'C1-02', packState: 'Pending', qtyPacked: 0, returnState: 'Pending', qtyReturned: 0 },
  { id: 'it-3', name: 'NP-FZ100 Battery', trackingMode: 'count', qtyExpected: 4, location: 'B1-04', packState: 'Pending', qtyPacked: 0, returnState: 'Pending', qtyReturned: 0 },
  { id: 'it-4', name: '256GB CFexpress Type A', trackingMode: 'count', qtyExpected: 2, location: 'B1-07', packState: 'Pending', qtyPacked: 0, returnState: 'Pending', qtyReturned: 0 },
  { id: 'it-5', name: 'Portkeys Monitor Kit', trackingMode: 'serial', bookingSerial: 'MK-2201', qtyExpected: 1, location: 'D1-03', packState: 'Pending', qtyPacked: 0, returnState: 'Pending', qtyReturned: 0 },
  { id: 'it-6', name: 'DJI RS3 Gimbal', trackingMode: 'serial', bookingSerial: 'RS3-0091', qtyExpected: 1, location: 'E1-01', packState: 'Pending', qtyPacked: 0, returnState: 'Pending', qtyReturned: 0 },
  { id: 'it-7', name: 'Audio Kit (Rode Wireless GO II)', trackingMode: 'serial', bookingSerial: 'RWG-338', qtyExpected: 1, location: 'F1-02', packState: 'Pending', qtyPacked: 0, returnState: 'Pending', qtyReturned: 0 },
  { id: 'it-8', name: 'Accessories & Cables Case', trackingMode: 'count', qtyExpected: 6, location: 'G1-05', packState: 'Pending', qtyPacked: 0, returnState: 'Pending', qtyReturned: 0 },
]
