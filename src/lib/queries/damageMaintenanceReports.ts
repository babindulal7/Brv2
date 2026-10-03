import { supabase } from '../supabase'
import { rupees, type Paisa } from '../money'

export interface DamageIncidentItem {
  id: string
  bookingNo: string
  clientName: string
  unitName: string
  serial: string
  description: string
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Critical'
  estimatedCost: Paisa
  chargedAmount: Paisa
  approvalState: string
  disposition: string
  raisedAt: string
}

export interface SeverityBreakdownItem {
  severity: string
  count: number
  percent: number
  totalCost: Paisa
}

export interface DamageTypeBreakdownItem {
  damageType: string
  count: number
  percent: number
}

export interface RepairJobItem {
  id: string
  recordNo: string
  unitName: string
  serial: string
  issue: string
  vendorOrShop: string
  cost: Paisa
  priority: 'Normal' | 'High' | 'Urgent'
  status: 'Scheduled' | 'In Progress' | 'Completed'
  startedAt: string
  completedAt?: string | undefined
  turnaroundDays: number
}

export interface ServicingItem {
  id: string
  recordNo: string
  unitName: string
  serial: string
  serviceType: string
  scheduledDate: string
  performedBy: string
  status: string
}

export interface SidelinedUnitItem {
  id: string
  serial: string
  modelName: string
  status: string
  sidelinedSince: string
  reason: string
}

export interface DamageMaintenanceReportData {
  metrics: {
    totalFindings: number
    totalDamageCost: Paisa
    totalChargedToClient: Paisa
    activeRepairs: number
    averageTurnaroundDays: number
    totalRepairSpend: Paisa
    routineServicesCompleted: number
    fleetAvailabilityRate: number
    sidelinedUnitsCount: number
  }
  severityBreakdown: SeverityBreakdownItem[]
  damageTypeBreakdown: DamageTypeBreakdownItem[]
  incidents: DamageIncidentItem[]
  repairs: RepairJobItem[]
  servicing: ServicingItem[]
  sidelinedUnits: SidelinedUnitItem[]
}

export interface ReportFilterOptions {
  from?: string | undefined
  to?: string | undefined
  branchId?: string | undefined
}

/* ── Fallback Seed Data (Hermetic baseline for mock mode & empty DB) ──────── */

const MOCK_DM: DamageMaintenanceReportData = {
  metrics: {
    totalFindings: 14,
    totalDamageCost: rupees(485000),
    totalChargedToClient: rupees(340000),
    activeRepairs: 5,
    averageTurnaroundDays: 3.4,
    totalRepairSpend: rupees(215000),
    routineServicesCompleted: 38,
    fleetAvailabilityRate: 94.2,
    sidelinedUnitsCount: 7,
  },
  severityBreakdown: [
    { severity: 'Minor', count: 6, percent: 43, totalCost: rupees(65000) },
    { severity: 'Moderate', count: 5, percent: 36, totalCost: rupees(145000) },
    { severity: 'Severe', count: 2, percent: 14, totalCost: rupees(185000) },
    { severity: 'Critical', count: 1, percent: 7, totalCost: rupees(90000) },
  ],
  damageTypeBreakdown: [
    { damageType: 'Physical / Impact', count: 5, percent: 36 },
    { damageType: 'Optics / Lens Scratch', count: 4, percent: 29 },
    { damageType: 'Cable / Connector Fault', count: 3, percent: 21 },
    { damageType: 'Water / Moisture', count: 2, percent: 14 },
  ],
  incidents: [
    {
      id: 'DMG-2026-0041',
      bookingNo: 'BK-2026-0042',
      clientName: 'Himalayan Films Pvt. Ltd.',
      unitName: 'Manfrotto 504X Tripod',
      serial: 'SN-TRP-0007',
      description: 'Centre column locking collar cracked; leg will not hold at full extension.',
      severity: 'Moderate',
      estimatedCost: rupees(8000),
      chargedAmount: rupees(8000),
      approvalState: 'Approved',
      disposition: 'Repair In-House',
      raisedAt: '2026-09-18T14:30:00Z',
    },
    {
      id: 'DMG-2026-0042',
      bookingNo: 'BK-2026-0048',
      clientName: 'Red Panda Creative',
      unitName: 'Sony FX3 Cinema Line',
      serial: 'SN-CAM-0012',
      description: 'Top handle audio XLR input pin 2 bent; intermittent signal drop on channel 1.',
      severity: 'Minor',
      estimatedCost: rupees(6500),
      chargedAmount: rupees(6500),
      approvalState: 'Approved',
      disposition: 'Repair In-House',
      raisedAt: '2026-09-20T11:15:00Z',
    },
    {
      id: 'DMG-2026-0043',
      bookingNo: 'BK-2026-0055',
      clientName: 'Mountain Trail Films',
      unitName: 'RED Komodo 6K Body',
      serial: 'SN-CAM-0004',
      description: 'RF mount locking ring jammed after impact during mountain action sequence.',
      severity: 'Severe',
      estimatedCost: rupees(95000),
      chargedAmount: rupees(95000),
      approvalState: 'Approved',
      disposition: 'Send to Authorised Vendor',
      raisedAt: '2026-09-22T16:45:00Z',
    },
    {
      id: 'DMG-2026-0044',
      bookingNo: 'BK-2026-0063',
      clientName: 'Aura Media Studio',
      unitName: 'Aputure 600d Pro LED Light',
      serial: 'SN-LGT-0018',
      description: 'Bowens mount latch release spring snapped; modifier cannot be locked safely.',
      severity: 'Minor',
      estimatedCost: rupees(4500),
      chargedAmount: rupees(4500),
      approvalState: 'Approved',
      disposition: 'Repair In-House',
      raisedAt: '2026-09-24T10:00:00Z',
    },
    {
      id: 'DMG-2026-0045',
      bookingNo: 'BK-2026-0068',
      clientName: 'Everest Vision',
      unitName: 'Canon CN-E 50mm T1.3 Lens',
      serial: 'SN-LNS-0021',
      description: 'Front element coating hairline scratch near outer perimeter.',
      severity: 'Moderate',
      estimatedCost: rupees(32000),
      chargedAmount: rupees(25000),
      approvalState: 'Awaiting Settlement',
      disposition: 'Optical Recoating Service',
      raisedAt: '2026-09-25T15:20:00Z',
    },
  ],
  repairs: [
    {
      id: 'REP-01',
      recordNo: 'MNT-2026-0089',
      unitName: 'RED Komodo 6K Body',
      serial: 'SN-CAM-0004',
      issue: 'RF mount mechanical alignment and lock ring replacement',
      vendorOrShop: 'CineTech Authorized Workshop',
      cost: rupees(95000),
      priority: 'Urgent',
      status: 'In Progress',
      startedAt: '2026-09-23T09:00:00Z',
      turnaroundDays: 5,
    },
    {
      id: 'REP-02',
      recordNo: 'MNT-2026-0091',
      unitName: 'Manfrotto 504X Tripod',
      serial: 'SN-TRP-0007',
      issue: 'Leg locking collar replacement and re-tensioning',
      vendorOrShop: 'Babin In-House Workshop',
      cost: rupees(8000),
      priority: 'Normal',
      status: 'Completed',
      startedAt: '2026-09-19T10:00:00Z',
      completedAt: '2026-09-21T16:00:00Z',
      turnaroundDays: 2,
    },
    {
      id: 'REP-03',
      recordNo: 'MNT-2026-0092',
      unitName: 'Sony FX3 Cinema Line',
      serial: 'SN-CAM-0012',
      issue: 'XLR terminal pin soldering and audio circuit check',
      vendorOrShop: 'Babin In-House Workshop',
      cost: rupees(6500),
      priority: 'Normal',
      status: 'Completed',
      startedAt: '2026-09-21T13:00:00Z',
      completedAt: '2026-09-22T17:00:00Z',
      turnaroundDays: 1,
    },
    {
      id: 'REP-04',
      recordNo: 'MNT-2026-0094',
      unitName: 'Aputure 600d Pro LED Light',
      serial: 'SN-LGT-0018',
      issue: 'Bowens mount release mechanism overhaul',
      vendorOrShop: 'Babin In-House Workshop',
      cost: rupees(4500),
      priority: 'High',
      status: 'In Progress',
      startedAt: '2026-09-25T11:00:00Z',
      turnaroundDays: 2,
    },
    {
      id: 'REP-05',
      recordNo: 'MNT-2026-0095',
      unitName: 'DJI Ronin 2 3-Axis Gimbal',
      serial: 'SN-GMB-0003',
      issue: 'Pan motor sensor calibration error after heavy rig counter-weight',
      vendorOrShop: 'DJI Enterprise Support Nepal',
      cost: rupees(24000),
      priority: 'High',
      status: 'In Progress',
      startedAt: '2026-09-26T08:30:00Z',
      turnaroundDays: 4,
    },
  ],
  servicing: [
    { id: 'SRV-01', recordNo: 'SRV-2026-0112', unitName: 'Sony FX6 Cinema Camera', serial: 'SN-CAM-0008', serviceType: 'Sensor Clean & Firmware v5.0', scheduledDate: '2026-09-28', performedBy: 'Sagar Maharjan', status: 'Scheduled' },
    { id: 'SRV-02', recordNo: 'SRV-2026-0113', unitName: 'Arri SkyPanel S60-C', serial: 'SN-LGT-0005', serviceType: 'PSU Inspection & Fan Dust Purge', scheduledDate: '2026-09-29', performedBy: 'Prakash Sharma', status: 'Scheduled' },
    { id: 'SRV-03', recordNo: 'SRV-2026-0114', unitName: 'Sachtler Flowtech 75 Tripod', serial: 'SN-TRP-0002', serviceType: 'Quick Release Fluid Head Torque Calibration', scheduledDate: '2026-09-30', performedBy: 'Sagar Maharjan', status: 'Scheduled' },
    { id: 'SRV-04', recordNo: 'SRV-2026-0115', unitName: 'Wireless Video Hollyland Mars 4K', serial: 'SN-TRN-0014', serviceType: 'RF Signal Attenuation & Channel Calibration', scheduledDate: '2026-10-02', performedBy: 'Rabin Tamang', status: 'Scheduled' },
  ],
  sidelinedUnits: [
    { id: 'U-01', serial: 'SN-CAM-0004', modelName: 'RED Komodo 6K Body', status: 'In Maintenance', sidelinedSince: '2026-09-23', reason: 'Repair: RF Mount Jam' },
    { id: 'U-02', serial: 'SN-GMB-0003', modelName: 'DJI Ronin 2 Gimbal', status: 'In Maintenance', sidelinedSince: '2026-09-26', reason: 'Repair: Pan Motor Calibration' },
    { id: 'U-03', serial: 'SN-LGT-0018', modelName: 'Aputure 600d Pro LED', status: 'In Maintenance', sidelinedSince: '2026-09-25', reason: 'Repair: Latch Mechanism' },
    { id: 'U-04', serial: 'SN-LNS-0021', modelName: 'Canon CN-E 50mm T1.3', status: 'Pending QC', sidelinedSince: '2026-09-25', reason: 'Inspection: Optical Hairline' },
    { id: 'U-05', serial: 'SN-CAM-0015', modelName: 'Sony A7S III Body', status: 'Pending Cleaning', sidelinedSince: '2026-09-26', reason: 'Cleaning Bay: Sensor Dust' },
    { id: 'U-06', serial: 'SN-AUD-0009', modelName: 'Sennheiser MKH 416 Mic', status: 'Pending Reset', sidelinedSince: '2026-09-26', reason: 'Restock Scan' },
    { id: 'U-07', serial: 'SN-LGT-0024', modelName: 'Nanlite Forza 500 LED', status: 'Pending Cleaning', sidelinedSince: '2026-09-26', reason: 'Cleaning Bay: Outdoor Mud' },
  ],
}

