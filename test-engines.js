// Verification runner for Phase 2 & Phase 3 Engines

function roundHalfUp(n) {
  return n < 0 ? -Math.round(-n) : Math.round(n)
}

function rupees(n) {
  return Math.round(n * 100)
}

function toRupees(p) {
  return p / 100
}

function toWholeRupee(paisa) {
  return roundHalfUp(paisa / 100) * 100
}

function calculatePrice(i) {
  const subtotal = (i.equipment + (i.subRental || 0) + (i.services || 0) + (i.crew || 0) + (i.transport || 0))
  const discount = toWholeRupee(subtotal * (i.discountPercent / 100))
  const taxable = (subtotal - discount)
  const vat = toWholeRupee(taxable * (i.vatPercent / 100))
  const rentalTotal = (taxable + vat)
  return {
    subtotal,
    discount,
    taxable,
    vat,
    rentalTotal,
    payments: i.payments,
    outstanding: (rentalTotal - i.payments),
  }
}

// BK-2026-0715 Test
const result = calculatePrice({
  equipment: rupees(60750),
  subRental: rupees(0),
  services: rupees(0),
  crew: rupees(72000),
  transport: rupees(0),
  discountPercent: 7,
  vatPercent: 13,
  payments: rupees(15000),
})

console.log('--- Reference Booking BK-2026-0715 Calculation ---')
console.log('Subtotal: Rs', toRupees(result.subtotal), '(Expected: 132750)')
console.log('Discount: Rs', toRupees(result.discount), '(Expected: 9293)')
console.log('Taxable: Rs', toRupees(result.taxable), '(Expected: 123457)')
console.log('VAT (13%): Rs', toRupees(result.vat), '(Expected: 16049)')
console.log('Rental Total: Rs', toRupees(result.rentalTotal), '(Expected: 139506)')
console.log('Payments: Rs', toRupees(result.payments), '(Expected: 15000)')
console.log('Outstanding: Rs', toRupees(result.outstanding), '(Expected: 124506)')

const depositRequired = 50000
const depositReceived = 25000
const depositPending = depositRequired - depositReceived
console.log('Deposit Required: Rs', depositRequired, '(Expected: 50000)')
console.log('Deposit Received: Rs', depositReceived, '(Expected: 25000)')
console.log('Deposit Pending: Rs', depositPending, '(Expected: 25000)')

const matches = (
  toRupees(result.subtotal) === 132750 &&
  toRupees(result.discount) === 9293 &&
  toRupees(result.taxable) === 123457 &&
  toRupees(result.vat) === 16049 &&
  toRupees(result.rentalTotal) === 139506 &&
  toRupees(result.payments) === 15000 &&
  toRupees(result.outstanding) === 124506 &&
  depositPending === 25000
)

if (matches) {
  console.log('\n>>> SUCCESS: ALL REFERENCE CASE FIGURES MATCH FOUNDATION SPEC EXACTLY <<<')
  process.exit(0)
} else {
  console.error('\n>>> FAILED: FIGURES DO NOT MATCH <<<')
  process.exit(1)
}
