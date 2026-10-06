import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../../components/ui/Icon'
import { Button, Input } from '../../../components/ui'
import { DataTableShell } from '../../../components/ui/DataTable'
import { EmptyState } from '../../../components/ui/StateViews'
import { Field, Section, TouchInset, inputStyle } from './BookingFormWidgets'
import { formatMoney, rupees, type Paisa } from '../../../lib/money'
import { CREW_ROSTER, type CrewMember, type CrewRole } from '../../../lib/queries/crew'
import { CrewSearch } from './CrewSearch'

export interface CrewLine {
  crewId: string
  bookingCrewLineId?: string | undefined
  crewMemberId?: string | undefined
  days?: number | undefined
  name: string
  role: CrewRole
  phone: string
  dayRatePaisa: Paisa
  overtimePaisa: Paisa
  accommodationPaisa: Paisa
  mealsPaisa: Paisa
}

const th = {
  textAlign: 'left' as const,
  padding: '7px 9px',
  fontSize: 'var(--t-th)',
  fontWeight: 700,
  color: 'var(--text2)',
  letterSpacing: '0.03em',
  textTransform: 'uppercase' as const,
  whiteSpace: 'nowrap' as const,
  borderBottom: '1px solid var(--border)',
}

const td = {
  height: 'var(--row-min-h)',
  padding: '7px 9px',
  fontSize: 'var(--t-meta)',
  color: 'var(--text)',
  whiteSpace: 'nowrap' as const,
}

export interface CrewSectionProps {
  open: boolean
  onToggle: () => void
  crew: CrewLine[]
  days: number
  canCrewMoney: boolean
  liveCrew?: readonly CrewMember[] | null | undefined
  onAddCrew: (crewId: string) => void
  onRemoveCrew: (crewId: string) => void
  onClearCrew: () => void
  onUpdateCrewExtras: (
    crewId: string,
    field: 'overtimePaisa' | 'accommodationPaisa' | 'mealsPaisa',
    paisa: Paisa,
  ) => void
  crewChargesPaisa: Paisa
  isPhone: boolean
  title?: string
}

export function CrewSection({
  open,
  onToggle,
  crew,
  days,
  canCrewMoney,
  liveCrew,
  onAddCrew,
  onRemoveCrew,
  onClearCrew,
  onUpdateCrewExtras,
  crewChargesPaisa,
  isPhone,
  title = 'Crew',
}: CrewSectionProps) {
  const [expandedCrew, setExpandedCrew] = useState<Set<string>>(new Set())

  const toggleCrewExpanded = (crewId: string) => {
    setExpandedCrew((prev) => {
      const next = new Set(prev)
      if (next.has(crewId)) {
        next.delete(crewId)
      } else {
        next.add(crewId)
      }
      return next
    })
  }

  return (
    <Section
      id="section-3"
      title={title}
      badge={
        crew.length > 0 ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 'var(--r-badge)',
              background: 'var(--st-primary-bg)',
              color: 'var(--st-primary-fg)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {crew.length} {crew.length === 1 ? 'member' : 'members'}
          </span>
        ) : null
      }
      open={open}
      onToggle={onToggle}
      summary={crew.length === 0 ? 'Optional / None' : `${crew.length} crew`}
    >
      <div>
        {(!liveCrew || liveCrew.length === 0) && (
          <p style={{ margin: '0 0 var(--sp-sm)', fontSize: 'var(--t-meta)', color: 'var(--warn-text)', lineHeight: 1.5 }}>
            This is a <strong>sample roster</strong> — the people and the day rates they are priced at are invented in
            the app, not read from the database. Adding someone puts their name, role and rate on this booking when it
            is confirmed; it does not link a staff record, and it reserves nobody, because booking a crew member's own
            calendar is not built yet.
          </p>
        )}
        <CrewSearch
          onBooking={crew}
          onAdd={onAddCrew}
          showRates={canCrewMoney}
          roster={liveCrew && liveCrew.length > 0 ? liveCrew : CREW_ROSTER}
        />
        <div style={{ minWidth: 0 }}>
          <DataTableShell ariaLabel="Assigned crew">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr style={{ background: 'var(--th-bg)' }}>
                  {(canCrewMoney
                    ? ['Name', 'Role', 'Day Rate', 'Days', 'Amount', '', '']
                    : ['Name', 'Role', '']
                  ).map((h, i) => (
                    <th
                      key={h === '' ? `blank-${i}` : h}
                      scope="col"
                      style={{ ...th, textAlign: i >= 2 && i <= 4 ? 'right' : 'left' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crew.map((c) => {
                  const expanded = expandedCrew.has(c.crewId)
                  const hasExtras = c.overtimePaisa > 0 || c.mealsPaisa > 0 || c.accommodationPaisa > 0
                  return (
                    <Fragment key={c.crewId}>
                      <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)' }}>
                        <td style={{ ...td, fontWeight: 600 }}>
                          <Link
                            to={`/crew`}
                            style={{ color: 'inherit', textDecoration: 'none' }}
                            title={`Open ${c.name} in Crew Assist`}
                          >
                            {c.name}
                          </Link>
                        </td>
                        <td style={{ ...td, color: 'var(--text2)' }}>{c.role}</td>
                        {canCrewMoney && (
                          <>
                            <td className="figure" style={{ ...td, textAlign: 'right', color: 'var(--text2)' }}>
                              {formatMoney(c.dayRatePaisa)}
                            </td>
                            <td className="figure" style={{ ...td, textAlign: 'right' }}>
                              {c.days ?? days}
                            </td>
                            <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                              {formatMoney(
                                (c.dayRatePaisa * (c.days ?? days) +
                                  c.overtimePaisa +
                                  c.accommodationPaisa +
                                  c.mealsPaisa) as Paisa,
                              )}
                            </td>
                            <td style={{ ...td, width: 30, textAlign: 'right' }}>
                              <button
                                type="button"
                                className="press"
                                aria-label={`${expanded ? 'Hide' : 'Show'} overtime, meals and accommodation for ${c.name}`}
                                aria-expanded={expanded}
                                onClick={() => toggleCrewExpanded(c.crewId)}
                                style={{
                                  position: 'relative',
                                  width: 22,
                                  height: 22,
                                  display: 'grid',
                                  placeItems: 'center',
                                  borderRadius: 'var(--r-xs)',
                                  border: 'none',
                                  background: hasExtras ? 'var(--st-primary-bg)' : 'transparent',
                                  color: hasExtras ? 'var(--st-primary-fg)' : expanded ? 'var(--text)' : 'var(--muted)',
                                  cursor: 'pointer',
                                }}
                              >
                                <TouchInset />
                                <Icon name={expanded ? 'chevron_up' : 'chevron_down'} size={13} />
                              </button>
                            </td>
                          </>
                        )}
                        <td style={{ ...td, width: 30, textAlign: 'right' }}>
                          <button
                            type="button"
                            className="press"
                            aria-label={`Remove ${c.name} from this booking`}
                            title={`Remove ${c.name}`}
                            onClick={() => onRemoveCrew(c.crewId)}
                            style={{
                              position: 'relative',
                              width: 22,
                              height: 22,
                              display: 'grid',
                              placeItems: 'center',
                              borderRadius: 'var(--r-xs)',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--muted)',
                              cursor: 'pointer',
                            }}
                          >
                            <TouchInset />
                            <Icon name="close" size={13} />
                          </button>
                        </td>
                      </tr>
                      {canCrewMoney && expanded && (
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={7} style={{ ...td, background: 'var(--card2)', padding: '10px 12px' }}>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, minmax(0, 180px))',
                                gap: 12,
                                alignItems: 'center',
                              }}
                            >
                              <Field label="Overtime (Rs) *">
                                <Input
                                  type="number"
                                  min={0}
                                  value={c.overtimePaisa > 0 ? c.overtimePaisa / 100 : ''}
                                  placeholder="0"
                                  onChange={(e) =>
                                    onUpdateCrewExtras(
                                      c.crewId,
                                      'overtimePaisa',
                                      rupees(Math.max(0, Number(e.target.value) || 0)),
                                    )
                                  }
                                  style={{ ...inputStyle, minHeight: 44, fontSize: 'var(--t-meta)' }}
                                />
                              </Field>
                              <Field label="Meals (Rs) *">
                                <Input
                                  type="number"
                                  min={0}
                                  value={c.mealsPaisa > 0 ? c.mealsPaisa / 100 : ''}
                                  placeholder="0"
                                  onChange={(e) =>
                                    onUpdateCrewExtras(
                                      c.crewId,
                                      'mealsPaisa',
                                      rupees(Math.max(0, Number(e.target.value) || 0)),
                                    )
                                  }
                                  style={{ ...inputStyle, minHeight: 44, fontSize: 'var(--t-meta)' }}
                                />
                              </Field>
                              <Field label="Accommodation (Rs) *">
                                <Input
                                  type="number"
                                  min={0}
                                  value={c.accommodationPaisa > 0 ? c.accommodationPaisa / 100 : ''}
                                  placeholder="0"
                                  onChange={(e) =>
                                    onUpdateCrewExtras(
                                      c.crewId,
                                      'accommodationPaisa',
                                      rupees(Math.max(0, Number(e.target.value) || 0)),
                                    )
                                  }
                                  style={{ ...inputStyle, minHeight: 44, fontSize: 'var(--t-meta)' }}
                                />
                              </Field>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {canCrewMoney && (
                  <tr>
                    <td colSpan={4} style={{ ...td, fontWeight: 700, color: 'var(--text2)' }}>
                      Crew Subtotal
                    </td>
                    <td className="figure" style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                      {formatMoney(crewChargesPaisa)}
                    </td>
                    <td style={td} />
                    <td style={td} />
                  </tr>
                )}
              </tbody>
            </table>
          </DataTableShell>
          {crew.length === 0 && (
            <div style={{ marginTop: 10 }}>
              <EmptyState title="No crew assigned" description="Add a crew member to staff this booking." />
            </div>
          )}
          {crew.length > 0 && (
            <div style={{ marginTop: 9 }}>
              <Button onClick={onClearCrew}>Clear crew</Button>
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}
