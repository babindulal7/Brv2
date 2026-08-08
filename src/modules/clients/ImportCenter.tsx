import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { useToast } from '../../components/ui/Toast'
import { parseCsv, csvCell } from '../../lib/csv'
import {
  IMPORT_TARGET_FIELDS,
  IMPORT_SAMPLE_HEADERS,
  IMPORT_SAMPLE_ROW,
  guessTargetField,
  buildImportRow,
  type ImportTargetField,
  type ImportRowResult,
} from '../../lib/clientImport'
import { CLIENTS_DATA } from '../../data/clients'

/**
 * Import Center — the last confirmed Clients gap from this session's audit
 * reconciliation (`PLAN.md §6.4`). Upload → map columns → preview & validate
 * → import. Parsing, mapping-guesses, per-row validation and duplicate
 * matching are all real (`lib/csv.ts`, `lib/clientImport.ts`); the commit
 * step simulates, same disclosed pre-Phase-1 limit as every other "New X"
 * screen — nothing here writes to `CLIENTS_DATA`.
 */

const inputStyle: CSSProperties = {
  height: 34,
  padding: '0 10px',
  borderRadius: 'var(--r-input)',
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontSize: 'var(--t-meta)',
  fontFamily: 'inherit',
}

function downloadSampleCsv() {
  const lines = [IMPORT_SAMPLE_HEADERS.join(','), IMPORT_SAMPLE_ROW.map(csvCell).join(',')]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'client-import-sample.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export default function ImportCenter() {
  const navigate = useNavigate()
  const { showSuccessToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [mapping, setMapping] = useState<Record<number, ImportTargetField>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)

  const headers = useMemo(() => {
    if (rawRows.length === 0) return []
    const first = rawRows[0]!
    return hasHeaderRow ? first : first.map((_, i) => `Column ${i + 1}`)
  }, [rawRows, hasHeaderRow])

  const dataRows = useMemo(() => (hasHeaderRow ? rawRows.slice(1) : rawRows), [rawRows, hasHeaderRow])

  const mappedFields = useMemo(() => new Set(Object.values(mapping)), [mapping])
  const nameMapped = Array.from(mappedFields).includes('name')
  const phoneMapped = Array.from(mappedFields).includes('phone')
  const readyToPreview = nameMapped && phoneMapped

  const results: ImportRowResult[] = useMemo(() => {
    if (!readyToPreview) return []
    return dataRows.map((row, i) => {
      const raw = {} as Record<ImportTargetField, string>
      IMPORT_TARGET_FIELDS.forEach((f) => {
        raw[f.key] = ''
      })
      row.forEach((value, colIndex) => {
        const target = mapping[colIndex]
        if (target && target !== 'skip') raw[target] = value
      })
      return buildImportRow(raw, i, CLIENTS_DATA)
    })
  }, [dataRows, mapping, readyToPreview])

  const readyRows = results.filter((r) => r.errors.length === 0 && !skippedRows.has(r.rowIndex))
  const errorRows = results.filter((r) => r.errors.length > 0)
  const duplicateRows = results.filter((r) => r.duplicateOf && r.errors.length === 0)

  function handleFile(file: File) {
    setParseError(null)
    setMapping({})
    setSkippedRows(new Set())
    setImported(false)
    file
      .text()
      .then((text) => {
        const parsed = parseCsv(text)
        if (parsed.length === 0) {
          setParseError('That file has no rows.')
          return
        }
        setFileName(file.name)
        setRawRows(parsed)
        const first = parsed[0]!
        const guesses: Record<number, ImportTargetField> = {}
        first.forEach((h, i) => {
          guesses[i] = guessTargetField(h)
        })
        setMapping(guesses)
      })
      .catch(() => setParseError('Could not read that file — make sure it is a plain-text CSV.'))
  }

  function reset() {
    setFileName(null)
    setRawRows([])
    setMapping({})
    setParseError(null)
    setSkippedRows(new Set())
    setImported(false)
  }

  function runImport() {
    setImporting(true)
    window.setTimeout(() => {
      setImporting(false)
      setImported(true)
      showSuccessToast(
        'Import complete',
        `${readyRows.length} client${readyRows.length === 1 ? '' : 's'} imported · ${errorRows.length} skipped for errors · ${duplicateRows.length} flagged as possible duplicates`,
      )
      window.setTimeout(() => navigate('/clients'), 1100)
    }, 700)
  }

  const kpis: Kpi[] = readyToPreview
    ? [
        { label: 'Ready to Import', value: String(readyRows.length), icon: 'checklist', accent: 'success' },
        { label: 'Errors', value: String(errorRows.length), icon: 'alert_triangle', accent: errorRows.length ? 'danger' : 'neutral' },
        { label: 'Possible Duplicates', value: String(duplicateRows.length), icon: 'users', accent: duplicateRows.length ? 'progress' : 'neutral' },
        { label: 'Total Rows', value: String(dataRows.length), icon: 'file', accent: 'primary' },
      ]
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', paddingBottom: 32 }}>
      <PageHeader
        icon="upload"
        title="Import Clients"
        description="Upload a CSV, map its columns, then review every row before anything is created."
        actions={
          <Button icon="external_link" onClick={() => navigate('/clients')}>
            Back to Clients
          </Button>
        }
      />

      {rawRows.length === 0 && (
        <section style={{ ...cardStyle, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const file = e.dataTransfer.files[0]
              if (file) handleFile(file)
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            style={{
              border: `1.5px dashed ${dragOver ? 'var(--nav-active-accent)' : 'var(--border)'}`,
              borderRadius: 10,
              padding: '36px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'var(--nav-active-bg)' : 'var(--card2)',
            }}
          >
            <Icon name="upload" size={28} style={{ color: 'var(--muted)' }} />
            <div style={{ marginTop: 10, fontSize: 'var(--t-ui)', fontWeight: 600, color: 'var(--text)' }}>
              Drag and drop a CSV file here or <span style={{ color: 'var(--link)' }}>click to browse</span>
            </div>
            <div style={{ marginTop: 4, fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>
              First row should be column headers. Comma-separated, UTF-8.
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
            style={{ display: 'none' }}
          />
          {parseError && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--danger-text)' }}>
              <Icon name="error" size={14} />
              {parseError}
            </span>
          )}
          <button
            type="button"
            onClick={downloadSampleCsv}
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--link)',
              fontSize: 'var(--t-meta)',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            <Icon name="download" size={14} />
            Download a sample CSV
          </button>
        </section>
      )}

      {rawRows.length > 0 && (
        <>
          <section style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="file" size={16} style={{ color: 'var(--text2)' }} />
                <strong style={{ color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{fileName}</strong>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>· {dataRows.length} data row{dataRows.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <input
                    type="checkbox"
                    checked={hasHeaderRow}
                    onChange={(e) => setHasHeaderRow(e.target.checked)}
                    style={{ accentColor: 'var(--nav-active-accent)' }}
                  />
                  First row is headers
                </label>
                <Button icon="close" onClick={reset}>
                  Choose Different File
                </Button>
              </div>
            </div>

            <div>
              <h2 style={{ margin: '0 0 10px', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Map Columns</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: 'var(--th-bg)' }}>
                      <th style={th}>CSV Column</th>
                      <th style={th}>Sample Value</th>
                      <th style={th}>Maps To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h, colIndex) => (
                      <tr key={colIndex} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...td, fontWeight: 600 }}>{h || `Column ${colIndex + 1}`}</td>
                        <td style={{ ...td, color: 'var(--muted)' }}>{dataRows[0]?.[colIndex] || '—'}</td>
                        <td style={td}>
                          <select
                            value={mapping[colIndex] ?? 'skip'}
                            onChange={(e) => setMapping((prev) => ({ ...prev, [colIndex]: e.target.value as ImportTargetField }))}
                            style={{ ...inputStyle, width: '100%' }}
                          >
                            {IMPORT_TARGET_FIELDS.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!readyToPreview && (
                <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="error" size={13} />
                  Map at least one column to Client / Company Name and one to Phone to see the preview.
                </p>
              )}
            </div>
          </section>

          {readyToPreview && (
            <>
              <KpiStrip items={kpis} columns={kpis.length} />

              <Card title="Preview & Validate" bodyStyle={{ padding: 0 }}>
                <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                    <thead>
                      <tr style={{ background: 'var(--th-bg)' }}>
                        <th style={{ ...th, width: 30 }} />
                        <th style={th}>Row</th>
                        <th style={th}>Name</th>
                        <th style={th}>Phone</th>
                        <th style={th}>Type</th>
                        <th style={th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => {
                        const skipped = skippedRows.has(r.rowIndex)
                        return (
                          <tr key={r.rowIndex} style={{ borderBottom: '1px solid var(--border)', opacity: skipped ? 0.5 : 1 }}>
                            <td style={{ ...td, width: 30 }}>
                              <input
                                type="checkbox"
                                checked={!skipped}
                                onChange={() =>
                                  setSkippedRows((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(r.rowIndex)) next.delete(r.rowIndex)
                                    else next.add(r.rowIndex)
                                    return next
                                  })
                                }
                                style={{ accentColor: 'var(--nav-active-accent)' }}
                              />
                            </td>
                            <td className="figure" style={{ ...td, color: 'var(--muted)' }}>
                              {r.rowIndex + 1}
                            </td>
                            <td style={{ ...td, fontWeight: 600 }}>{r.record?.name || dataRows[r.rowIndex]?.[0] || '—'}</td>
                            <td className="figure" style={td}>{r.record?.phone || '—'}</td>
                            <td style={{ ...td, color: 'var(--text2)' }}>{r.record?.clientType ?? '—'}</td>
                            <td style={td}>
                              {r.errors.length > 0 ? (
                                <div>
                                  {r.errors.map((e) => (
                                    <div key={e} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, color: 'var(--danger-text)', fontSize: 'var(--t-th)' }}>
                                      <Icon name="error" size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                                      {e}
                                    </div>
                                  ))}
                                </div>
                              ) : r.duplicateOf ? (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, color: 'var(--progress-text)', fontSize: 'var(--t-th)' }}>
                                  <Icon name="alert_triangle" size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                                  Possible duplicate of {r.duplicateOf.name} ({r.duplicateOf.id})
                                </div>
                              ) : r.warnings.length > 0 ? (
                                <div>
                                  {r.warnings.map((w) => (
                                    <div key={w} style={{ display: 'flex', alignItems: 'flex-start', gap: 5, color: 'var(--muted)', fontSize: 'var(--t-th)' }}>
                                      <Icon name="info" size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                                      {w}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--success-text)', fontSize: 'var(--t-th)', fontWeight: 600 }}>
                                  <Icon name="checklist" size={12} />
                                  Ready
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              <section style={{ ...cardStyle, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  {imported
                    ? 'Imported. Redirecting to Clients…'
                    : `${readyRows.length} row${readyRows.length === 1 ? '' : 's'} will be imported. Rows with errors are skipped automatically; unchecked rows are skipped too.`}
                </p>
                <Button variant="primary" icon="check" onClick={runImport} disabled={importing || imported || readyRows.length === 0}>
                  {imported ? 'Imported' : importing ? 'Importing…' : `Import ${readyRows.length} Client${readyRows.length === 1 ? '' : 's'}`}
                </Button>
              </section>
            </>
          )}
        </>
      )}

      <FooterNote extra={['Imported clients are not persisted yet — no data layer exists (Phase 1)']} />
    </div>
  )
}

const th = {
  textAlign: 'left' as const,
  padding: '9px 12px',
  fontSize: 'var(--t-th)',
  fontWeight: 600,
  color: 'var(--text2)',
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}
const td = { padding: '10px 12px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }
