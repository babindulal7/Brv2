import { Card, Button, Badge, thStyle } from '../../components/ui'
import Icon from '../../components/ui/Icon'
import { PageHeader } from '../../components/ui'

const MOCK_TIMESHEET = [
  { id: '1', date: '28 Jul 2026', user: 'Ramesh (Warehouse)', firstAction: '06:14 AM', lastAction: '14:30 PM', hours: '8.2h', jobs: 24, status: 'derived' },
  { id: '2', date: '28 Jul 2026', user: 'Sita (Warehouse)', firstAction: '14:10 PM', lastAction: '22:45 PM', hours: '8.5h', jobs: 18, status: 'derived' },
  { id: '3', date: '27 Jul 2026', user: 'Ramesh (Warehouse)', firstAction: '06:05 AM', lastAction: '14:15 PM', hours: '8.1h', jobs: 22, status: 'derived' },
  { id: '4', date: '27 Jul 2026', user: 'Hari (Driver)', firstAction: '07:00 AM', lastAction: '16:00 PM', hours: '9.0h', jobs: 4, status: 'manual' }, // Example of a manual correction
]

export default function Timesheet() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-md)' }}>
      <PageHeader
        title="Presence Log & Timesheet"
        description="Derived automatically from first and last system actions. Manual corrections are audited."
        actions={
          <>
            <Button icon="download">Export CSV</Button>
            <Button variant="primary" icon="edit">
              Manual Correction
            </Button>
          </>
        }
      />

      <Card>
        <div style={{ margin: '-20px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--t-ui)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>User</th>
                <th style={thStyle}>First Action</th>
                <th style={thStyle}>Last Action</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Hours Present</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Jobs Completed</th>
                <th style={thStyle}>Source</th>
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
            {MOCK_TIMESHEET.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }} className="figure">{row.date}</td>
                <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>{row.user}</td>
                <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }} className="figure">{row.firstAction}</td>
                <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }} className="figure">{row.lastAction}</td>
                <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 600 }} className="figure">{row.hours}</td>
                <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', textAlign: 'right' }} className="figure">{row.jobs}</td>
                <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                  {row.status === 'manual' ? (
                    <Badge tone="warning" label="Manual" />
                  ) : (
                    <Badge tone="neutral" label="System" />
                  )}
                </td>
                <td style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      padding: 'var(--sp-xs)',
                    }}
                    title="View Audit Log"
                  >
                    <Icon name="calendar_stats" size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  )
}
