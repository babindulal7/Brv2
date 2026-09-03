import Dexie, { type Table } from 'dexie'

export interface CachedProduct {
  id: string
  name: string
  serial_no?: string
  asset_tag?: string
  category?: string
  daily_rate_paisa?: number
  tracking_mode?: string
  status?: string
  rack?: string
  shelf?: string
  bin?: string
  updated_at?: string
}

export interface CachedClient {
  id: string
  name: string
  phone: string
  email?: string
  address?: string
  credit_tier?: string
  is_blocked?: boolean
  outstanding_paisa?: number
  updated_at?: string
}

export interface CachedBooking {
  id: string
  booking_no: string
  stage: string
  client_id: string
  project?: string
  pickup_at?: string
  return_at?: string
  actual_return_at?: string
  delivery_type?: string
  deposit_paisa?: number
  total_paisa?: number
  updated_at?: string
}

export interface CachedSetting {
  key: string
  value: unknown
  updated_at?: string
}

export interface SyncMeta {
  key: string
  value: string
}

export class BabinLocalStore extends Dexie {
  products!: Table<CachedProduct, string>
  clients!: Table<CachedClient, string>
  bookings!: Table<CachedBooking, string>
  settings!: Table<CachedSetting, string>
  syncMeta!: Table<SyncMeta, string>

  constructor() {
    super('BabinLocalStore')
    this.version(1).stores({
      products: 'id, name, serial_no, category, status, updated_at',
      clients: 'id, name, phone, credit_tier, is_blocked, updated_at',
      bookings: 'id, booking_no, stage, client_id, pickup_at, return_at, updated_at',
      settings: 'key, updated_at',
      syncMeta: 'key',
    })
  }
}

export const localStore = new BabinLocalStore()

/**
 * Checks whether IndexedDB is available in the current environment.
 */
export function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}
