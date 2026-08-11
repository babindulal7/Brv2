export const AUDIT_METRICS = {
  totalMutations: 1240,
  voids: 14,
  archives: 25,
  reversals: 3
}

export const AUDIT_ROWS = [
  { id: 'AUD-001', timestamp: '2026-08-09T11:20:00Z', user: 'Bishal Thapa', action: 'Update', resource: 'Asset CAM-001', before: 'Status: Available', after: 'Status: Maintenance', ip: '110.44.112.5', location: 'Kathmandu, NP' },
  { id: 'AUD-002', timestamp: '2026-08-08T16:10:00Z', user: 'Riya Maharjan', action: 'Void', resource: 'Invoice INV-2026-0045', before: 'Status: Draft', after: 'Status: Voided', ip: '27.34.20.1', location: 'Lalitpur, NP' },
  { id: 'AUD-003', timestamp: '2026-08-07T09:30:00Z', user: 'Sushant Shrestha', action: 'Retire', resource: 'Asset LEN-012', before: 'Status: Maintenance', after: 'Status: Retired', ip: '27.34.20.1', location: 'Lalitpur, NP' },
]
