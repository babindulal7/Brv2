import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Button, cardStyle } from '../../components/ui/Page'
import { ScreenHeader } from './TabHeader'
import { PageBody } from '../../components/ui/PageBody'
import { Unavailable } from '../../components/ui/Unavailable'
import { useViewport } from '../../lib/device'
import { formatMoney, parseMoney, type Paisa } from '../../lib/money'
import { formatAd, toBs, formatBs, getBusinessToday } from '../../lib/bs'
import { useAuth } from '../../lib/auth'
import { canViewMoney } from '../../lib/rbac'
import { readSettings } from '../../lib/settingsStore'
import { fetchDailyClosing, varianceLine, type DailyClosing as ClosingFigures } from '../../lib/queries/closing'
import { dailyDigest } from '../../lib/whatsappTemplates'
import { buildWaLink } from '../../lib/whatsapp'

/**
 * # Daily Closing — the day's position, counted and signed off
 *
 * `WHATSAPP_LINKS_SPEC_v1.0` §3 and §5.4. The screen states the eight figures
 * the digest sends, lets the operator count the drawer against the day's cash
 * takings, and offers the digest once they have.
 *
 * ## What this screen is NOT, and why that is deliberate
 *
 * §5.4 defers to `LOCAL_FIRST_CORE_SPEC` §6 for the closing ritual.
 * **That spec is not in this repo** — `docs/` has no local-first document — so
 * everything it would rule is unruled here: whether a closing is a persisted
 * record, who may approve one, whether a day can be re-opened, what happens to
 * an unexplained variance. None of it is invented below (`CLAUDE.md`).
 *
 * The consequence is stated on the screen rather than hidden: **APPROVE does
 * not persist.** There is no closing table in the schema — checked against the
 * live database, 1 Sep 2026: nothing matching clos/cash/till/reconcil exists.
 * So the button that would write one is rendered as an unavailable control
 * carrying that reason, exactly like the PIN button on Login, and the digest is
 * gated on the COUNT instead — the one act that is real here. A green
 * "Approved" that vanished on reload would be the fabrication this repo's
 * success-fabrication register exists to catch.
 *
 * ## The count is the only input, and it is cash only
 *
 * Bank, card and wallet takings are not in a drawer. Comparing them to a count
 * would produce a variance nobody can act on, so `varianceLine` compares the
 * counted drawer against the day's CASH total alone. Everything else is shown
 * for the position, not for the reconciliation.
 */
