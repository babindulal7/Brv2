import { supabase } from '../supabase'
import { STAFF_LIST } from '../../data/staffReports'
import { ACTIVITY_ROWS } from '../../data/activityLog'

export interface ActivityReportFilterOptions {
  from?: string | undefined
  to?: string | undefined
  userId?: string | undefined
  module?: string | undefined
}

export interface StaffActivitySummary {
  userId: string
  name: string
  role: string
  employeeCode: string
  totalActions: number
  actionsBreakdown: Record<string, number>
  lastActive: string | null
  recentAction: string | null
}

export interface ActivityReportEvent {
  id: string
  timestamp: string
  actorId: string | null
  actorName: string
  actorRole: string
  action: string
  category: string
  module: string
  severity: string
  status: 'Success' | 'Failed'
  tableName: string | null
  recordId: string | null
  ipAddress: string | null
  deviceType: string | null
  reason: string | null
}

export interface ActivityReportMetrics {
  totalEvents: number
  successfulEvents: number
  failedEvents: number
  criticalEvents: number
  activeOperators: number
  mostActiveModule: string
  mostActiveOperator: string
}

export interface ActivityCategoryDistribution {
  label: string
  count: number
  percentage: number
  color: string
}

export interface ActivityReportData {
  metrics: ActivityReportMetrics
  eventsByCategory: ActivityCategoryDistribution[]
  eventsBySeverity: ActivityCategoryDistribution[]
  staffSummaries: StaffActivitySummary[]
  recentEvents: ActivityReportEvent[]
}

const CATEGORY_COLORS: Record<string, string> = {
  Rentals: 'var(--primary)',
  Operations: '#3b82f6',
  Inventory: '#10b981',
  Finance: '#f59e0b',
  Authentication: '#8b5cf6',
  Administration: '#ec4899',
  Tools: '#6b7280',
  Settings: '#64748b',
}

const SEVERITY_COLORS: Record<string, string> = {
  Informational: 'var(--muted)',
  Low: '#10b981',
  Medium: '#f59e0b',
  High: '#ef4444',
  Critical: '#b91c1c',
}

interface DbUserRow {
  id: string
  employee_code: string | null
  full_name: string | null
  primary_role: string | null
  department: string | null
  is_active: boolean | null
}

interface DbAuditEventRow {
  id: string
  created_at: string
  action: string | null
  category: string | null
  module: string | null
  severity: string | null
  status: string | null
  actor_id: string | null
  actor_role: string | null
  table_name: string | null
  record_id: string | null
  ip_address: string | null
  device_type: string | null
  reason: string | null
}

