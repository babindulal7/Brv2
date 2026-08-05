import { useState } from 'react'
import { Modal, Button, Select } from '../../components/ui'
import Icon from '../../components/ui/Icon'
import { useNavigate } from 'react-router-dom'

interface Job {
  id: string
  task: string
  status: string
  urgent?: boolean
}

export default function HandoverSheet({
  isOpen,
  onClose,
  userName = 'Ramesh',
  userRole = 'Warehouse',
}: {
  isOpen: boolean
  onClose: () => void
  userName?: string | undefined
  userRole?: string | undefined
}) {
  const [note, setNote] = useState('')
  const [recipient, setRecipient] = useState('unassigned')
  const navigate = useNavigate()

  // Mock data as specified in 12 Security/Authentication.md §5
  const openJobs: Job[] = [
    { id: 'BR-1043', task: 'Packing', status: '18/24 done', urgent: true },
    { id: 'BR-1051', task: 'Reset', status: 'staged, not cleared' },
    { id: 'BR-1060', task: 'Handover', status: 'waiting on client' },
  ]

  const handleLogout = () => {
    // Perform actual logout logic here, then redirect
    navigate('/login')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Ending your shift — ${userName}, ${userRole}`}
      footer={
        <>
          <Button variant="secondary" onClick={handleLogout}>
            Skip
          </Button>
          <Button variant="primary" onClick={handleLogout}>
            Hand over & log out
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 8 }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 'var(--t-meta)', color: 'var(--text2)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="box" size={16} /> 14 packed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="return_arrow" size={16} /> 11 returned
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--progress-text)' }}>
            <Icon name="timer" size={16} /> 3 jobs open
          </span>
        </div>

        <div>
          <h4 style={{ margin: '0 0 12px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Open jobs you are leaving:
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {openJobs.map((job) => (
              <div
                key={job.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 100px 1fr',
                  gap: 12,
                  padding: '10px 12px',
                  background: 'var(--card2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-btn)',
                  fontSize: 'var(--t-meta)',
                  alignItems: 'center',
                }}
              >
                <span className="figure" style={{ fontWeight: 600, color: 'var(--link)' }}>
                  {job.id}
                </span>
                <span style={{ color: 'var(--text)' }}>{job.task}</span>
                <span style={{ color: job.urgent ? 'var(--warning)' : 'var(--text2)', display: 'flex', justifyContent: 'flex-end' }}>
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Anything the next shift should know?
          </h4>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional notes for the next shift..."
            style={{
              width: '100%',
              minHeight: 80,
              padding: '10px 12px',
              borderRadius: 'var(--r-btn)',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 'var(--t-base)',
              resize: 'vertical',
            }}
          />
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text)' }}>
            Hand over to <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
          </h4>
          <Select
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            options={[
              { value: 'unassigned', label: 'Unassigned (Any Warehouse Staff)' },
              { value: 'sita', label: 'Sita (Incoming Shift)' },
              { value: 'hari', label: 'Hari (Incoming Shift)' },
            ]}
          />
        </div>
      </div>
    </Modal>
  )
}