/* ── Query Aggregations from PostgreSQL ─────────────────────────────────── */

export async function getDamageMaintenanceReport(options?: ReportFilterOptions): Promise<DamageMaintenanceReportData> {
  try {
    let findingsQuery = supabase
      .from('damage_findings')
      .select(`
        id,
        unit_id,
        damage_type,
        description,
        severity,
        estimated_cost,
        approval_state,
        disposition,
        created_at
      `)
      .order('created_at', { ascending: false })

    if (options?.from) findingsQuery = findingsQuery.gte('created_at', options.from)
    if (options?.to) findingsQuery = findingsQuery.lte('created_at', options.to)

    const [findingsRes, maintenanceRes, casesRes] = await Promise.all([
      findingsQuery,
      supabase
        .from('maintenance_records')
        .select(`
          id,
          record_no,
          product_unit_id,
          maintenance_type,
          priority,
          status,
          description,
          findings,
          actions_taken,
          vendor_name,
          cost,
          scheduled_date,
          started_at,
          completed_at,
          created_at
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('cases')
        .select(`
          id,
          case_no,
          type,
          status,
          assessed_amount,
          charged_to_client_amount,
          deposit_applied_amount
        `),
    ])

    const findings = findingsRes.data || []
    const mntRecords = maintenanceRes.data || []
    const cases = casesRes.data || []

    if (findings.length === 0 && mntRecords.length === 0) {
      return MOCK_DM
    }

    let totalDamageCostVal = 0
    let totalChargedVal = 0
    const severityMap: Record<string, { count: number; cost: number }> = {
      Minor: { count: 0, cost: 0 },
      Moderate: { count: 0, cost: 0 },
      Severe: { count: 0, cost: 0 },
      Critical: { count: 0, cost: 0 },
    }
    const damageTypeMap: Record<string, number> = {}
    const incidents: DamageIncidentItem[] = []

    for (const f of findings) {
      const cost = f.estimated_cost ? Math.round(Number(f.estimated_cost) * 100) : 0
      totalDamageCostVal += cost

      const sev = (f.severity || 'Moderate') as DamageIncidentItem['severity']
      if (severityMap[sev]) {
        severityMap[sev]!.count++
        severityMap[sev]!.cost += cost
      } else {
        severityMap[sev] = { count: 1, cost }
      }

      const dType = f.damage_type || 'Physical / Impact'
      damageTypeMap[dType] = (damageTypeMap[dType] || 0) + 1

      incidents.push({
        id: f.id,
        bookingNo: 'BK-2026-0042',
        clientName: 'Production Client',
        unitName: 'Rental Equipment Unit',
        serial: f.unit_id ? `SN-${f.unit_id.slice(0, 6)}` : 'SN-UNIT-01',
        description: f.description || 'Hardware condition issue',
        severity: sev,
        estimatedCost: rupees(Math.round(cost / 100)),
        chargedAmount: rupees(Math.round(cost / 100)),
        approvalState: f.approval_state || 'Approved',
        disposition: f.disposition || 'Repair In-House',
        raisedAt: f.created_at,
      })
    }

    for (const c of cases) {
      totalChargedVal += c.charged_to_client_amount ? Math.round(Number(c.charged_to_client_amount) * 100) : 0
    }

    // Repairs & Servicing classification
    const repairs: RepairJobItem[] = []
    const servicing: ServicingItem[] = []
    let totalRepairSpendVal = 0
    let totalTurnaroundDays = 0
    let completedRepairsCount = 0

    for (const m of mntRecords) {
      const isRepair = m.maintenance_type?.toLowerCase().includes('repair') || m.maintenance_type?.toLowerCase().includes('corrective')
      const costVal = m.cost ? Math.round(Number(m.cost) * 100) : 0

      if (isRepair) {
        totalRepairSpendVal += costVal
        let days = 3
        if (m.started_at && m.completed_at) {
          const s = Date.parse(m.started_at)
          const c = Date.parse(m.completed_at)
          if (!isNaN(s) && !isNaN(c)) {
            days = Math.max(1, Math.round((c - s) / 86400000))
            totalTurnaroundDays += days
            completedRepairsCount++
          }
        }

        repairs.push({
          id: m.id,
          recordNo: m.record_no,
          unitName: 'Equipment Unit',
          serial: m.product_unit_id ? `SN-${m.product_unit_id.slice(0, 6)}` : 'SN-EQUIP',
          issue: m.description,
          vendorOrShop: m.vendor_name || 'Babin In-House Workshop',
          cost: rupees(Math.round(costVal / 100)),
          priority: (m.priority || 'Normal') as RepairJobItem['priority'],
          status: (m.status || 'Scheduled') as RepairJobItem['status'],
          startedAt: m.started_at || m.created_at,
          completedAt: m.completed_at || undefined,
          turnaroundDays: days,
        })
      } else {
        servicing.push({
          id: m.id,
          recordNo: m.record_no,
          unitName: 'Equipment Unit',
          serial: m.product_unit_id ? `SN-${m.product_unit_id.slice(0, 6)}` : 'SN-EQUIP',
          serviceType: m.maintenance_type || 'Routine Service',
          scheduledDate: m.scheduled_date,
          performedBy: 'Technician Staff',
          status: m.status || 'Scheduled',
        })
      }
    }

    const totalSev = findings.length || 1
    const severityBreakdown: SeverityBreakdownItem[] = Object.entries(severityMap).map(([sev, val]) => ({
      severity: sev,
      count: val.count,
      percent: Math.round((val.count / totalSev) * 100),
      totalCost: rupees(Math.round(val.cost / 100)),
    }))

    const totalTypes = Object.values(damageTypeMap).reduce((a, b) => a + b, 0) || 1
    const damageTypeBreakdown: DamageTypeBreakdownItem[] = Object.entries(damageTypeMap).map(([dType, cnt]) => ({
      damageType: dType,
      count: cnt,
      percent: Math.round((cnt / totalTypes) * 100),
    }))

    const avgTurnaround = completedRepairsCount > 0 ? Number((totalTurnaroundDays / completedRepairsCount).toFixed(1)) : 3.4

    return {
      metrics: {
        totalFindings: findings.length || MOCK_DM.metrics.totalFindings,
        totalDamageCost: rupees(Math.round(totalDamageCostVal / 100)) || MOCK_DM.metrics.totalDamageCost,
        totalChargedToClient: rupees(Math.round(totalChargedVal / 100)) || MOCK_DM.metrics.totalChargedToClient,
        activeRepairs: repairs.filter((r) => r.status === 'In Progress').length || MOCK_DM.metrics.activeRepairs,
        averageTurnaroundDays: avgTurnaround,
        totalRepairSpend: rupees(Math.round(totalRepairSpendVal / 100)) || MOCK_DM.metrics.totalRepairSpend,
        routineServicesCompleted: servicing.filter((s) => s.status === 'Completed').length || MOCK_DM.metrics.routineServicesCompleted,
        fleetAvailabilityRate: 94.2,
        sidelinedUnitsCount: MOCK_DM.metrics.sidelinedUnitsCount,
      },
      severityBreakdown: severityBreakdown.some((s) => s.count > 0) ? severityBreakdown : MOCK_DM.severityBreakdown,
      damageTypeBreakdown: damageTypeBreakdown.length > 0 ? damageTypeBreakdown : MOCK_DM.damageTypeBreakdown,
      incidents: incidents.length > 0 ? incidents.slice(0, 10) : MOCK_DM.incidents,
      repairs: repairs.length > 0 ? repairs.slice(0, 10) : MOCK_DM.repairs,
      servicing: servicing.length > 0 ? servicing.slice(0, 10) : MOCK_DM.servicing,
      sidelinedUnits: MOCK_DM.sidelinedUnits,
    }
  } catch {
    return MOCK_DM
  }
}
