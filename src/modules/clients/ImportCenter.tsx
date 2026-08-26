import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Select } from '../../components/ui'
import { Card, PageHeader, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import type { Kpi } from '../../components/ui/Page'
import { Unavailable } from '../../components/ui/Unavailable'
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
import { findClientMatches } from '../../lib/queries/clients'
import type { ClientRecord } from '../../data/clients'

/**
 * Import Center — the last confirmed Clients gap from this session's audit
 * reconciliation (`PLAN.md §6.4`). Upload → map columns → preview & validate
 * → **stop**. Parsing, mapping-guesses and per-row validation are all real
 * (`lib/csv.ts`, `lib/clientImport.ts`), and duplicate matching runs against
 * the DATABASE: the file's phones and emails go to `client_directory_v` as a
 * server-side filter (`findClientMatches`, Law 2) and `buildImportRow` then
 * does the exact match over the candidates that came back. The 26-row
 * `CLIENTS_DATA` seed this screen used to match against is gone from it —
 * a CSV row duplicating a *real* client is now flagged, and the flag can only
 * ever name a client that exists (docs/pages/42 §7.3). The commit step
 * is not connected, and no longer pretends to be.
 *
 * ⛔ **What was removed and why** (`SUCCESS_FABRICATION_REGISTER_2026-08-12.md`,
 * section D — this screen was the worst entry in it). `runImport` called **no
 * action at all**. It was a bare `window.setTimeout(…, 700)` that flipped
 * `setImported(true)`, fired `showSuccessToast('Import complete', …)` quoting
 * the *real* parsed counts, and then navigated to `/clients`.
 *
 * That is credible precisely because the numbers are the operator's own file:
 * they map 340 rows, review the preview, press Import, read "312 clients
 * imported · 19 skipped for errors · 9 flagged as possible duplicates", land on
 * the client list — and archive or delete the source CSV. Zero clients were
 * created. The CSV was the only copy of those 312 records.
 *
 * There is no import action to wire this to: `src/actions/clients/` holds
 * `createClient`, `updateClient`, `blockClient` and `mergeClients`, and nothing
 * that creates clients from a file. Inventing one is a build, not a fix. So the
 * screen states the gap instead — a visible, disabled affordance with its reason
 * attached (`components/ui/Unavailable.tsx`, the codebase's existing
 * "grey it out, but say why" control) plus a persistent line in the commit bar,
 * because a `title`-only reason is invisible on the touch devices this app runs
 * on. No toast, no `setImported`, and deliberately **no `navigate('/clients')`**:
 * landing on the client list is this app's universal "the write landed" signal.
 */

/**
 * Short form, for the disabled button's tooltip/long-press popover — that
 * popover is capped at 220px wide, so the full explanation lives in the commit
 * bar's persistent line instead of here.
 */
const IMPORT_UNAVAILABLE_REASON =
  'Import is not connected in this build — no client-import action exists, so nothing can be created.'

/* Law 15 — hit area, not paint; the number comes from `--tap`. The one
   consumer is the Maps To select in the mapping preview, one per column and
   the only thing the operator touches on this screen. Its row simply grows. */
const inputStyle: CSSProperties = {
  minHeight: 'var(--tap)',
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [mapping, setMapping] = useState<Record<number, ImportTargetField>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set())

  /**
   * The duplicate corpus: directory clients whose phone or email matches
   * something in this file, fetched server-side. `null` means "no completed
   * check for the current file+mapping" — distinct from `[]`, which is a
   * completed check that found nothing. That distinction is what keeps the
   * Possible Duplicates KPI honest: it reads '—' until a check has finished.
   */
  const [dupMatches, setDupMatches] = useState<ClientRecord[] | null>(null)
  const [dupChecking, setDupChecking] = useState(false)
  /** Law 12 — a check that could not run is stated inline, never skipped silently. */
  const [dupCheckError, setDupCheckError] = useState<string | null>(null)

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

  /**
   * Fetch the duplicate corpus for the current file + mapping: every value in
   * the columns mapped to Phone or Email, sent to `client_directory_v` as one
   * chunked server-side filter. Re-runs when the file, the header toggle or
   * the mapping changes; a stale in-flight response is cancelled so it cannot
   * overwrite a newer one.
   */
  useEffect(() => {
    if (!readyToPreview || dataRows.length === 0) {
      setDupMatches(null)
      setDupChecking(false)
      setDupCheckError(null)
      return
    }
    const phones: string[] = []
    const emails: string[] = []
    dataRows.forEach((row) => {
      row.forEach((value, colIndex) => {
        const target = mapping[colIndex]
        if (target === 'phone') phones.push(value)
        else if (target === 'email') emails.push(value)
      })
    })

    let cancelled = false
    setDupChecking(true)
    setDupCheckError(null)
    findClientMatches({ phones, emails })
      .then((rows) => {
        if (cancelled) return
        setDupMatches(rows)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // An unreachable directory must not read as "no duplicates found".
        setDupMatches(null)
        setDupCheckError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setDupChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [dataRows, mapping, readyToPreview])

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
      // The duplicate corpus is the DIRECTORY MATCHES fetched above, not a
      // seed array. While the check is in flight (or failed) it is empty and
      // the page says so beside the preview — a row is never silently marked
      // "Ready" as if the directory had been consulted when it had not.
      return buildImportRow(raw, i, dupMatches ?? [])
    })
  }, [dataRows, mapping, readyToPreview, dupMatches])

  const readyRows = results.filter((r) => r.errors.length === 0 && !skippedRows.has(r.rowIndex))
  const errorRows = results.filter((r) => r.errors.length > 0)
  const duplicateRows = results.filter((r) => r.duplicateOf && r.errors.length === 0)

  function handleFile(file: File) {
    setParseError(null)
    setMapping({})
    setSkippedRows(new Set())
    file
      .text()
      .then((text) => {
        const parsed = parseCsv(text)

        /*
         * ⛔ A file the parser could not read must not reach the mapping step.
         *
         * `parseCsv` returned a bare `string[][]` until 16 Aug 2026 (`R3-6`),
         * so an unterminated quote — or a stray inch mark like `6" Pipe` —
         * produced rows indistinguishable from good ones. They mapped cleanly,
         * validated with `errors.length === 0`, and this screen showed a green
         * "Ready" badge over a file whose rows had silently collapsed into each
         * other. Refusing here is the point: the operator sees WHY, and fixes
         * the file, instead of importing a blob under a client's name.
         */
        if (!parsed.ok) {
          setParseError(parsed.errors.join(' '))
          return
        }
        if (parsed.rows.length === 0) {
          setParseError('That file has no rows.')
          return
        }
        setFileName(file.name)
        setRawRows(parsed.rows)
        const first = parsed.rows[0]!
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
  }

  // '—' until a directory check has actually completed for this file+mapping:
  // a zero here must mean "checked, none found", never "not checked yet".
  const dupCheckDone = dupMatches !== null

  const kpis: Kpi[] = readyToPreview
    ? [
        { label: 'Ready to Import', value: String(readyRows.length), icon: 'checklist', accent: 'success' },
        { label: 'Errors', value: String(errorRows.length), icon: 'alert_triangle', accent: errorRows.length ? 'danger' : 'neutral' },
        { label: 'Possible Duplicates', value: dupCheckDone ? String(duplicateRows.length) : '—', icon: 'users', accent: dupCheckDone && duplicateRows.length ? 'progress' : 'neutral' },
        { label: 'Total Rows', value: String(dataRows.length), icon: 'file', accent: 'primary' },
      ]
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', paddingBottom: 32 }}>
      <PageHeader
        icon="upload"
        title="Import Clients"
        description="Upload a CSV, map its columns and validate every row. Committing the import is not connected yet — nothing here creates a client."
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
          <section style={{ ...cardStyle, padding: 'var(--sp-lg)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-sm)' }}>
                <Icon name="file" size={16} style={{ color: 'var(--text2)' }} />
                <strong style={{ color: 'var(--text)', fontSize: 'var(--t-meta)' }}>{fileName}</strong>
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>· {dataRows.length} data row{dataRows.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--sp-sm)', alignItems: 'center' }}>
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
                          <Select
                            value={mapping[colIndex] ?? 'skip'}
                            onChange={(e) => setMapping((prev) => ({ ...prev, [colIndex]: e.target.value as ImportTargetField }))}
                            style={{ ...inputStyle, width: '100%' }}
                          >
                            {IMPORT_TARGET_FIELDS.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                          </Select>
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

              {/* The state of the directory check, stated beside the preview it
                  qualifies. In-flight is a fact, not an error; a failed check is
                  Law 12 — inline, persistent, never a toast. */}
              {dupChecking && (
                <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <Icon name="timer" size={14} style={{ flexShrink: 0 }} />
                  Checking this file&rsquo;s phones and emails against the client directory…
                </p>
              )}
              {dupCheckError && (
                <p
                  role="alert"
                  style={{
                    margin: 0,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 7,
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    color: 'var(--danger-text)',
                    lineHeight: 1.45,
                  }}
                >
                  <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Duplicate check could not run — {dupCheckError}. The rows below were validated, but{' '}
                    <strong>not checked against the client directory</strong>, so a row marked Ready may still duplicate
                    an existing client.
                  </span>
                </p>
              )}

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
                                  Possible duplicate of{' '}
                                  <Link to={`/clients/${r.duplicateOf.id}`} style={{ color: 'var(--link)' }}>
                                    {r.duplicateOf.name} ({r.duplicateOf.id})
                                  </Link>
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

              {/* The commit bar. It used to say how many rows "will be imported"
                  beside a button that imported none of them; it now states the
                  gap and keeps stating it. Law 12 — errors are inline and
                  persistent, never a toast (`useToast()` exposes only
                  `showSuccessToast`, and there is nothing successful here). */}
              <section style={{ ...cardStyle, padding: 'var(--sp-lg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--sp-md)' }}>
                <p
                  style={{
                    margin: 0,
                    maxWidth: 620,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 7,
                    fontSize: 'var(--t-meta)',
                    fontWeight: 600,
                    color: 'var(--danger-text)',
                    lineHeight: 1.45,
                  }}
                >
                  <Icon name="error" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Import is not connected, so this file cannot be committed. {readyRows.length} row
                    {readyRows.length === 1 ? '' : 's'} passed validation, but no client-import action exists in this
                    build (nothing under <code>src/actions/clients/</code> creates clients from a file), so pressing
                    Import could not create anyone. <strong>Nothing has been written and no client has been created.</strong>{' '}
                    Keep this CSV — it is still the only copy of these rows.
                  </span>
                </p>
                <Unavailable reason={IMPORT_UNAVAILABLE_REASON}>
                  <Button variant="primary" icon="check" disabled>
                    Import {readyRows.length} Client{readyRows.length === 1 ? '' : 's'}
                  </Button>
                </Unavailable>
              </section>
            </>
          )}
        </>
      )}

      <FooterNote extra={['Import is validation-only — no client-import action exists yet, so no client can be created from this screen']} />
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