export async function getActivityReport(
  options?: ActivityReportFilterOptions,
): Promise<ActivityReportData> {
  try {
    const [usersRes, auditRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, employee_code, full_name, primary_role, department, is_active'),
      (() => {
        let q = supabase
          .from('audit_events')
          .select(
            'id, created_at, action, category, module, severity, status, actor_id, actor_role, table_name, record_id, ip_address, device_type, reason',
          )
          .order('created_at', { ascending: false })
          .limit(300)

        if (options?.from) q = q.gte('created_at', options.from)
        if (options?.to) q = q.lte('created_at', options.to)
        if (options?.userId) q = q.eq('actor_id', options.userId)
        if (options?.module) q = q.eq('module', options.module)

        return q
      })(),
    ])

    const dbUsers = (usersRes.data ?? []) as unknown as DbUserRow[]
    const dbAudits = (auditRes.data ?? []) as unknown as DbAuditEventRow[]

    // User lookup map
    const userMap = new Map<string, { name: string; role: string; code: string }>()
    for (const u of dbUsers) {
      userMap.set(u.id, {
        name: u.full_name || 'Staff Member',
        role: u.primary_role || 'Staff',
        code: u.employee_code || u.id.slice(0, 8),
      })
    }

    // Seed mock fallback if no database rows present
    if (dbAudits.length === 0) {
      return buildMockActivityData(options)
    }

    // Process audit rows
    const events: ActivityReportEvent[] = []
    const categoryCounts: Record<string, number> = {}
    const severityCounts: Record<string, number> = {}
    const staffActionMap = new Map<
      string,
      {
        total: number
        byCategory: Record<string, number>
        lastActive: string | null
        recentAction: string | null
      }
    >()

    let successCount = 0
    let failedCount = 0
    let criticalCount = 0

    for (const a of dbAudits) {
      const actorInfo = a.actor_id ? userMap.get(a.actor_id) : null
      const actorName = actorInfo?.name || (a.actor_role ? `${a.actor_role} Operator` : 'System')
      const actorRole = actorInfo?.role || a.actor_role || 'Staff'
      const category = a.category || a.module || 'Operations'
      const severity = a.severity || 'Informational'
      const status: 'Success' | 'Failed' =
        a.status === 'failure' || a.status === 'Failed' ? 'Failed' : 'Success'

      if (status === 'Success') successCount++
      else failedCount++

      if (severity === 'Critical' || severity === 'High') criticalCount++

      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1
      severityCounts[severity] = (severityCounts[severity] ?? 0) + 1

      const actorKey = a.actor_id || actorName
      const existing = staffActionMap.get(actorKey) ?? {
        total: 0,
        byCategory: {},
        lastActive: null,
        recentAction: null,
      }
      existing.total += 1
      existing.byCategory[category] = (existing.byCategory[category] ?? 0) + 1
      if (!existing.lastActive) {
        existing.lastActive = a.created_at
        existing.recentAction = a.action
      }
      staffActionMap.set(actorKey, existing)

      events.push({
        id: a.id,
        timestamp: a.created_at,
        actorId: a.actor_id,
        actorName,
        actorRole,
        action: a.action || 'Performed action',
        category,
        module: a.module || category,
        severity,
        status,
        tableName: a.table_name,
        recordId: a.record_id,
        ipAddress: a.ip_address,
        deviceType: a.device_type,
        reason: a.reason,
      })
    }

    const totalEvents = events.length
    const activeOperators = staffActionMap.size

    // Determine most active module
    let mostActiveModule = 'None'
    let maxModCount = -1
    for (const [mod, count] of Object.entries(categoryCounts)) {
      if (count > maxModCount) {
        maxModCount = count
        mostActiveModule = mod
      }
    }

    // Determine most active operator
    let mostActiveOperator = 'None'
    let maxOpCount = -1
    for (const [opKey, data] of staffActionMap.entries()) {
      if (data.total > maxOpCount) {
        maxOpCount = data.total
        const actor = userMap.get(opKey)
        mostActiveOperator = actor?.name || opKey
      }
    }

    // Build Staff Summaries
    const staffSummaries: StaffActivitySummary[] = []
    for (const u of dbUsers) {
      const stats = staffActionMap.get(u.id)
      staffSummaries.push({
        userId: u.id,
        name: u.full_name || 'Staff Member',
        role: u.primary_role || 'Staff',
        employeeCode: u.employee_code || u.id.slice(0, 8),
        totalActions: stats?.total ?? 0,
        actionsBreakdown: stats?.byCategory ?? {},
        lastActive: stats?.lastActive ?? null,
        recentAction: stats?.recentAction ?? null,
      })
    }
    // Sort descending by total actions
    staffSummaries.sort((a, b) => b.totalActions - a.totalActions)

    // Build category distributions
    const eventsByCategory: ActivityCategoryDistribution[] = Object.entries(categoryCounts).map(
      ([cat, count]) => ({
        label: cat,
        count,
        percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0,
        color: CATEGORY_COLORS[cat] || 'var(--primary)',
      }),
    )

    // Build severity distributions
    const eventsBySeverity: ActivityCategoryDistribution[] = Object.entries(severityCounts).map(
      ([sev, count]) => ({
        label: sev,
        count,
        percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0,
        color: SEVERITY_COLORS[sev] || 'var(--muted)',
      }),
    )

    return {
      metrics: {
        totalEvents,
        successfulEvents: successCount,
        failedEvents: failedCount,
        criticalEvents: criticalCount,
        activeOperators,
        mostActiveModule,
        mostActiveOperator,
      },
      eventsByCategory,
      eventsBySeverity,
      staffSummaries,
      recentEvents: events,
    }
  } catch {
    return buildMockActivityData(options)
  }
}

