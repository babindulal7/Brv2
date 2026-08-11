import { SideRail } from '../../../components/ui/Page'
import { useEquipmentContext } from './AddEquipmentContext'

/** §2 — a sticky section nav, not a stepper. Any section, any order. */
export function EquipmentRightRail() {
  const {
    activeSection,
    setActiveSection,
    sectionDefs,
  } = useEquipmentContext()

  return (
    <SideRail width={196} label="Sections">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-xs)' }}>
                <span style={{ fontSize: 'var(--t-th)', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, padding: '0 8px 4px' }}>
                  Sections
                </span>
                {sectionDefs.map((sec, i) => {
                  const on = activeSection === sec.id
                  const dot = sec.blocked ? 'var(--danger-text)' : sec.complete ? 'var(--success-text)' : 'var(--border2)'
                  return (
                    <a
                      key={sec.id}
                      href={`#${sec.id}`}
                      onClick={() => setActiveSection(sec.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--sp-sm)',
                        padding: '7px 9px',
                        borderRadius: 'var(--r-xs)',
                        textDecoration: 'none',
                        fontSize: 'var(--t-meta)',
                        fontWeight: on ? 700 : 500,
                        color: on ? 'var(--text)' : 'var(--text2)',
                        background: on ? 'var(--nav-active-bg)' : 'transparent',
                        border: `1px solid ${on ? 'var(--border)' : 'transparent'}`,
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <span style={{ color: 'var(--muted)', marginRight: 5 }}>{i + 1}</span>
                        {sec.label}
                      </span>
                      <span
                        aria-hidden
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 'var(--r-badge)',
                          flexShrink: 0,
                          background: sec.complete && !sec.blocked ? dot : 'transparent',
                          border: `1.5px solid ${dot}`,
                        }}
                      />
                    </a>
                  )
                })}

                <div style={{ marginTop: 14, padding: 10, borderRadius: 'var(--r-sm)', background: 'var(--card2)', border: '1px solid var(--border)', fontSize: 'var(--t-th)', color: 'var(--text2)', lineHeight: 1.45 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>Any order</div>
                  Every section can be filled in any order — this is a record, not a wizard.
                </div>
              </div>
            </SideRail>
  )
}
