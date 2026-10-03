import { describe, expect, it } from 'vitest'
import { getRentalPrimaryAction, normalizeBookingStatus } from '../rentalActions'

const NO = 'BR-1052'

describe('normalizeBookingStatus', () => {
  it('is identity over the canonical six', () => {
    for (const s of ['Quote', 'Booked', 'Packed', 'On Rent', 'Returned', 'Closed'] as const) {
      expect(normalizeBookingStatus(s)).toBe(s)
    }
  })

  it('folds the retired 12-stage vocabulary onto the canonical six', () => {
    expect(normalizeBookingStatus('Draft')).toBe('Quote')
    expect(normalizeBookingStatus('Confirmed')).toBe('Booked')
    expect(normalizeBookingStatus('Packing')).toBe('Booked')
    expect(normalizeBookingStatus('Ready')).toBe('Packed')
    expect(normalizeBookingStatus('Out')).toBe('On Rent')
    expect(normalizeBookingStatus('Picked Up')).toBe('On Rent')
    expect(normalizeBookingStatus('Partial Return')).toBe('On Rent')
    expect(normalizeBookingStatus('Inspected')).toBe('Returned')
    expect(normalizeBookingStatus('Reset Complete')).toBe('Returned')
    expect(normalizeBookingStatus('Void')).toBe('Cancelled')
  })

  it('passes unknown input through as Unknown, never inventing a stage', () => {
    expect(normalizeBookingStatus('Something New')).toBe('Unknown')
    expect(normalizeBookingStatus(undefined)).toBe('Unknown')
  })
})

describe('getRentalPrimaryAction', () => {
  it('walks the canonical six with one job and one route per stage', () => {
    expect(getRentalPrimaryAction('Quote', { bookingNo: NO }).label).toBe('Confirm Booking')
    const pack = getRentalPrimaryAction('Booked', { bookingNo: NO })
    expect(pack.label).toBe('Start Packing')
    expect(pack.job).toBe('Pack')
    expect(pack.route).toBe('/rentals/BR-1052/packing')
    const handover = getRentalPrimaryAction('Packed', { bookingNo: NO })
    expect(handover.job).toBe('Handover')
    expect(handover.route).toBe('/rentals/BR-1052/handover')
    const ret = getRentalPrimaryAction('On Rent', { bookingNo: NO })
    expect(ret.label).toBe('Return & Inspect')
    expect(ret.job).toBe('Return')
    expect(ret.route).toBe('/rentals/BR-1052/return')
    expect(getRentalPrimaryAction('Returned', { bookingNo: NO }).label).toBe('Close Rental')
    expect(getRentalPrimaryAction('Closed', { bookingNo: NO }).label).toBe('Rental Closed')
  })

  it('answers legacy aliases exactly as their canonical stage', () => {
    expect(getRentalPrimaryAction('Draft', { bookingNo: NO }).label).toBe('Confirm Booking')
    expect(getRentalPrimaryAction('Confirmed', { bookingNo: NO }).label).toBe('Start Packing')
    expect(getRentalPrimaryAction('Out', { bookingNo: NO }).label).toBe('Return & Inspect')
    expect(getRentalPrimaryAction('Inspected', { bookingNo: NO }).label).toBe('Close Rental')
  })

  it('names the overdue and partial returns distinctly', () => {
    expect(getRentalPrimaryAction('On Rent', { bookingNo: NO, isOverdue: true }).label).toBe(
      'Receive Overdue Return',
    )
    expect(getRentalPrimaryAction('On Rent', { bookingNo: NO, isPartial: true }).label).toBe(
      'Continue Return',
    )
    expect(getRentalPrimaryAction('Partial Return', { bookingNo: NO }).label).toBe('Continue Return')
  })

  it('holds the terminals fail-closed', () => {
    const cancelled = getRentalPrimaryAction('Booked', { isCancelled: true, bookingNo: NO })
    expect(cancelled.disabled).toBe(true)
    expect(cancelled.label).toBe('Cancelled')
    const closed = getRentalPrimaryAction('Closed', { bookingNo: NO })
    expect(closed.disabled).toBe(true)
    expect(closed.isOperable).toBe(false)
  })

  it('offers Reset when the caller may not close', () => {
    const reset = getRentalPrimaryAction('Returned', { bookingNo: NO, canCloseRental: false })
    expect(reset.label).toBe('Cleaning & Reset')
    expect(reset.job).toBe('Reset')
    expect(reset.route).toBe('/rentals/BR-1052/reset')
  })

  it('shows QC Done · Awaiting Close when reset is complete and caller may not close (G2)', () => {
    const awaitingClose = getRentalPrimaryAction('Returned', {
      bookingNo: NO,
      canCloseRental: false,
      isResetComplete: true,
    })
    expect(awaitingClose.label).toBe('QC Done · Awaiting Close')
    expect(awaitingClose.verb).toBe('Awaiting Close')
    expect(awaitingClose.disabled).toBe(true)
    expect(awaitingClose.isOperable).toBe(false)
  })

  it('routes service-only rentals to fulfill action at operational stages', () => {
    const booked = getRentalPrimaryAction('Booked', { bookingNo: NO, isServiceOnly: true })
    expect(booked.label).toBe('Complete Service')
    expect(booked.verb).toBe('Fulfill')
    expect(booked.actionType).toBe('fulfill')
    expect(booked.job).toBeUndefined()

    const packed = getRentalPrimaryAction('Packed', { bookingNo: NO, isServiceOnly: true })
    expect(packed.label).toBe('Complete Service')
    expect(packed.actionType).toBe('fulfill')

    const onRent = getRentalPrimaryAction('On Rent', { bookingNo: NO, isServiceOnly: true })
    expect(onRent.label).toBe('Complete Service')
    expect(onRent.actionType).toBe('fulfill')

    // At Quote or Returned, regular flow applies
    expect(getRentalPrimaryAction('Quote', { bookingNo: NO, isServiceOnly: true }).actionType).toBe('confirm')
    expect(getRentalPrimaryAction('Returned', { bookingNo: NO, isServiceOnly: true }).actionType).toBe('close')
  })
})

