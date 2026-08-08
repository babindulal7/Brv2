import { useState } from 'react'
import { Card, PageHeader, Button, Rail, SummaryRows } from '../../components/ui/Page'
import Icon from '../../components/ui/Icon'

const CASE_ROWS = [
  ['CASE-2026-0041', 'Damage', 'Sony FX3 LCD Scratch', 'Himalayan Films', 'Awaiting Decision', 'Rs 18,000', 'Rs 5,500'],
  ['CASE-2026-0040', 'Missing', 'NP-FZ100 Battery (1 Pc)', 'Classic Media', 'In Progress', 'Rs 7,500', 'Rs 3,000'],
  ['CASE-2026-0039', 'Damage', 'NISI 35mm Lens Front Element', 'Lens Rental Nepal', 'In Progress', 'Rs 22,000', 'Rs 10,000'],
  ['CASE-2026-0038', 'Dispute', 'Dispute on Damage Charge', 'Maya Production', 'Under Review', 'Rs 15,000', 'Rs 15,000'],
  ['CASE-2026-0037', 'Vendor', 'Late Return by Sub-rental Partner', 'Filmgear Rentals', 'Resolved', 'Rs 5,000', 'Rs 0'],
  ['CASE-2026-0036', 'Missing', 'HDMI Cable (Short)', 'Studio Frames', 'Resolved', 'Rs 1,200', 'Rs 0'],
]

const kpis = [
  ['Total Cases', '96', 'vs last period', 'var(--cat-1)'],
  ['Resolved', '72', '75% resolution rate', 'var(--good)'],
  ['Open', '18', 'currently active', 'var(--warn)'],
  ['Overdue', '6', 'need attention', 'var(--bad)'],
  ['Total Cost', 'Rs 3,42,800', 'assessed value', 'var(--danger-text)'],
  ['Avg Resolution Time', '3.6 Days', 'down 0.4 days', 'var(--info)'],
] as const

