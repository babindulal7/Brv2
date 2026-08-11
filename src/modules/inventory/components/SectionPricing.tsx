import { Field, SectionCard, inputStyle, fieldRow } from './EquipmentShared'
import { useEquipmentContext } from './AddEquipmentContext'
import { formatMoney } from '../../../lib/money'

export function SectionPricing() {
  const {
    dailyRate,
    setDailyRate,
    dailyPaisa,
    weeklyRate,
    setWeeklyRate,
    monthlyRate,
    setMonthlyRate,
    hourlyRate,
    setHourlyRate,
    weekendRate,
    setWeekendRate,
    minRentalDays,
    setMinRentalDays,
    depositKind,
    setDepositKind,
    depositPercent,
    setDepositPercent,
    depositFixed,
    setDepositFixed,
    depositPaisa,
    prepMinutes,
    setPrepMinutes,
    cleaningMinutes,
    setCleaningMinutes,
    rentalEnabled,
    setRentalEnabled,
    inspectionRequired,
    setInspectionRequired,
    packingRequired,
    setPackingRequired,
    errors,
    sectionNumber,
  } = useEquipmentContext()

  return (
    <SectionCard
              id="sec-pricing"
              n={sectionNumber('sec-pricing')}
              title="Pricing & Rental"
              note="Base rates only. Membership, student, bundle and custom discounts and the late fee are owned elsewhere (§10.3)."
            >
              <div style={fieldRow}>
                <Field label="Daily rate (NPR)" error={errors.dailyRate} hint={dailyPaisa ? formatMoney(dailyPaisa) : undefined}>
                  <input
                    value={dailyRate}
                    onChange={(e) => {
                      setDailyRate(e.target.value)
                    }}
                    placeholder="e.g. 4,500"
                    className="figure"
                    style={inputStyle(Boolean(errors.dailyRate))}
                  />
                </Field>
                <Field label="Weekly rate (NPR)">
                  <input value={weeklyRate} onChange={(e) => setWeeklyRate(e.target.value)} className="figure" style={inputStyle()} />
                </Field>
                <Field label="Monthly rate (NPR)">
                  <input value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} className="figure" style={inputStyle()} />
                </Field>
                <Field label="Hourly rate (NPR)">
                  <input value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} className="figure" style={inputStyle()} />
                </Field>
                <Field label="Weekend rate (NPR)">
                  <input value={weekendRate} onChange={(e) => setWeekendRate(e.target.value)} className="figure" style={inputStyle()} />
                </Field>
                <Field label="Minimum rental days">
                  <input
                    type="number"
                    min={1}
                    value={minRentalDays}
                    onChange={(e) => setMinRentalDays(e.target.value)}
                    className="figure"
                    style={inputStyle()}
                  />
                </Field>
              </div>

              {/* §10.2 — a percentage of replacement value, or a fixed amount. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-sm)', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Security deposit</strong>
                <div style={{ display: 'flex', gap: 'var(--sp-sm)', flexWrap: 'wrap' }}>
                  {(['percent', 'fixed'] as const).map((k) => {
                    const on = depositKind === k
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setDepositKind(k)
                        }}
                        aria-pressed={on}
                        style={{
                          height: 32,
                          padding: '0 12px',
                          borderRadius: 'var(--r-btn)',
                          border: `1px solid ${on ? 'var(--nav-active-accent)' : 'var(--border)'}`,
                          background: on ? 'var(--nav-active-bg)' : 'var(--card2)',
                          color: on ? 'var(--nav-active-accent)' : 'var(--text)',
                          fontSize: 'var(--t-meta)',
                          fontWeight: on ? 700 : 500,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        {k === 'percent' ? '% of replacement value' : 'Fixed amount'}
                      </button>
                    )
                  })}
                </div>
                <div style={fieldRow}>
                  {depositKind === 'percent' ? (
                    <Field
                      label="Deposit (%)"
                      error={errors.deposit}
                      hint={depositPaisa ? `${formatMoney(depositPaisa)} of the replacement value` : 'Needs a replacement value above.'}
                    >
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={depositPercent}
                        onChange={(e) => {
                          setDepositPercent(e.target.value)
                        }}
                        placeholder="e.g. 20"
                        className="figure"
                        style={inputStyle(Boolean(errors.deposit))}
                      />
                    </Field>
                  ) : (
                    <Field label="Deposit (NPR)" error={errors.deposit} hint={depositPaisa ? formatMoney(depositPaisa) : undefined}>
                      <input
                        value={depositFixed}
                        onChange={(e) => {
                          setDepositFixed(e.target.value)
                        }}
                        placeholder="e.g. 25,000"
                        className="figure"
                        style={inputStyle(Boolean(errors.deposit))}
                      />
                    </Field>
                  )}
                </div>
              </div>

              {/* §10.4 — rental settings feed Cleaning and Return. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <strong style={{ fontSize: 'var(--t-meta)', color: 'var(--text)' }}>Rental settings</strong>
                <div style={fieldRow}>
                  <Field label="Preparation time (minutes)">
                    <input type="number" min={0} value={prepMinutes} onChange={(e) => setPrepMinutes(e.target.value)} className="figure" style={inputStyle()} />
                  </Field>
                  <Field label="Cleaning time (minutes)">
                    <input type="number" min={0} value={cleaningMinutes} onChange={(e) => setCleaningMinutes(e.target.value)} className="figure" style={inputStyle()} />
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Rental enabled', on: rentalEnabled, set: setRentalEnabled },
                    { label: 'Inspection required on return', on: inspectionRequired, set: setInspectionRequired },
                    { label: 'Packing required', on: packingRequired, set: setPackingRequired },
                  ].map((t) => (
                    <label key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'var(--t-meta)', color: 'var(--text)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={t.on}
                        onChange={(e) => t.set(e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: 'var(--nav-active-accent)' }}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>
            </SectionCard>
  )
}
