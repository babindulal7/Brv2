import { useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { rupees, toRupees, formatMoney } from '../../../lib/money'
import type { Paisa } from '../../../lib/money'
import { CREW_ROSTER } from '../../../lib/queries/crew'
import { bookCrew } from '../../../actions/crew/bookCrew'
import { useAuth } from '../../../lib/auth'

interface AssignCrewModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (crewMember: { role: string; name: string; dailyRatePaisa: Paisa; days: number; totalPayPaisa: Paisa }) => void
  bookingId: string
}

export function AssignCrewModal({ isOpen, onClose, onSuccess, bookingId }: AssignCrewModalProps) {
  const { user } = useAuth()

  /*
   * ⛔ Was a free-text `name` box beside a role dropdown, and NOTHING was ever
   * dispatched: `handleSubmit` emitted `DomainEvents.emit('crew.assigned', …)`
   * — an in-memory bus whose only subscriber is a console logger — and then
   * called `onSuccess()` unconditionally, which fires BookingDetail's "Crew
   * Assigned — Sita Tamang, 1st AC" toast. No payout was scheduled, nobody was
   * told, and on shoot day the booking had no AC.
   *
   * `actions/crew/bookCrew.ts` is the real action and its input is
   * `{ bookingId?, crewIds: string[], role? }` — crew IDs, because an
   * assignment is about a person on the roster, not a name string somebody
   * typed. A typed name cannot produce one, so the free-text box is replaced
   * by a picker over `CREW_ROSTER` (the same roster `modules/crew` books
   * against). That is also what kills the invented rate below: the day rate
   * now comes off the chosen person's roster record, which is exactly what
   * `CrewMember.dayRatePaisa`'s own comment calls "the default a picker starts
   * from".
   */
  const [crewId, setCrewId] = useState('')
  const selected = CREW_ROSTER.find((m) => m.id === crewId) ?? null

  /*
   * ⛔ Was `useState<number>(5000)` / `useState<number>(3)` — Rs 15,000 of
   * "Total Calculated Crew Pay" rendered before the operator touched
   * anything, matching no roster rate and no booking.
   *
   * The rate is seeded from the picked person's roster record (and stays
   * editable — the spec allows a negotiated rate per assignment). `days` has
   * no source here: this modal is handed only `bookingId`, so it cannot read
   * the booking's own rental days. It opens empty and the operator types it.
   */
  const [dailyRate, setDailyRate] = useState<number>(0)
  const [days, setDays] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalPay = dailyRate * days

  const pickCrew = (id: string) => {
    setCrewId(id)
    const member = CREW_ROSTER.find((m) => m.id === id)
    // No member → no rate. Never a leftover rate belonging to the last pick.
    setDailyRate(member ? toRupees(member.dayRatePaisa) : 0)
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!selected) {
      setError('Choose the crew member from the roster — an assignment is about a person on file, not a typed name.')
      return
    }
    if (!Number.isFinite(dailyRate) || dailyRate <= 0 || !Number.isFinite(days) || days <= 0) {
      setError('Rate and days must be greater than 0.')
      return
    }
    /*
     * No session, no assignment. `createAction` refuses a call with no context
     * by name rather than acting as somebody, but the operator has to read the
     * reason here — inline and persistent, because `useToast()` exposes
     * successes only (Law 12).
     */
    if (!user) {
      setError('You are not signed in, so this assignment cannot be attributed to anyone. Sign in and try again.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      /*
       * The real dispatch, replacing the screen-level `DomainEvents.emit`.
       * `bookCrew` is still a stub (`implemented` unset in
       * `actions/crew/bookCrew.ts`), so `createAction` refuses it before
       * validate/execute/events and the operator reads "BOOK_CREW is not
       * connected to the database yet, so nothing was saved." `onSuccess`
       * below — and therefore the "Crew Assigned" toast — is unreachable on
       * that path, which is the whole point.
       *
       * The emit is NOT repeated here: `createAction` emits `CREW_ASSIGNED`
       * itself after `execute` returns. Events follow the write; a screen-level
       * emit would double-count the moment the action lands.
       *
       * ⚠ `BookCrewInput` carries no rate and no day count, so the payout
       * figures below reach nothing. Harmless while the action refuses;
       * whoever sets `implemented: true` must widen the input first, or this
       * screen will report a booked crew member whose pay was never scheduled.
       * Left un-widened because `src/actions/` is not this pass's file.
       */
      await bookCrew(
        { bookingId, crewIds: [selected.id], role: selected.role },
        { userId: user.id, role: user.role },
      )

      onSuccess({
        role: selected.role,
        name: selected.name,
        dailyRatePaisa: rupees(dailyRate),
        days,
        totalPayPaisa: rupees(totalPay),
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign crew member')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Assign Crew Member — ${bookingId}`}
      subtitle="Add a specialized technician or crew member to this booking."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => handleSubmit()} disabled={isSubmitting}>
            {isSubmitting ? 'Assigning...' : 'Add Crew Member'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
        {error && (
          /*
            ⛔ Was `var(--danger-bg, #fee2e2)` / `var(--danger-text, #991b1b)`.
            Neither token exists — `styles/theme.css` declares `--st-danger-bg`
            and `--st-danger-fg` — so BOTH fell through to the raw hex, which
            is a §5 Conventions violation ("never a hex value in a component")
            AND a real theming bug: the light-theme pink stayed pink in dark
            mode, where the token resolves to `#4b1515`.

            Law 12 — errors are inline and persistent, so this also carries
            `role="alert"` rather than relying on the operator noticing it.
          */
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--sp-sm)',
              padding: '10px 14px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--danger)',
              background: 'var(--st-danger-bg)',
              color: 'var(--st-danger-fg)',
              fontSize: 'var(--t-meta)',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Crew Member <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <select
              value={crewId}
              onChange={(e) => pickCrew(e.target.value)}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            >
              {/* Opens on nothing chosen — a pre-selected first person would be
                  this modal picking the crew, which is the operator's call. */}
              <option value="">Choose from the roster…</option>
              {CREW_ROSTER.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.role} ({m.state})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>Role on file</label>
            {/* Read-only: the role is the roster record's, not a second thing
                to choose. Picking a "1st AC" role for a Gaffer would put a fact
                on the booking that contradicts the person it names. */}
            <div
              style={{
                height: 36,
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card2)',
                color: selected ? 'var(--text)' : 'var(--text2)',
                fontSize: 'var(--t-meta)',
              }}
            >
              {selected ? selected.role : '—'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-md)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Daily Rate (Rs) <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            {/* Seeded from the picked person's roster record; 0 (nobody picked
                yet) renders as an empty box, never a typed-looking "0". */}
            <input
              type="number"
              min={1}
              value={dailyRate === 0 ? '' : dailyRate}
              onChange={(e) => {
                const next = Number(e.target.value)
                setDailyRate(Number.isFinite(next) ? next : 0)
              }}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
              Number of Days <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="number"
              min={1}
              value={days === 0 ? '' : days}
              onChange={(e) => {
                const next = Number(e.target.value)
                setDays(Number.isFinite(next) ? next : 0)
              }}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 'var(--r-btn)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontSize: 'var(--t-meta)',
              }}
            />
          </div>
        </div>

        <div
          style={{
            padding: 'var(--sp-md)',
            borderRadius: 'var(--r-btn)',
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 'var(--t-meta)',
            fontWeight: 700,
          }}
        >
          <span>Total Calculated Crew Pay:</span>
          {/* An em dash while the inputs behind it are incomplete — "Rs 0"
              reads as a figure the form is holding. */}
          <span style={{ color: 'var(--nav-active-accent)' }}>
            {dailyRate > 0 && days > 0 ? formatMoney(rupees(totalPay)) : '—'}
          </span>
        </div>
      </form>
    </Modal>
  )
}