function Bar({ label, value, max, tone = 'var(--cat-1)' }: { label: string; value: number; max: number; tone?: string }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 35px', gap: 8, alignItems: 'center', fontSize: 'var(--t-meta)' }}>
    <span style={{ color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    <span style={{ height: 8, background: 'var(--card2)', borderRadius: 99, overflow: 'hidden' }}><span style={{ display: 'block', width: `${(value / max) * 100}%`, height: '100%', background: tone, borderRadius: 99 }} /></span>
    <span className="figure" style={{ color: 'var(--text)', textAlign: 'right' }}>{value}</span>
  </div>
}

export default function CasesReports() {
  const [period, setPeriod] = useState('This Month')
  const [selected, setSelected] = useState(CASE_ROWS[0]?.[0] ?? '')
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
    <PageHeader title="Cases Reports" description="Analyze incidents, resolution performance, exposure, and operational risk." actions={<><Button icon="refresh">Compare</Button><Button icon="download">Export</Button><Button icon="eye">Saved Views</Button><Button icon="calendar_stats" variant="primary">Schedule Report</Button></>} />
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{['This Month', 'Last Month', 'This Quarter', 'This Year', 'Custom Range'].map((x) => <button key={x} onClick={() => setPeriod(x)} aria-pressed={period === x} style={{ height: 30, padding: '0 11px', borderRadius: 8, border: `1px solid ${period === x ? 'var(--nav-active-accent)' : 'var(--border)'}`, background: period === x ? 'var(--nav-active-bg)' : 'var(--card)', color: period === x ? 'var(--nav-active-accent)' : 'var(--text2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'var(--t-meta)' }}>{x}</button>)}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{['Case Type', 'Severity', 'Status', 'Owner', 'Client Type', 'Date Range'].map((x) => <Button key={x} icon="chevron_down">{x}</Button>)}<Button icon="queues">Clear Filters</Button></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 10 }}>{kpis.map(([label, value, note, tone]) => <Card key={label}><div style={{ color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>{label}</div><div className="figure" style={{ color: tone, fontSize: 'var(--t-h2)', fontWeight: 700, marginTop: 6 }}>{value}</div><div style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)', marginTop: 3 }}>{note}</div></Card>)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'var(--sp-md)', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', minWidth: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr 1fr', gap: 'var(--sp-md)' }}>
          <Card title="Cases Trend"><div style={{ height: 150, display: 'flex', alignItems: 'end', gap: 10, padding: '14px 4px 4px' }}>{[22, 31, 26, 42, 35, 48, 41, 56, 49, 62, 58, 72].map((v, i) => <span key={i} title={`${v} cases`} style={{ flex: 1, height: `${(v / 72) * 100}%`, background: i > 8 ? 'var(--cat-1)' : 'var(--cat-2)', borderRadius: '4px 4px 0 0', opacity: .9 }} />)}</div></Card>
          <Card title="Cases by Type"><div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{[['Damage', 38], ['Missing', 24], ['Dispute', 16], ['Theft', 9], ['Vendor', 9]].map(([l, v], i) => <Bar key={l} label={String(l)} value={Number(v)} max={38} tone={`var(--cat-${(i % 5) + 1})`} />)}</div></Card>
          <Card title="Cases by Status"><div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{[['Resolved', 72], ['Open', 18], ['Overdue', 6]].map(([l, v]) => <Bar key={l} label={String(l)} value={Number(v)} max={72} tone={l === 'Resolved' ? 'var(--good)' : l === 'Overdue' ? 'var(--bad)' : 'var(--warn)'} />)}</div></Card>
        </div>
        <Card title="Cases List" action={<span style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}>Showing 1 to 25 of 96 cases</span>} bodyStyle={{ padding: 0 }}><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 950 }}><thead><tr style={{ background: 'var(--th-bg)' }}>{['Case ID', 'Type', 'Title', 'Counterparty', 'Status', 'Assessed', 'Outstanding'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '9px 10px', color: 'var(--text2)', fontSize: 'var(--t-th)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead><tbody>{CASE_ROWS.map((r) => <tr key={r[0]} onClick={() => setSelected(r[0] ?? '')} style={{ borderTop: '1px solid var(--border)', background: selected === r[0] ? 'var(--nav-active-bg)' : 'transparent', cursor: 'pointer' }}>{r.map((cell, i) => <td key={i} className={i === 0 ? 'identifier' : i > 4 ? 'figure' : undefined} style={{ padding: '11px 10px', fontSize: 'var(--t-meta)', color: i === 0 ? 'var(--link)' : i === 6 && cell !== 'Rs 0' ? 'var(--danger-text)' : 'var(--text)', fontWeight: i === 0 || i === 4 ? 600 : 400 }}>{cell}</td>)}</tr>)}</tbody></table></div></Card>
      </div>
      <Rail><Card title="Cases Summary"><SummaryRows rows={[{ label: 'Total Cases', value: '96' }, { label: 'Resolved', value: '72' }, { label: 'Open', value: '18' }, { label: 'Overdue', value: '6' }, { label: 'Total Cost', value: 'Rs 3,42,800', tone: 'danger' }]} /></Card><Card title="Top Case Types"><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[['Damage', '38'], ['Missing', '24'], ['Dispute', '16'], ['Theft', '9']].map(([l, v]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--t-meta)' }}><span>{l}</span><span className="figure" style={{ fontWeight: 700 }}>{v}</span></div>)}</div></Card><Card title="Quick Actions"><div style={{ display: 'grid', gap: 8 }}>{['Export PDF', 'Export Excel', 'Schedule Report', 'Create Dashboard Widget'].map((x) => <Button key={x} icon="download">{x}</Button>)}</div></Card><div style={{ color: 'var(--muted)', fontSize: 'var(--t-meta)' }}><Icon name="info" size={13} /> Period: {period}</div></Rail>
    </div>
  </div>
}
