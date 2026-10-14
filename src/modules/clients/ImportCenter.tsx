import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/ui/Icon'
import { Select } from '../../components/ui'
import { Card, Button, KpiStrip, FooterNote, cardStyle } from '../../components/ui/Page'
import { ScreenHeader } from '../../components/ui/ScreenHeader'
import { DataTableShell } from '../../components/ui/DataTable'
import type { Kpi } from '../../components/ui/Page'
import { RestrictedState } from '../../components/ui/StateViews'
import { UnsavedLeaveDialog, useUnsavedRecord } from '../../components/ui/RecordWorkspace'
import { useAuth } from '../../lib/auth'
import { useNetwork } from '../../lib/network'
import { useViewport } from '../../lib/device'
import { newClientUuid } from '../../lib/supabase'
import { importClients, type ClientImportEntry, type ClientImportOutcome } from '../../actions/clients/importClients'
import { parseCsv, csvCell } from '../../lib/csv'
import {
  IMPORT_TARGET_FIELDS,
  IMPORT_SAMPLE_HEADERS,
  IMPORT_SAMPLE_ROW,
  guessTargetField,
  buildImportPreview,
  importMappingErrors,
  importClientValues,
  canImportClients,
  type ImportTargetField,
  type ImportRowResult,
} from '../../lib/clientImport'
import { findClientMatches, type ClientRecord } from '../../lib/queries/clients'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { loadClientImportRecovery, saveClientImportRecovery, discardClientImportRecovery, type ClientImportRecoveryDraft } from '../../lib/clientImportRecovery'
import './import-center.css'

/** CSV imports use the shared transactional client save, with one receipt key per row. */

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

export interface ImportCenterProps {
  embedded?: boolean
}

export default function ImportCenter(props: ImportCenterProps = {}) {
  const { user } = useAuth()
  const previousActor = useRef(user?.id)
  useEffect(() => {
    if (previousActor.current && previousActor.current !== user?.id) discardClientImportRecovery(previousActor.current)
    previousActor.current = user?.id
  }, [user?.id])
  if (!user || !canImportClients(user.role)) return <RestrictedState />
  return <ClientImportForm key={user.id} {...props} />
}

