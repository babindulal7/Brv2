import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Page'
import { Input } from '../../../components/ui/Input'
import { listAssignableCrew, type AssignableCrew } from '../../../lib/queries/bookingCrew'
import { bookCrew } from '../../../actions/crew/bookCrew'
import { useAuth } from '../../../lib/auth'
import { newClientUuid } from '../../../lib/supabase'
import { formatGateError } from '../../../lib/gates'
import { canAssignPricedCrew, crewTimeInput, crewTimeIso } from '../../../lib/crewAssignment'

interface AssignCrewModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (crewMember: { role: string; name: string }) => void
  bookingId: string
  bookingNo?: string
  pickupAt: string
  returnAt: string
  defaultDays: number | null
}

export function AssignCrewModal({ isOpen, onClose, onSuccess, bookingId, bookingNo, pickupAt, returnAt, defaultDays }: AssignCrewModalProps) {
  const { user } = useAuth()
  const allowed = !!user && canAssignPricedCrew(user.role)
  const [roster, setRoster] = useState<AssignableCrew[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [crewId, setCrewId] = useState('')
  const [role, setRole] = useState('')
  const [rate, setRate] = useState('')
  const [days, setDays] = useState('')
  const [call, setCall] = useState('')
  const [wrap, setWrap] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitting = useRef(false)
  const request = useRef<{ signature: string; uuid: string } | null>(null)
  const selected = roster.find((m) => m.id === crewId)

  useEffect(() => {
    if (!isOpen) return
    setCrewId(''); setRole(''); setRate(''); setDays(defaultDays === null ? '' : String(defaultDays))
    setCall(crewTimeInput(pickupAt)); setWrap(crewTimeInput(returnAt)); setNotes(''); setError(null)
    request.current = null
  }, [isOpen, bookingId, pickupAt, returnAt, defaultDays])

  useEffect(() => {
    if (!isOpen || !allowed) return
    let cancelled = false
    setLoading(true); setLoadError(null); setRoster([])
    listAssignableCrew().then((rows) => {
      if (!cancelled) { setRoster(rows); setLoading(false) }
    }).catch((err: unknown) => {
      if (!cancelled) { setLoadError(formatGateError(err)); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [isOpen, allowed, version, user?.id])

  async function submit() {
    if (submitting.current || !allowed || !user) return
    setError(null)
    try {
      if (!selected || loading || loadError) throw new Error('Choose a crew member from the loaded roster.')
      if (!role.trim()) throw new Error('Enter the role for this booking.')
      if (!rate.trim() || !Number.isFinite(Number(rate)) || Number(rate) < 0) throw new Error('Enter a daily rate of 0 or more.')
      if (!Number.isInteger(Number(days)) || Number(days) < 1) throw new Error('Enter a whole number of days, at least 1.')
      const callTime = crewTimeIso(call), wrapTime = crewTimeIso(wrap)
      if (wrapTime <= callTime) throw new Error('Wrap time must be after call time.')
      const input = { bookingId, crewIds: [selected.id], role: role.trim(), dailyRate: Number(rate), days: Number(days), callTime, wrapTime, notes: notes.trim() }
      const signature = JSON.stringify(input)
      if (request.current?.signature !== signature) request.current = { signature, uuid: newClientUuid() }
      submitting.current = true; setSaving(true)
      const result = await bookCrew({ ...input, clientUuid: request.current.uuid }, { userId: user.id, role: user.role })
      if (!result.success || result.count !== 1) throw new Error('The crew assignment was not confirmed. Try again.')
      onSuccess({ name: selected.name, role: input.role })
      onClose()
    } catch (err: unknown) {
      setError(formatGateError(err))
    } finally {
      submitting.current = false; setSaving(false)
    }
  }

  const close = () => { if (!submitting.current) onClose() }
  return <Modal isOpen={isOpen} onClose={close} title={`Assign crew — ${bookingNo ?? bookingId}`} subtitle="Call and wrap times use Nepal time (AD)." size="md"
    footer={<><Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
      {allowed && <Button variant="primary" onClick={() => void submit()} disabled={saving || loading || !!loadError || !roster.length}>{saving ? 'Assigning…' : 'Assign crew'}</Button>}</>}>
    {!allowed ? <p>This priced assignment requires an Owner, Admin, or Manager.</p> :
      <form onSubmit={(event) => { event.preventDefault(); void submit() }} style={{ display: 'grid', gap: 'var(--sp-md)' }}>
        {error && <p role="alert" style={{ color: 'var(--st-danger-fg)' }}>{error}</p>}
        {loading ? <p role="status">Loading crew roster…</p> : loadError ? <div role="alert"><p>{loadError}</p><Button onClick={() => setVersion((v) => v + 1)}>Retry roster</Button></div> : !roster.length ? <p>No active crew profiles are available. Add an active crew profile before assigning a member.</p> : <>
          <label htmlFor="booking-crew-member">Crew member</label>
          <select id="booking-crew-member" value={crewId} disabled={saving} onChange={(event) => {
            const member = roster.find((m) => m.id === event.target.value)
            setCrewId(event.target.value); setRole(member?.role ?? ''); setRate(member?.dailyRate == null ? '' : String(member.dailyRate))
          }} style={{ minHeight: 44, width: '100%', padding: '0 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-btn)', background: 'var(--card)', color: 'var(--text)' }}>
            <option value="">Choose a crew member…</option>
            {roster.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
          </select>
          <Input label="Role on this booking" value={role} disabled={saving} onChange={(e) => setRole(e.target.value)} required style={{ minHeight: 44 }} />
          <Input label="Call time (Nepal)" type="datetime-local" value={call} disabled={saving} onChange={(e) => setCall(e.target.value)} required style={{ minHeight: 44 }} />
          <Input label="Wrap time (Nepal)" type="datetime-local" value={wrap} disabled={saving} onChange={(e) => setWrap(e.target.value)} required style={{ minHeight: 44 }} />
          <Input label="Daily rate (Rs)" type="number" min="0" step="0.01" value={rate} disabled={saving} onChange={(e) => setRate(e.target.value)} required style={{ minHeight: 44 }} />
          <Input label="Days" type="number" min="1" step="1" value={days} disabled={saving} onChange={(e) => setDays(e.target.value)} required style={{ minHeight: 44 }} />
          <Input label="Assignment notes" value={notes} disabled={saving} onChange={(e) => setNotes(e.target.value)} style={{ minHeight: 44 }} />
        </>}
      </form>}
  </Modal>
}
