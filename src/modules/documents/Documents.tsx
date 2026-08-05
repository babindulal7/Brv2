import { useState } from 'react'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, Rail, FooterNote, cardStyle } from '../../components/ui/Page'
import { Donut, Legend } from '../../components/ui/Charts'
import { STATUS } from '../../lib/status'
import {
  TABS,
  FILTER_GROUPS,
  KPIS,
  DOC_STATUS,
  DOCUMENTS,
  SUMMARY_MIX,
  SUMMARY_TOTAL,
  MISSING,
  PENDING_SIGNATURES,
  EXPIRING,
  QUICK_ACTIONS,
  MORE_ACTIONS,
  SHOWING,
} from '../../data/documents'

const th = {
  textAlign: 'left' as const,
  padding: '9px 10px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px', fontSize: 'var(--t-meta)', color: 'var(--text)', whiteSpace: 'nowrap' as const }
const link = { fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--link)', textDecoration: 'none' } as const

/**
 * **Documents** — spec-derived (`Documents.md` v2.1, Build Locked). No render
 * in the reference set covers this screen.
 *
 * Two of the spec's corrections are load-bearing:
 *  · §5 **document lifecycle is not record state.** `Paid` is a record state and
 *    is never a document status; they are separate columns.
 *  · §6 there is no Recycle Bin — documents are archived, never deleted — so
 *    the row menu offers Archive and no Delete.
 */
