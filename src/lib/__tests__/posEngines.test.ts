import { describe, it, expect } from 'vitest'
import { sound } from '../sound'
import { printRentalSlip, type RentalSlipData } from '../printSlip'
import { rupees } from '../money'

describe('POS Sound & Print Slip Engines', () => {
  it('toggles sound effects enabled/disabled state', () => {
    sound.setEnabled(false)
    expect(sound.isEnabled()).toBe(false)
    sound.setEnabled(true)
    expect(sound.isEnabled()).toBe(true)
  })

  it('safely invokes audio methods without crashing when offline/mocked', () => {
    expect(() => {
      sound.playScan()
      sound.playSuccess()
      sound.playError()
      sound.playClick()
    }).not.toThrow()
  })

  it('formats rental slip data without crashing in browser/node environment', () => {
    const mockData: RentalSlipData = {
      bookingNo: 'B-890',
      clientName: 'Alok Sharma',
      clientPhone: '9841234567',
      stage: 'Booked',
      pickupDate: '2026-09-01',
      returnDate: '2026-09-04',
      lines: [
        { name: 'Sony FX3 Body', serial: 'FX3-001', qty: 1, days: 3, amountPaisa: rupees(12000) },
        { name: 'Sony 24-70mm GM II', serial: 'LENS-002', qty: 1, days: 3, amountPaisa: rupees(6000) },
      ],
      subtotalPaisa: rupees(18000),
      vatPaisa: rupees(2340),
      totalPaisa: rupees(20340),
      depositPaisa: rupees(5000),
      advancePaisa: rupees(10000),
      outstandingPaisa: rupees(10340),
    }

    // In jsdom environment, window.open is mocked
    expect(() => printRentalSlip(mockData)).not.toThrow()
  })
})
