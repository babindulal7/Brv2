import { SectionProgress } from './useNewRentalProgress'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

/**
 * Summary of section progress across the New Rental workflow.
 * Shows which sections have been started and completed.
 */
function ProgressSummary({ progress }: { progress: SectionProgress[] }) {
  const total = progress.length
  const visited = progress.filter(p => p.visited).length
  const completed = progress.filter(p => p.completed).length

  return (
    <Card style={{ 
      margin: 'var(--sp-md) 0', 
      border: '1px solid var(--border)', 
      borderRadius: 'var(--r-card)' 
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 'var(--sp-sm)', 
        padding: 'var(--sp-sm)' 
      }}>
        <span style={{ 
          fontSize: 'var(--t-meta)', 
          color: 'var(--text2)' 
        }}>
          {visited} of {total} sections visited
        </span>
        {completed > 0 && (
          <span style={{ 
            fontSize: 'var(--t-meta)', 
            color: 'var(--success-text)' 
          }}>
            {completed} completed
          </span>
        )}
        <Button
          variant="ghost"
          style={{ 
            fontSize: 'var(--t-meta)', 
            color: 'var(--primary)', 
            padding: 0, 
            textDecoration: 'underline' 
          }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Complete all sections
        </Button>
      </div>
      <div style={{ 
        padding: 'var(--sp-sm)', 
        fontSize: 'var(--t-meta)', 
        color: 'var(--muted)' 
      }}>
        {progress.map(p => (
          <span key={p.id} style={{ display: 'block', margin: '2px 0' }}>
            {p.visited ? '✓' : '○'} {p.title}
          </span>
        ))}
      </div>
    </Card>
  )
}

export { ProgressSummary }