function buildMockActivityData(options?: ActivityReportFilterOptions): ActivityReportData {
  const staff = STAFF_LIST.map((s, idx) => ({
    userId: s.id,
    name: s.name,
    role: s.role,
    employeeCode: `STF-${String(idx + 1).padStart(3, '0')}`,
    totalActions: s.tasksCompleted,
    actionsBreakdown: {
      Rentals: Math.round(s.tasksCompleted * 0.4),
      Operations: Math.round(s.tasksCompleted * 0.3),
      Inventory: Math.round(s.tasksCompleted * 0.2),
      Finance: Math.round(s.tasksCompleted * 0.1),
    },
    lastActive: new Date(Date.now() - idx * 3600000).toISOString(),
    recentAction: idx === 0 ? 'Verified Handover Dispatch' : idx === 1 ? 'Logged Return Inspection' : 'Assigned Product Unit Tag',
  }))

  const events: ActivityReportEvent[] = ACTIVITY_ROWS.map((r, idx) => ({
    id: r.id || `EVT-${String(idx + 1).padStart(4, '0')}`,
    timestamp: r.timestamp,
    actorId: null,
    actorName: r.user,
    actorRole: 'Operator',
    action: r.action,
    category: r.module,
    module: r.module,
    severity: idx % 7 === 0 ? 'Medium' : idx % 13 === 0 ? 'High' : 'Informational',
    status: r.status,
    tableName: r.target?.kind || 'bookings',
    recordId: r.target?.label || null,
    ipAddress: '192.168.1.10' + (idx % 9),
    deviceType: 'Desktop',
    reason: null,
  }))

  const filteredEvents = options?.module
    ? events.filter((e) => e.module === options.module)
    : events

  const categoryCounts: Record<string, number> = {}
  const severityCounts: Record<string, number> = {}
  let successCount = 0
  let failedCount = 0
  let criticalCount = 0

  for (const e of filteredEvents) {
    categoryCounts[e.category] = (categoryCounts[e.category] ?? 0) + 1
    severityCounts[e.severity] = (severityCounts[e.severity] ?? 0) + 1
    if (e.status === 'Success') successCount++
    else failedCount++
    if (e.severity === 'Critical' || e.severity === 'High') criticalCount++
  }

  const totalEvents = filteredEvents.length

  const eventsByCategory: ActivityCategoryDistribution[] = Object.entries(categoryCounts).map(
    ([cat, count]) => ({
      label: cat,
      count,
      percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0,
      color: CATEGORY_COLORS[cat] || 'var(--primary)',
    }),
  )

  const eventsBySeverity: ActivityCategoryDistribution[] = Object.entries(severityCounts).map(
    ([sev, count]) => ({
      label: sev,
      count,
      percentage: totalEvents > 0 ? Math.round((count / totalEvents) * 100) : 0,
      color: SEVERITY_COLORS[sev] || 'var(--muted)',
    }),
  )

  return {
    metrics: {
      totalEvents,
      successfulEvents: successCount,
      failedEvents: failedCount,
      criticalEvents: criticalCount,
      activeOperators: staff.length,
      mostActiveModule: 'Rentals',
      mostActiveOperator: staff[0]?.name ?? 'Bishal Thapa',
    },
    eventsByCategory,
    eventsBySeverity,
    staffSummaries: staff,
    recentEvents: filteredEvents,
  }
}
