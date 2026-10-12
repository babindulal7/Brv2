import { formatAd } from '../../lib/bs'
import { useMemo, useState } from 'react'
import { PageHeader, KpiStrip, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { DataTableShell } from '../../components/ui/DataTable'
import { ReportToolbar } from '../../components/ui/ReportToolbar'
import type { ReportCsvRow, ReportFilters } from '../../components/ui/ReportToolbar'
import { ReportFamiliesNav } from '../../components/ui/ReportFamiliesNav'
import Icon from '../../components/ui/Icon'
import { formatMoney, rupees } from '../../lib/money'
import { useCanViewMoney } from '../../lib/moneyVisibility'
import { useViewport } from '../../lib/device'
import { ROWS } from '../../data/rentals'
import { CLIENTS_DATA } from '../../data/clients'
import { CASES } from '../../data/cases'

type Domain = 'rentals' | 'invoices' | 'clients' | 'cases'

interface ColumnOption {
  id: string
  label: string
  money?: boolean
}

const DOMAIN_COLUMNS: Record<Domain, ColumnOption[]> = {
  rentals: [
    { id: 'bookingNo', label: 'Booking No' },
    { id: 'clientName', label: 'Client' },
    { id: 'projectName', label: 'Project' },
    { id: 'stage', label: 'Status' },
    { id: 'startDate', label: 'Pickup Date' },
    { id: 'endDate', label: 'Return Date' },
    { id: 'total', label: 'Rental Total', money: true },
    { id: 'paid', label: 'Paid Amount', money: true },
  ],
  invoices: [
    { id: 'invoiceNo', label: 'Invoice No' },
    { id: 'clientName', label: 'Client' },
    { id: 'issueDate', label: 'Issue Date' },
    { id: 'status', label: 'Status' },
    { id: 'subtotal', label: 'Subtotal', money: true },
    { id: 'total', label: 'Total', money: true },
    { id: 'outstanding', label: 'Outstanding', money: true },
  ],
  clients: [
    { id: 'clientCode', label: 'Client Code' },
    { id: 'name', label: 'Name' },
    { id: 'company', label: 'Company' },
    { id: 'tier', label: 'Membership' },
    { id: 'totalBookings', label: 'Current Rentals' },
    { id: 'credit', label: 'Credit Limit', money: true },
    { id: 'balance', label: 'Outstanding', money: true },
  ],
  cases: [
    { id: 'caseNo', label: 'Case No' },
    { id: 'type', label: 'Type' },
    { id: 'title', label: 'Title' },
    { id: 'counterparty', label: 'Counterparty' },
    { id: 'priority', label: 'Priority' },
    { id: 'status', label: 'Status' },
    { id: 'assessed', label: 'Assessed Amount', money: true },
    { id: 'recovered', label: 'Recovered Amount', money: true },
  ],
}

interface CustomRow {
  [key: string]: string | number | undefined
  rawTotal: number
}

const th = {
  textAlign: 'left' as const,
  padding: '10px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}

const td = {
  height: 'var(--row-min-h)',
  padding: '10px 12px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  borderBottom: '1px solid var(--border)',
}

export default function CustomReport() {
  const money = useCanViewMoney()
  const viewport = useViewport()
  const [domain, setDomain] = useState<Domain>('rentals')
  const [search, setSearch] = useState('')
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'bookingNo',
    'clientName',
    'projectName',
    'stage',
    'startDate',
    'total',
  ])
  const [filters, setFilters] = useState<ReportFilters>({})

  // When domain changes, default columns for that domain
  const handleDomainChange = (newDomain: Domain) => {
    setDomain(newDomain)
    const available = DOMAIN_COLUMNS[newDomain]
      .filter((c) => money || !c.money)
      .map((c) => c.id)
    setSelectedColumns(available)
  }

  // Toggle column
  const toggleColumn = (colId: string) => {
    if (selectedColumns.includes(colId)) {
      if (selectedColumns.length > 2) {
        setSelectedColumns(selectedColumns.filter((id) => id !== colId))
      }
    } else {
      setSelectedColumns([...selectedColumns, colId])
    }
  }

  // Filter rows based on domain and search
  const rows = useMemo<CustomRow[]>(() => {
    const q = search.toLowerCase().trim()

    if (domain === 'rentals') {
      return ROWS.filter((b) => {
        if (!q) return true
        return (
          b.bookingNo.toLowerCase().includes(q) ||
          b.client.toLowerCase().includes(q) ||
          b.project.toLowerCase().includes(q)
        )
      }).map((b): CustomRow => ({
        bookingNo: b.bookingNo,
        clientName: b.client,
        projectName: b.project,
        stage: b.status,
        startDate: formatAd(b.pickup.ad),
        endDate: formatAd(b.ret.ad),
        total: b.amount ? formatMoney(b.amount) : '—',
        paid: b.amount && b.due !== undefined ? formatMoney(rupees(Math.max(0, (b.amount as number) - (b.due as number)))) : '—',
        rawTotal: (b.amount as number) || 0,
      }))
    } else if (domain === 'invoices') {
      // Mock / snapshot invoice data
      const sampleInvoices = [
        { invoiceNo: 'INV-2026-001', clientName: 'Kathmandu Cinema Works', issueDate: '2026-07-15', status: 'Paid', subtotal: rupees(120000), total: rupees(135600), outstanding: rupees(0) },
        { invoiceNo: 'INV-2026-002', clientName: 'Himalayan Film Collective', issueDate: '2026-07-18', status: 'Paid', subtotal: rupees(85000), total: rupees(96050), outstanding: rupees(0) },
        { invoiceNo: 'INV-2026-003', clientName: 'Everest Frame Studios', issueDate: '2026-07-22', status: 'Unpaid', subtotal: rupees(210000), total: rupees(237300), outstanding: rupees(237300) },
        { invoiceNo: 'INV-2026-004', clientName: 'Pokhara Visuals', issueDate: '2026-07-25', status: 'Partially Paid', subtotal: rupees(160000), total: rupees(180800), outstanding: rupees(80800) },
      ]
      return sampleInvoices.filter((inv) => {
        if (!q) return true
        return (
          inv.invoiceNo.toLowerCase().includes(q) ||
          inv.clientName.toLowerCase().includes(q)
        )
      }).map((inv): CustomRow => ({
        invoiceNo: inv.invoiceNo,
        clientName: inv.clientName,
        issueDate: inv.issueDate,
        status: inv.status,
        subtotal: formatMoney(inv.subtotal),
        total: formatMoney(inv.total),
        outstanding: formatMoney(inv.outstanding),
        rawTotal: inv.total as number,
      }))
    } else if (domain === 'clients') {
      return CLIENTS_DATA.filter((c) => {
        if (!q) return true
        return (
          c.name.toLowerCase().includes(q) ||
          (c.company && c.company.toLowerCase().includes(q)) ||
          c.id.toLowerCase().includes(q)
        )
      }).map((c): CustomRow => ({
        clientCode: c.id,
        name: c.name,
        company: c.company ?? '—',
        tier: c.membership,
        totalBookings: c.currentRentalsCount,
        credit: formatMoney(c.creditLimitPaisa),
        balance: formatMoney(c.outstandingPaisa),
        rawTotal: c.outstandingPaisa as number,
      }))
    } else {
      return CASES.filter((cs) => {
        if (!q) return true
        return (
          cs.id.toLowerCase().includes(q) ||
          cs.title.toLowerCase().includes(q) ||
          cs.counterpartyName.toLowerCase().includes(q)
        )
      }).map((cs): CustomRow => ({
        caseNo: cs.id,
        type: cs.type,
        title: cs.title,
        counterparty: cs.counterpartyName,
        priority: cs.priority,
        status: cs.status,
        assessed: formatMoney(cs.assessedPaisa),
        recovered: formatMoney(cs.chargedToClientPaisa),
        rawTotal: cs.assessedPaisa as number,
      }))
    }
  }, [domain, search])

  // KPIs derived from custom query
  const kpis = useMemo<Kpi[]>(() => {
    const count = rows.length
    const totalAmount = rupees(
      rows.reduce((sum: number, r: CustomRow) => sum + r.rawTotal, 0),
    )

    return [
      {
        label: 'Extracted Records',
        value: String(count),
        icon: 'box',
        accent: 'primary',
        note: `Target domain: ${domain.toUpperCase()}`,
      },
      {
        label: 'Active Columns',
        value: `${selectedColumns.length} fields`,
        icon: 'checklist',
        accent: 'neutral',
        note: 'Included in tabular view & CSV',
      },
      ...(money
        ? [
            {
              label: 'Aggregated Volume',
              value: formatMoney(totalAmount),
              icon: 'dollar' as const,
              accent: 'success' as const,
              note: 'Sum of selected domain records',
            },
          ]
        : []),
    ]
  }, [rows, domain, selectedColumns.length, money])

  // Available column metadata for current domain
  const availableColumns = useMemo(() => {
    return DOMAIN_COLUMNS[domain].filter((c) => money || !c.money)
  }, [domain, money])

  const activeColumnDefs = useMemo(() => {
    return availableColumns.filter((c) => selectedColumns.includes(c.id))
  }, [availableColumns, selectedColumns])

  // CSV Builder
  function getCsvRows(): ReportCsvRow[] {
    const headers = activeColumnDefs.map((c) => c.label)
    const dataRows = rows.map((r) =>
      activeColumnDefs.map((c) => {
        const val = r[c.id]
        return val != null ? String(val) : '—'
      }),
    )

    return [
      [`Custom ${domain.toUpperCase()} Report Extract`],
      [`Generated for Babin Rentals OS · ${formatAd(new Date())}`],
      [],
      headers,
      ...dataRows,
    ]
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="tool"
        title="Custom Report Builder"
        description="Build ad-hoc reports, choose fields, filter records across operational domains, and export clean CSVs."
      />

      <ReportFamiliesNav current="Custom" />

      {/* Domain Selection & Toolbar */}
      <ReportToolbar
        title="Custom Report Builder"
        value={filters}
        onChange={setFilters}
        csv={{
          filename: `custom-report-${domain}`,
          build: getCsvRows,
        }}
      >
        <div
          role="group"
          aria-label="Custom report domain selector"
          className="report-view-toggle"
          style={{ display: 'inline-flex' }}
        >
          {([
            ['Rentals / Bookings', 'rentals'],
            ['Invoices & Billing', 'invoices'],
            ['Clients & CRM', 'clients'],
            ['Cases & Incidents', 'cases'],
          ] as const).map(([label, d]) => {
            const active = domain === d
            return (
              <button
                key={d}
                type="button"
                className="tap"
                onClick={() => handleDomainChange(d)}
                aria-pressed={active}
                style={{
                  minHeight: 44,
                  padding: '0 14px',
                  fontSize: 'var(--t-meta)',
                  fontWeight: active ? 600 : 400,
                  border: '1px solid var(--border)',
                  background: active ? 'var(--nav-active-bg)' : 'transparent',
                  color: active ? 'var(--nav-active-accent)' : 'var(--text2)',
                  borderRadius:
                    d === 'rentals'
                      ? 'var(--rad-sm) 0 0 var(--rad-sm)'
                      : d === 'cases'
                        ? '0 var(--rad-sm) var(--rad-sm) 0'
                        : 0,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </ReportToolbar>

      {/* Search Input & Column Selection Strip */}
      <div
        style={{
          ...cardStyle,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
          <Icon name="search" size={16} style={{ color: 'var(--muted)' }} />
          <input
            type="search"
            aria-label={`Filter ${domain} records`}
            placeholder={`Filter ${domain} records…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: 'var(--t-meta)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-sm)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text2)', marginRight: 6 }}>
            Include Columns:
          </span>
          {availableColumns.map((col) => {
            const isSelected = selectedColumns.includes(col.id)
            return (
              <button
                key={col.id}
                type="button"
                className="tap"
                onClick={() => toggleColumn(col.id)}
                aria-pressed={isSelected}
                style={{
                  minHeight: 36,
                  padding: '0 12px',
                  borderRadius: 'var(--r-badge)',
                  fontSize: 'var(--t-meta)',
                  fontWeight: isSelected ? 600 : 400,
                  border: `1px solid ${isSelected ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--nav-active-bg)' : 'transparent',
                  color: isSelected ? 'var(--nav-active-accent)' : 'var(--muted)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {isSelected ? <Icon name="check" size={13} /> : <span style={{ width: 13 }} />}
                {col.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Dynamic KPIs */}
      <KpiStrip items={kpis} columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : kpis.length} />

      {/* Dynamic Data Table */}
      <DataTableShell ariaLabel={`Custom tabular query with ${selectedColumns.length} fields over ${domain}`}>
        {rows.length === 0 ? (
          <div style={{ padding: 'var(--sp-xl)', textAlign: 'center', color: 'var(--muted)' }}>
            No records match the current filters.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {activeColumnDefs.map((col) => (
                  <th key={col.id} style={th}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  {activeColumnDefs.map((col) => {
                    const val = row[col.id]
                    return (
                      <td key={col.id} style={td} className={col.money ? 'figure' : undefined}>
                        {val != null ? String(val) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataTableShell>
    </div>
  )
}
