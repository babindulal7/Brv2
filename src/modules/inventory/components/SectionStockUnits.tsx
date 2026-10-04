import Icon from '../../../components/ui/Icon'
import { Button } from '../../../components/ui/Page'
import { DataTableShell } from '../../../components/ui/DataTable'
import { Field, SectionCard, inputStyle, fieldRow, ConditionBadge, DraftStatusBadge, BsAbove, th, td, barcodePayload } from './EquipmentShared'
import { useEquipmentContext } from './AddEquipmentContext'
import { TRACKING_MODES, QUANTITY_UNITS, INTAKE_CONDITIONS } from '../../../lib/queries/addEquipment'
import type { IntakeCondition } from '../../../lib/queries/addEquipment'
import { DateField } from '../../../components/ui/DateField'

export function SectionStockUnits() {
  const {
    tracking,
    setTracking,
    units,
    setTouchedSerials,
    quantity,
    setQuantity,
    reorderLevel,
    setReorderLevel,
    quantityUnit,
    setQuantityUnit,
    csvNote,
    csvInput,
    serialised,
    visibleSerialIssue,
    errors,
    sectionNumber,
    addUnit,
    removeUnit,
    patchUnit,
    generateAssetTags,
    importCsv,
  } = useEquipmentContext()

  return (
    <SectionCard
            id="sec-stock"
            n={sectionNumber('sec-stock')}
            title="Stock & Units"
            note="One Tracking field — it replaces Equipment Type, Has Serial Number and Tracking Type (§5.1)."
            action={
              serialised ? (
                <>
                  <Button variant="ghost" onClick={() => csvInput.current?.click()} icon="upload">
                    Import CSV
                  </Button>
                  <Button variant="ghost" onClick={generateAssetTags}>
                    Generate Asset Tags
                  </Button>
                  <Button variant="secondary" icon="plus" onClick={addUnit}>
                    Add Unit
                  </Button>
                </>
              ) : undefined
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
              {TRACKING_MODES.map((t) => {
                const on = tracking === t.mode
                return (
                  <button
                    key={t.mode}
                    type="button"
                    onClick={() => {
                      setTracking(t.mode)
                    }}
                    aria-pressed={on}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--r-sm)',
                      border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                      background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 'var(--t-meta)', fontWeight: 700, color: on ? 'var(--nav-active-accent)' : 'var(--text)' }}>{t.label}</span>
                    <span style={{ fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.4 }}>{t.blurb}</span>
                  </button>
                )
              })}
            </div>

            {errors.stock && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                <Icon name="error" size={12} />
                {errors.stock}
              </span>
            )}

            {serialised ? (
              <>
                <DataTableShell ariaLabel="Stock units table">
                  <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, width: 34 }}>#</th>
                        <th style={th}>
                          Serial <span style={{ color: 'var(--danger-text)' }}>*</span>
                        </th>
                        <th style={{ ...th, width: 128 }}>Asset Tag</th>
                        <th style={{ ...th, width: 128 }}>Barcode</th>
                        <th style={{ ...th, width: 92 }}>QR</th>
                        <th style={{ ...th, width: 132 }}>Status</th>
                        <th style={{ ...th, width: 128 }}>Condition</th>
                        <th style={{ ...th, width: 152 }}>Purchase Date</th>
                        <th style={{ ...th, width: 40 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u, i) => {
                        const issue = visibleSerialIssue(u)
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ ...td, color: 'var(--muted)' }}>{i + 1}</td>
                            <td style={td}>
                              <input
                                value={u.serial}
                                className="identifier"
                                placeholder="Typed or scanned off the body"
                                onChange={(e) => patchUnit(u.id, { serial: e.target.value })}
                                onBlur={() =>
                                  setTouchedSerials((prev) => {
                                    const next = new Set(prev)
                                    next.add(u.id)
                                    return next
                                  })
                                }
                                /* Law 15 — no `height: 31` override here (nor on the two controls
                                   below): `inputStyle`'s `minHeight: 44` IS the touch floor, and a
                                   serial typed off a unit's body is exactly the kind of input that
                                   gets tapped on a warehouse tablet. Density comes from the table's
                                   own padding, not from shrinking its targets. */
                                style={inputStyle(Boolean(issue))}
                              />
                              {issue && (
                                <span style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-xs)', marginTop: 'var(--sp-xs)', fontSize: 'var(--t-th)', color: 'var(--danger-text)' }}>
                                  <Icon name="error" size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                                  {issue}
                                </span>
                              )}
                            </td>
                            <td style={{ ...td }}>
                              <span className="identifier" style={{ color: 'var(--text2)', fontSize: 'var(--t-th)' }}>{u.assetTag}</span>
                            </td>
                            <td style={td}>
                              <span className="identifier" style={{ color: 'var(--text2)', fontSize: 'var(--t-th)' }}>
                                {barcodePayload(u)}
                              </span>
                            </td>
                            <td style={td}>
                              <span
                                title={`QR encodes the same payload as the barcode: ${barcodePayload(u)}`}
                                style={{ color: 'var(--muted)', fontSize: 'var(--t-th)' }}
                              >
                                Same payload
                              </span>
                            </td>
                            <td style={td}>
                              <DraftStatusBadge />
                            </td>
                            <td style={td}>
                              <select
                                aria-label={`Condition for unit ${u.serial || u.id}`}
                                value={u.condition}
                                onChange={(e) => patchUnit(u.id, { condition: e.target.value as IntakeCondition })}
                                style={inputStyle()}
                              >
                                {INTAKE_CONDITIONS.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <div style={{ marginTop: 'var(--sp-xs)' }}>
                                <ConditionBadge condition={u.condition} />
                              </div>
                            </td>
                            <td style={td}>
                              <BsAbove iso={u.purchaseIso} />
                              <DateField
                                ariaLabel="Purchase date for this unit"
                                value={u.purchaseIso}
                                onChange={(v) => patchUnit(u.id, { purchaseIso: v })}
                                showBs={false}
                                clearable
                                style={{ ...inputStyle(), marginTop: 3 }}
                              />
                            </td>
                            <td style={{ ...td, textAlign: 'center' }}>
                              {units.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeUnit(u.id)}
                                  aria-label={`Remove unit ${i + 1}`}
                                  style={{ border: 'none', background: 'transparent', color: 'var(--danger-text)', cursor: 'pointer' }}
                                >
                                  <Icon name="close" size={14} />
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </DataTableShell>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Button variant="secondary" icon="plus" onClick={addUnit}>
                    Add Unit
                  </Button>
                  <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 'var(--t-th)', color: 'var(--muted)', lineHeight: 1.45, flex: 1, minWidth: 240 }}>
                    <Icon name="info" size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                    Serials are the manufacturer’s and are typed or scanned — never generated (§4). Every serial is unique
                    across the whole system; a clash is named on the row. The asset tag is ours and may be generated; the
                    barcode and QR carry the same payload, drawn on the printed label. Status is engine-owned: a Draft’s
                    units carry no status, and creation sets every one to In Stock (§5.3).
                  </span>
                </div>

                <input
                  ref={csvInput}
                  type="file"
                  aria-label="Import serials CSV"
                  accept=".csv,text/csv,text/plain"
                  onChange={(e) => {
                    importCsv(e.target.files?.[0] ?? null)
                    e.target.value = ''
                  }}
                  style={{ display: 'none' }}
                />
                {csvNote && (
                  <span style={{ fontSize: 'var(--t-th)', color: 'var(--text2)' }}>{csvNote}</span>
                )}
              </>
            ) : (
              <div style={fieldRow}>
                <Field label={tracking === 'Consumable' ? 'Total Quantity' : 'Total Quantity'} required error={errors.stock}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                      style={{ minWidth: 44, minHeight: 44, borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer' }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      aria-label="Total Quantity"
                      min={1}
                      value={quantity}
                      onChange={(e) => {
                        setQuantity(Math.max(0, Number(e.target.value)))
                      }}
                      style={{ ...inputStyle(Boolean(errors.stock)), textAlign: 'center' }}
                      className="figure"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + 1)}
                      aria-label="Increase quantity"
                      style={{ minWidth: 44, minHeight: 44, borderRadius: 'var(--r-input)', border: '1px solid var(--border)', background: 'var(--card2)', color: 'var(--text)', cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                </Field>
                <Field label="Reorder Level" error={errors.reorder} hint="Below this, the item is flagged for restock.">
                  <input
                    type="number"
                    min={0}
                    value={reorderLevel}
                    onChange={(e) => {
                      setReorderLevel(Math.max(0, Number(e.target.value)))
                    }}
                    style={inputStyle(Boolean(errors.reorder))}
                    className="figure"
                  />
                </Field>
                <Field label="Unit">
                  <select value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value)} style={inputStyle()}>
                    {QUANTITY_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </Field>
                {tracking === 'Consumable' && (
                  <Field label="Behaviour" span={3}>
                    <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
                      Consumed on return — this stock never comes back (§5.1). No units, no serials.
                    </span>
                  </Field>
                )}
              </div>
            )}
          </SectionCard>
  )
}
