import Icon from '../../../components/ui/Icon'
import { Button } from '../../../components/ui/Page'
import { Field, SectionCard, inputStyle, fieldRow, formatBytes } from './EquipmentShared'
import { useEquipmentContext } from './AddEquipmentContext'
import { useCanViewMoney } from '../../../lib/moneyVisibility'

export function SectionMaintenance() {
  /* §11 — documents are money-adjacent (invoice, warranty, insurance), so the
     money gate stands in until lib/rbac grows a document capability. */
  const money = useCanViewMoney()
  const {
    inspectionIntervalDays,
    setInspectionIntervalDays,
    maintenanceCycleRentals,
    setMaintenanceCycleRentals,
    serviceVendor,
    setServiceVendor,
    documents,
    setDocuments,
    docError,
    docInput,
    addDocuments,
    internalNotes,
    setInternalNotes,
    warehouseNotes,
    setWarehouseNotes,
    sectionNumber,
  } = useEquipmentContext()

  return (
    <SectionCard
            id="sec-maintenance"
            n={sectionNumber('sec-maintenance')}
            title="Maintenance & Documents"
            note="Due dates feed the Maintenance queue. Internal notes never print."
          >
            <div style={fieldRow}>
              <Field label="Inspection interval (days)">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={inspectionIntervalDays}
                  onChange={(e) => setInspectionIntervalDays(e.target.value)}
                  placeholder="e.g. 30"
                  className="figure"
                  style={inputStyle()}
                />
              </Field>
              <Field label="Maintenance cycle (rentals)">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={maintenanceCycleRentals}
                  onChange={(e) => setMaintenanceCycleRentals(e.target.value)}
                  placeholder="e.g. 20"
                  className="figure"
                  style={inputStyle()}
                />
              </Field>
              <Field label="Service vendor">
                <input value={serviceVendor} onChange={(e) => setServiceVendor(e.target.value)} placeholder="Who services this" style={inputStyle()} />
              </Field>
            </div>

            <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45 }}>
              <Icon name="info" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
              Running hours and expected life are not offered: no meter reading exists for a record being created, and
              seeding one would be inventing a figure nobody supplied.
            </span>

            {/* §11 — documents are restricted. `lib/rbac` has no document capability
                yet, so the money-visible set stands in; see the report for the gap. */}
            {money ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', paddingTop: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Documents — invoice, warranty, insurance, manual, certificates</strong>
                  <Button variant="secondary" icon="upload" onClick={() => docInput.current?.click()}>
                    Attach
                  </Button>
                </div>
                <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>PDF, JPG or PNG · 50 MB each.</span>
                <input
                  ref={docInput}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => {
                    addDocuments(e.target.files)
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
                {docError && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                    <Icon name="error" size={12} />
                    {docError}
                  </span>
                )}
                {documents.map((d) => (
                  <div
                    key={d.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7, background: 'var(--card2)', border: '1px solid var(--border)' }}
                  >
                    <Icon name="file" size={15} style={{ color: 'var(--text2)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--t-meta)' }}>
                      {d.file.name}
                    </span>
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)' }}>{formatBytes(d.file.size)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(d.url)
                        setDocuments((prev) => prev.filter((x) => x.id !== d.id))
                      }}
                      aria-label={`Remove ${d.file.name}`}
                      style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ paddingTop: 'var(--sp-md)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-sm)' }}>
                <Icon name="info" size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.45 }}>
                  Documents — invoice, warranty and insurance — are not part of this role’s form. Attach them from an
                  Owner, Admin or Accounts session.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)', paddingTop: 'var(--sp-md)', borderTop: '1px solid var(--border)' }}>
              <Field label="Warehouse notes" hint="Printed on packing lists.">
                <textarea
                  value={warehouseNotes}
                  onChange={(e) => setWarehouseNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Check the sensor glass under the inspection light before packing."
                  style={{ ...inputStyle(), height: 'auto', padding: 10, resize: 'vertical' }}
                />
              </Field>
              <Field label="Internal notes" hint="Never printed, never shown to a client.">
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  placeholder="Anything the floor should know that a client should not read."
                  style={{ ...inputStyle(), height: 'auto', padding: 10, resize: 'vertical' }}
                />
              </Field>
            </div>
          </SectionCard>
  )
}