export default function DailyClosing() {
  const { user } = useAuth()
  const vp = useViewport()
  const onPhone = vp === 'phone'

  /* Law 6 — the whole screen is money. A money-blind role has no partial view
     of a closing worth rendering, so the guard is the screen, not the field. */
  const maySeeMoney = user ? canViewMoney(user.role) : false

  const today = useMemo(() => getBusinessToday(), [])
  const dayAd = today.toISOString()

  const [figures, setFigures] = useState<ClosingFigures | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchDailyClosing(dayAd)
      .then((f) => {
        if (!cancelled) {
          setFigures(f)
          setLoading(false)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [dayAd])

  useEffect(() => {
    if (!maySeeMoney) {
      setLoading(false)
      return
    }
    return load()
  }, [load, maySeeMoney])

  /* The counted drawer. Kept as the raw string the operator typed so a
     half-entered "1,2" is not silently read as 12 — `parseMoney` decides, and
     `null` means "not counted", which is NOT zero anywhere below. */
  const [countRaw, setCountRaw] = useState('')
  const counted: Paisa | null = countRaw.trim() === '' ? null : parseMoney(countRaw)
  const countInvalid = countRaw.trim() !== '' && counted === null

  const variance = figures ? varianceLine(figures.collected.cash, counted, formatMoney) : 'not counted'

  const bsToday = toBs(today)
  const dateLabel = bsToday ? `${formatAd(today)} · ${formatBs(bsToday)}` : formatAd(today)

  /* The digest link, composed only when there is something honest to send. */
  const digestHref = useMemo(() => {
    if (!figures || counted === null) return null
    const s = readSettings()
    const owner = String(s.ownerWhatsappNumber)
    if (!owner) return null
    return buildWaLink(
      owner,
      dailyDigest(
        {
          businessDateIso: figures.dayAd,
          pickupsCount: figures.pickupsCount,
          returnsCount: figures.returnsCount,
          newCount: figures.newCount,
          cashTotal: figures.collected.cash,
          bankTotal: figures.collected.bank,
          cardTotal: figures.collected.card,
          otherTotal: figures.collected.other,
          receivablesTotal: figures.receivablesTotal,
          depositsHeld: figures.depositsHeld,
          varianceLine: variance,
        },
        { businessName: String(s.organisationName), businessPhone: String(s.businessPhone) },
      ),
    )
  }, [figures, counted, variance])

  const digestReason =
    counted === null
      ? 'Count the drawer first — the digest states a closing variance, and there is nothing to state until then.'
      : !String(readSettings().ownerWhatsappNumber)
        ? 'No owner WhatsApp number is set. The digest carries the day’s takings, so it goes to one number the owner sets — Settings ▸ Organisation ▸ General.'
        : 'The owner number on file is not a number this can dial.'

  if (!maySeeMoney) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        <ScreenHeader embedded={false} icon="card" title="Daily Closing" description={dateLabel} />
        <Card title="Not your screen">
          <p style={{ margin: 0, fontSize: 'var(--t-meta)', color: 'var(--text2)', lineHeight: 1.5 }}>
            A closing is entirely money — takings, receivables, deposits held. Law 6 keeps those off this role
            everywhere, and a closing with the money removed would be a blank page rather than a smaller one.
          </p>
        </Card>
      </div>
    )
  }

  const row = (label: string, value: string, hint?: string) => (
    <div
      key={label}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '9px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
        {label}
        {hint && (
          <span style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--muted)' }}>{hint}</span>
        )}
      </span>
      <span style={{ fontSize: 'var(--t-body)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <ScreenHeader embedded={false} icon="card" title="Daily Closing" description={dateLabel} />

      <PageBody loading={loading} error={error} onRetry={load} empty={false}>
        {figures && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: onPhone ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: 'var(--sp-md)',
              alignItems: 'start',
            }}
          >
            <Card title="The day">
              {row('Out today', String(figures.pickupsCount))}
              {row('Returned today', String(figures.returnsCount))}
              {row('New bookings', String(figures.newCount))}
              <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                {figures.dayBoundaryNote}
              </p>
            </Card>

            <Card title="Collected">
              {row('Cash', formatMoney(figures.collected.cash))}
              {row('Bank', formatMoney(figures.collected.bank))}
              {row('Cards', formatMoney(figures.collected.card))}
              {row(
                'Other',
                formatMoney(figures.collected.other),
                /* The digest has four buckets and no wallet line, so the split
                   it cannot carry is shown here instead of being lost. */
                figures.collected.digitalWallets > 0
                  ? `includes ${formatMoney(figures.collected.digitalWallets)} digital wallets`
                  : undefined,
              )}
              {row('Total taken', formatMoney(figures.collected.total))}
              {figures.collected.unclassified > 0 && (
                <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--warn-text)', lineHeight: 1.45 }}>
                  {formatMoney(figures.collected.unclassified)} of the above has no payment channel recorded, so it is
                  counted in Other rather than assigned to one.
                </p>
              )}
            </Card>

            <Card title="Standing position">
              {row('Outstanding', formatMoney(figures.receivablesTotal), 'every live invoice still owed, not only today')}
              {row('Deposits held', formatMoney(figures.depositsHeld), 'a liability — never revenue (Law 5)')}
            </Card>

            <Card title="Count the drawer">
              <label
                htmlFor="counted-cash"
                style={{ display: 'block', fontSize: 'var(--t-meta)', color: 'var(--text2)', marginBottom: 6 }}
              >
                Counted cash
              </label>
              <input
                id="counted-cash"
                inputMode="decimal"
                value={countRaw}
                onChange={(e) => setCountRaw(e.target.value)}
                placeholder="e.g. 12,500"
                style={{
                  width: '100%',
                  height: 44,
                  padding: '0 12px',
                  borderRadius: 'var(--r-btn)',
                  border: `1px solid ${countInvalid ? 'var(--st-danger-fg)' : 'var(--border)'}`,
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: 'var(--t-body)',
                  fontFamily: 'inherit',
                  fontVariantNumeric: 'tabular-nums',
                }}
              />
              {countInvalid && (
                /* Law 12 — inline and persistent, never a toast. */
                <p role="alert" style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'var(--st-danger-fg)' }}>
                  That is not an amount. Digits, with or without commas.
                </p>
              )}

              <div style={{ marginTop: 12 }}>
                {row('Expected in the drawer', formatMoney(figures.collected.cash), 'cash takings only')}
                {row('Variance', variance)}
              </div>

              <p style={{ margin: '10px 0 0', fontSize: 'var(--t-meta)', color: 'var(--muted)', lineHeight: 1.45 }}>
                The count is compared against cash alone. Bank, card and wallet takings are not in the drawer, so
                including them would produce a variance nobody could act on.
              </p>
            </Card>

            <div style={{ ...cardStyle, gridColumn: onPhone ? 'auto' : '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              {/* §5.4's "Send digest", and the approve that cannot exist yet. */}
              {digestHref ? (
                <a
                  href={digestHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 44,
                    padding: '0 16px',
                    borderRadius: 'var(--r-btn)',
                    background: 'var(--btn-primary-bg)',
                    color: 'var(--btn-primary-fg)',
                    fontWeight: 700,
                    fontSize: 'var(--t-meta)',
                    textDecoration: 'none',
                  }}
                >
                  Send digest on WhatsApp
                </a>
              ) : (
                <Unavailable reason={digestReason}>
                  <Button variant="primary" disabled>
                    Send digest on WhatsApp
                  </Button>
                </Unavailable>
              )}

              <Unavailable reason="Approving a closing would write a record, and there is no closing table in the schema — checked against the live database. LOCAL_FIRST_CORE_SPEC §6, which §5.4 defers to for this ritual, is not in this repo, so who may approve, whether a day can be re-opened and what an unexplained variance costs are all unruled. The count and the digest above are real; a green Approved that vanished on reload would not be.">
                <Button variant="secondary" disabled>
                  Approve closing
                </Button>
              </Unavailable>
            </div>
          </div>
        )}
      </PageBody>
    </div>
  )
}