function ClientImportForm({ embedded = false }: ImportCenterProps = {}) {
  const viewport = useViewport()
  const { user } = useAuth()
  const online = useNetwork()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileVersion = useRef(0)
  const submitGuard = useRef(false)
  const stopRequested = useRef(false)
  const [batch, setBatch] = useState<ClientImportEntry[] | null>(null)
  const [outcomes, setOutcomes] = useState<ClientImportOutcome[]>([])
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [commitError, setCommitError] = useState('')
  const [duplicateRetry, setDuplicateRetry] = useState(0)
  const locked = busy || batch !== null
  const savedCount = outcomes.filter(row => row.status === 'saved').length
  const unresolved = batch !== null && savedCount < batch.length
  useUnsavedRecord(busy || unresolved)

  const [fileName, setFileName] = useState<string | null>(null)
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [mapping, setMapping] = useState<Record<number, ImportTargetField>>({})
  const [parseError, setParseError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [skippedRows, setSkippedRows] = useState<Set<number>>(new Set())
  const [recovery] = useState(() => user ? loadClientImportRecovery(user.id) : { draft: null, error: null })
  const [resumeDraft, setResumeDraft] = useState(recovery.draft)
  const [recoveryError, setRecoveryError] = useState<string | null>(recovery.error)
  const [discardOpen, setDiscardOpen] = useState(false)
  const resumedBatch = useRef(false)

  const persistDraft = useCallback((nextBatch = batch, nextOutcomes = outcomes) => {
    if (!user || !fileName || rawRows.length === 0) return false
    const draft: ClientImportRecoveryDraft = { fileName, rawRows, hasHeaderRow, mapping, skippedRows: [...skippedRows], batch: nextBatch, outcomes: nextOutcomes }
    const result = saveClientImportRecovery(user.id, draft)
    setRecoveryError(result.error)
    return result.ok
  }, [user, fileName, rawRows, hasHeaderRow, mapping, skippedRows, batch, outcomes])

  useEffect(() => {
    if (!resumeDraft && fileName && rawRows.length > 0) persistDraft()
  }, [fileName, rawRows, resumeDraft, persistDraft])

  function resumeImport() {
    if (!resumeDraft) return
    setFileName(resumeDraft.fileName)
    setRawRows(resumeDraft.rawRows)
    setHasHeaderRow(resumeDraft.hasHeaderRow)
    setMapping(resumeDraft.mapping)
    setSkippedRows(new Set(resumeDraft.skippedRows))
    setBatch(resumeDraft.batch)
    setOutcomes(resumeDraft.outcomes)
    resumedBatch.current = resumeDraft.batch !== null
    setResumeDraft(null)
  }

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
  const mappingErrors = useMemo(() => importMappingErrors(headers, mapping), [headers, mapping])
  const readyToPreview = nameMapped && phoneMapped && mappingErrors.length === 0

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
  }, [dataRows, mapping, readyToPreview, duplicateRetry])

  const results: ImportRowResult[] = useMemo(() => {
    if (!readyToPreview) return []
    return buildImportPreview(dataRows, mapping, dupMatches ?? [], skippedRows)
  }, [dataRows, mapping, readyToPreview, dupMatches, skippedRows])

  const includedRows = results.filter(row => !row.skip)
  const readyRows = includedRows.filter(row => row.errors.length === 0 && !row.duplicateOf && row.record)
  const errorRows = includedRows.filter(row => row.errors.length > 0)
  const duplicateRows = includedRows.filter(row => row.duplicateOf && row.errors.length === 0)
  const commitReady = readyToPreview && dupMatches !== null && !dupChecking && !dupCheckError &&
    errorRows.length === 0 && duplicateRows.length === 0 && readyRows.length > 0 && !parseError
  const ignoredColumns = headers.filter((_, index) => !mapping[index] || mapping[index] === 'skip').length

  async function runImport() {
    if (submitGuard.current || !user || !online || (!batch && !commitReady)) return
    submitGuard.current = true
    stopRequested.current = false
    setStopping(false)
    setBusy(true)
    setCommitError('')
    const prepared = batch ?? readyRows.map(row => ({
      rowIndex: row.rowIndex, clientUuid: newClientUuid(), values: importClientValues(row.record!),
    }))
    const preparedOutcomes: ClientImportOutcome[] = prepared.map(row => outcomes.find(outcome => outcome.rowIndex === row.rowIndex) ?? { rowIndex: row.rowIndex, status: 'pending' })
    if (!persistDraft(prepared, preparedOutcomes)) {
      setBusy(false)
      submitGuard.current = false
      return
    }
    setBatch(prepared)
    setOutcomes(previous => {
      const byIndex = new Map(previous.map(row => [row.rowIndex, row]))
      return prepared.map(row => byIndex.get(row.rowIndex) ?? { rowIndex: row.rowIndex, status: 'pending' })
    })
    const confirmed = new Set(outcomes.filter(row => row.status === 'saved').map(row => row.rowIndex))
    const remaining = resumedBatch.current ? prepared : prepared.filter(row => !confirmed.has(row.rowIndex))
    let latestOutcomes = preparedOutcomes
    function update(next: readonly ClientImportOutcome[]) {
        const byIndex = new Map(latestOutcomes.map(row => [row.rowIndex, row]))
        next.forEach(row => byIndex.set(row.rowIndex, row))
        latestOutcomes = prepared.map(row => byIndex.get(row.rowIndex) ?? { rowIndex: row.rowIndex, status: 'pending' })
        persistDraft(prepared, latestOutcomes)
        setOutcomes(latestOutcomes)
    }
    try {
      const result = await importClients({
        rows: remaining, onProgress: update, shouldStop: () => stopRequested.current,
      }, { userId: user.id, role: user.role, isOnline: online })
      update(result.outcomes)
      resumedBatch.current = false
    } catch (error: unknown) {
      setCommitError(error instanceof Error ? error.message : 'The import could not finish. Your file and mappings are still here.')
    } finally {
      setBusy(false)
      setStopping(false)
      submitGuard.current = false
    }
  }

  function handleFile(file: File) {
    if (busy) return
    const version = ++fileVersion.current
    setFileName(null)
    setRawRows([])
    setBatch(null)
    setOutcomes([])
    setCommitError('')
    setDupMatches(null)
    setParseError(null)
    setMapping({})
    setSkippedRows(new Set())
    file
      .text()
      .then((text) => {
        if (version !== fileVersion.current) return
        const parsed = parseCsv(text.replace(/^\uFEFF/, ''))

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
      .catch(() => { if (version === fileVersion.current) setParseError('Could not read that file — make sure it is a plain-text CSV.') })
  }

  function reset() {
    if (busy) return
    if (user) {
      const result = discardClientImportRecovery(user.id)
      setRecoveryError(result.error)
      if (!result.ok) return
    }
    setResumeDraft(null)
    setDiscardOpen(false)
    resumedBatch.current = false
    fileVersion.current += 1
    setBatch(null)
    setOutcomes([])
    setCommitError('')
    setDupMatches(null)
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
    <div className="client-import" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', paddingBottom: 32 }}>
      <ScreenHeader
        embedded={embedded}
        icon="upload"
        title="Import Clients"
        description="Upload a CSV, review the columns and save the selected clients. Existing clients are never overwritten."
        actions={
          !embedded ? (
            <Button icon="external_link" onClick={() => navigate('/clients')}>
              Back to Clients
            </Button>
          ) : undefined
        }
      />

      {recoveryError && <p role="alert" className="client-import-recovery-error">{recoveryError} Client saves wait until recovery storage is available.</p>}
      {resumeDraft && <section className="client-import-recovery" aria-label="Saved import draft">
        <h2>Resume client import</h2>
        <p><strong>{resumeDraft.fileName}</strong> · {resumeDraft.rawRows.length - (resumeDraft.hasHeaderRow ? 1 : 0)} data rows</p>
        <p>{resumeDraft.outcomes.filter(row => row.status === 'saved').length} confirmed saved. File columns, selected rows and retry keys are preserved on this device.</p>
        <div className="client-import-actions"><Button variant="primary" onClick={resumeImport}>Resume import</Button><Button onClick={() => setDiscardOpen(true)}>Discard local draft</Button></div>
      </section>}
      {rawRows.length === 0 && !resumeDraft && (
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
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() }
            }}
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
            aria-label="Upload CSV file"
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
              padding: '8px 0',
              minHeight: 44,
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
              <div className="client-import-actions">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={hasHeaderRow}
                    onChange={(e) => setHasHeaderRow(e.target.checked)}
                    style={{ accentColor: 'var(--nav-active-accent)' }}
                  />
                  First row is headers
                </label>
                <Button icon="close" onClick={() => setDiscardOpen(true)} disabled={busy}>
                  Choose Different File
                </Button>
              </div>
            </div>

            <div>
              <h2 style={{ margin: '0 0 10px', fontSize: 'var(--t-ui)', fontWeight: 700, color: 'var(--text)' }}>Map Columns</h2>
              <DataTableShell ariaLabel="CSV column mapping" data-table-scroll style={{ overflowX: 'auto' }}>
                <table className="client-import-mapping" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
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
                        <td data-label="CSV column" style={{ ...td, fontWeight: 600 }}>{h || `Column ${colIndex + 1}`}</td>
                        <td data-label="Sample value" style={{ ...td, color: 'var(--muted)' }}>{dataRows[0]?.[colIndex] || '—'}</td>
                        <td data-label="Maps to" style={td}>
                          <Select
                            aria-label={`Map column ${colIndex + 1}: ${h || "unnamed"}`}
                            disabled={locked}
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
              </DataTableShell>
              <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                {headers.length} columns retained. {ignoredColumns} skipped column{ignoredColumns === 1 ? '' : 's'} will not be saved.
                Blank columns remain available to map. Client type defaults to Organisation / Production House when omitted.
                Membership is managed separately after import.
              </p>
              {mappingErrors.map(message => <p key={message} role="alert" style={{ color: 'var(--danger-text)' }}>{message}</p>)}
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
              <KpiStrip items={kpis} columns={viewport === 'phone' ? 1 : viewport === 'tablet' ? 2 : kpis.length} />

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
                  <Button onClick={() => setDuplicateRetry(value => value + 1)} disabled={busy}>Retry duplicate check</Button>
                </p>
              )}

              <Card title="Preview & Validate" bodyStyle={{ padding: 0 }}>
                <DataTableShell ariaLabel="CSV import preview" data-table-scroll style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                  <table className="client-import-preview" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
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
                        const outcome = outcomes.find(row => row.rowIndex === r.rowIndex)
                        return (
                          <tr key={r.rowIndex} style={{ borderBottom: '1px solid var(--border)', opacity: skipped ? 0.5 : 1 }}>
                            <td data-label="Include row" style={{ ...td, width: 30 }}>
                              <input
                                type="checkbox"
                                aria-label={`Include row ${r.rowIndex + 1} (${r.record?.name || "unnamed"})`}
                                disabled={locked}
                                style={{ accentColor: "var(--nav-active-accent)", minWidth: 44, minHeight: 44 }}
                                checked={!skipped}
                                onChange={() =>
                                  setSkippedRows((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(r.rowIndex)) next.delete(r.rowIndex)
                                    else next.add(r.rowIndex)
                                    return next
                                  })
                                }
                              />
                            </td>
                            <td data-label="Row" className="figure" style={{ ...td, color: 'var(--muted)' }}>
                              {r.rowIndex + 1}
                            </td>
                            <td data-label="Name" style={{ ...td, fontWeight: 600 }}>{r.record?.name || dataRows[r.rowIndex]?.[0] || '—'}</td>
                            <td data-label="Phone" className="figure" style={td}>{r.record?.phone || '—'}</td>
                            <td data-label="Type" style={{ ...td, color: 'var(--text2)' }}>{r.record?.clientType ?? '—'}</td>
                            <td data-label="Status" style={td}>
                              {outcome?.status === 'saved' ? (
                                <span style={{ color: 'var(--success-text)' }}><Icon name="check" size={14} /> Saved <Link to={`/clients/${outcome.clientId}`}>{outcome.clientCode}</Link></span>
                              ) : outcome && outcome.status !== 'pending' ? (
                                <span role="alert" style={{ color: 'var(--danger-text)' }}>{outcome.message}</span>
                              ) : outcome?.status === 'pending' ? (
                                <span>Waiting to save</span>
                              ) : skipped ? (
                                <span>Skipped by you</span>
                              ) : r.errors.length > 0 ? (
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
                              ) : !dupCheckDone || dupChecking ? (
                                <span>Checking duplicates…</span>
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
                </DataTableShell>
              </Card>

              <section style={{ ...cardStyle, padding: 'var(--sp-lg)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
                {commitError && <p role="alert" style={{ margin: 0, color: 'var(--danger-text)' }}>{commitError}</p>}
                {!online && <p role="alert" style={{ margin: 0, color: 'var(--danger-text)' }}>Connect to import clients. Your file and mappings are still here.</p>}
                {batch ? (
                  <p role="status" aria-live="polite" style={{ margin: 0 }}>
                    {savedCount} of {batch.length} clients confirmed saved.
                    {busy ? ' Saving selected rows…' : unresolved ? ' Retry to continue with the same saves.' : ' Import complete.'}
                    {' '}{dataRows.length - batch.length} rows skipped by you.
                  </p>
                ) : (
                  <p style={{ margin: 0, color: 'var(--text2)' }}>
                    {readyRows.length} ready; {skippedRows.size} skipped by you. Fix errors or deselect affected rows before importing.
                    Duplicate rows must be skipped. Review every mapping; only mapped columns will be saved.
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-sm)' }}>
                  <Button variant="primary" icon="check" onClick={() => void runImport()}
                    disabled={busy || !online || (batch ? !unresolved && !resumedBatch.current : !commitReady)}>
                    {busy ? 'Importing…' : batch ? resumedBatch.current ? 'Check saved rows & continue' : unresolved ? 'Retry remaining rows' : 'Import complete' : `Import ${readyRows.length} Client${readyRows.length === 1 ? '' : 's'}`}
                  </Button>
                  {busy && <Button disabled={stopping} onClick={() => { stopRequested.current = true; setStopping(true) }}>
                    {stopping ? 'Stopping after this row…' : 'Stop after current row'}
                  </Button>}
                  {savedCount > 0 && !busy && <Button onClick={() => navigate('/clients')}>View Clients</Button>}
                </div>
                <p style={{ margin: 0, color: 'var(--text2)', fontSize: 'var(--t-meta)' }}>
                  This device preserves the file, mappings and retry keys when you leave or refresh. Each row is saved separately; if one fails, later rows wait.
                  A lost confirmation is checked with the same save when you retry.
                </p>
              </section>
            </>
          )}
        </>
      )}

      <FooterNote extra={['Only confirmed saves are counted. Existing clients and memberships are unchanged.']} />
      <UnsavedLeaveDialog />
      <ConfirmDialog isOpen={discardOpen} onClose={() => setDiscardOpen(false)} onConfirm={reset}
        title="Discard local import draft?" confirmLabel="Discard local draft"
        description="This removes the file, mappings and unfinished retry keys from this device. Clients already saved remain in the directory. Keep the draft if any save confirmation is uncertain." />
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
/*
 * `height` on a `<td>` behaves as a MINIMUM, so this is the §7.3 row floor
 * ("rows >= 56px") expressed with the token rather than with padding
 * arithmetic. Horizontal padding is left as it was — the floor is vertical.
 *
 * This is a DATA-INTEGRITY fix, not a density preference, and on this screen
 * the argument is at its sharpest because both tables put a CONTROL in every
 * row: a target-field `Select` in the mapping table, a skip checkbox in the
 * preview table. At 10 + 10 + a --t-meta line those rows stood around 37px,
 * too short to hold the 44px hit area §7.3 owes each of those controls, and a
 * target larger than its row must overhang into the neighbouring row. An
 * absolutely positioned hit area wins the hit test, so the LATER row in the
 * DOM claims any tap in the overlap band — that is the mechanism commit
 * 7d38cdf fixed on the floor workspaces. Here it would mean a tap toggling the
 * skip state of the row BELOW the one the operator aimed at, or re-mapping the
 * wrong CSV column, and both mistakes are silent: the preview still looks
 * right, and the wrong records are the ones that go on to be created. The
 * floor comes first so those controls can reach 44px without overlapping.
 */
const td = { height: 'var(--row-min-h)', padding: '10px 12px', fontSize: 'var(--t-meta)', color: 'var(--text)', verticalAlign: 'top' as const }