export default function Documents() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('All')
  const [selected, setSelected] = useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        icon="file"
        title="Documents"
        description="The single repository for every document generated or uploaded. A document exists once."
        actions={
          <>
            {QUICK_ACTIONS.map((q, i) => (
              <Button key={q} icon={i === 0 ? 'plus' : 'download'} variant={i === 0 ? 'primary' : 'secondary'}>
                {q}
              </Button>
            ))}
            <Button icon="more_vert">More</Button>
          </>
        }
      />

      {/* §2 — tabs. The rail below holds filters only and does not repeat them. */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const on = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={on ? 'page' : undefined}
              style={{
                height: 34,
                padding: '0 13px',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--nav-active-accent)' : 'transparent'}`,
                background: 'transparent',
                color: on ? 'var(--nav-active-accent)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
              }}
            >
              {t}
            </button>
          )
        })}
      </div>

      <KpiStrip items={KPIS} columns={4} />

      <div style={{ display: 'grid', gridTemplateColumns: '190px minmax(0,1fr) 288px', gap: 'var(--sp-md)', alignItems: 'start' }}>
        <Card
          title="Filters"
          action={
            <span style={{ ...link, fontSize: 'var(--t-meta)' }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
              Clear all
            </span>
          }
          bodyStyle={{ padding: 8 }}
        >
          {FILTER_GROUPS.map((f) => (
            <button
              key={f}
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                height: 32,
                padding: '0 8px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                color: 'var(--text2)',
                fontSize: 'var(--t-meta)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ flex: 1, textAlign: 'left' }}>{f}</span>
              <Icon name="chevron_down" size={12} style={{ color: 'var(--muted)' }} />
            </button>
          ))}
          {/* §2 — filters apply instantly; there is no Apply button. */}
          <p style={{ margin: '8px 4px 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.4 }}>
            Filters apply instantly.
          </p>
        </Card>

        <Card bodyStyle={{ padding: 0 }}>
          {/* §11 — the bulk bar appears only on selection. */}
          {selected > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--nav-active-bg)',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--nav-active-accent)' }}>{selected} selected</span>
              {['Download', 'Email', 'Archive'].map((b) => (
                <Button key={b}>{b}</Button>
              ))}
              <button
                type="button"
                onClick={() => setSelected(0)}
                style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 'var(--t-meta)', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Clear
              </button>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 940 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  {['', 'Document', 'ID', 'Type', 'Related To', 'Client / Vendor', 'Status', 'Record State', 'Created (BS / AD)', 'Actions'].map(
                    (h, i) => (
                      <th key={h || `c${i}`} style={th}>
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {DOCUMENTS.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...td, width: 26 }}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${d.name}`}
                        onChange={(e) => setSelected((n) => (e.currentTarget.checked ? n + 1 : Math.max(0, n - 1)))}
                      />
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{d.name}</td>
                    <td className="identifier" style={{ ...td, color: 'var(--link)', fontWeight: 600, fontSize: 'var(--t-meta)' }}>{d.id}</td>
                    <td style={{ ...td, color: 'var(--text2)' }}>{d.type}</td>
                    <td style={td}>
                      <span className="figure" style={{ ...link, fontSize: 'var(--t-meta)' }} aria-disabled title="Not built yet — see SCREENS.md for what is done">
                        {d.relatedTo}
                      </span>
                    </td>
                    <td style={{ ...td, color: 'var(--text2)' }}>{d.party}</td>
                    {/* §5 — lifecycle … */}
                    <td style={td}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: 20,
                          padding: '0 8px',
                          borderRadius: 'var(--r-badge)',
                          background: STATUS[DOC_STATUS[d.status]].bg,
                          color: STATUS[DOC_STATUS[d.status]].fg,
                          fontSize: 'var(--t-meta)',
                          fontWeight: 600,
                        }}
                      >
                        {d.status}
                      </span>
                    </td>
                    {/* … and record state, which is a different thing entirely. */}
                    <td style={{ ...td, color: d.recordState === '—' ? 'var(--muted)' : 'var(--text2)' }}>{d.recordState}</td>
                    <td style={td}>
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)' }}>{d.createdBs}</span>
                      <span className="figure" style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{d.createdAd}</span>
                    </td>
                    <td style={td}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Button>View</Button>
                        <Icon name="more_vert" size={14} style={{ color: 'var(--muted)' }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', flexWrap: 'wrap', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
            <span>{SHOWING}</span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {/* §11 — 25 rows default. */}
              Rows per page
              <span className="figure" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 8px', borderRadius: 7, border: '1px solid var(--border)' }}>
                25
                <Icon name="chevron_down" size={11} style={{ color: 'var(--muted)' }} />
              </span>
            </span>
          </div>
        </Card>

        <Rail>
          <Card title="Document Summary">
            <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <Donut slices={SUMMARY_MIX} centreLabel="Total" centreValue={SUMMARY_TOTAL} size={104} />
              <Legend slices={SUMMARY_MIX} showPercent={false} />
            </div>
          </Card>

          <Card title={`Missing Documents (${MISSING.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {MISSING.map((m) => (
                <div key={m.doc + m.booking} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--t-meta)' }}>
                  <Icon name="alert_triangle" size={13} style={{ color: 'var(--danger-text)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, color: 'var(--text)' }}>{m.doc}</span>
                    {/* §0 — the panel names the booking and the client. */}
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      <span className="figure">{m.booking}</span> · {m.client}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Pending Signatures">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {PENDING_SIGNATURES.map((p) => (
                <div key={p.doc} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--t-meta)' }}>
                  <Icon name="crew" size={13} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.doc}
                    </span>
                    <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{p.party}</span>
                  </span>
                  <span
                    className="figure"
                    style={{ fontSize: 'var(--t-meta)', fontWeight: 600, flexShrink: 0, color: p.severe ? 'var(--danger-text)' : 'var(--text2)' }}
                  >
                    {p.ageing}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Expiring Soon">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {EXPIRING.map((e) => (
                <div key={e.doc} style={{ fontSize: 'var(--t-meta)' }}>
                  <span style={{ display: 'block', color: 'var(--text)', fontWeight: 600 }}>{e.doc}</span>
                  {/* §9 — say *what* expires, not just that something does. */}
                  <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                    {e.what} <span style={{ color: 'var(--progress-text)', fontWeight: 600 }}>{e.when}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div style={{ ...cardStyle, padding: 12, fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.5 }}>
            Documents are archived, never deleted — there is no recycle bin. The row menu holds{' '}
            {MORE_ACTIONS.length + 4} actions ending in Archive.
          </div>
        </Rail>
      </div>

      <FooterNote extra={['A document exists once and is linked wherever needed']} />
    </div>
  )
}
