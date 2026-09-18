import { useOnboarding, OnboardingStep } from './useFirstRun'
import { useToast } from './Toast'
import { Button, Modal } from './Page'

/**
 * Welcome onboarding modal that appears for first-time users.
 * Uses localStorage to track that it has been shown.
 */
function WelcomeOnboarding({ onClose }: { onClose: () => void }) {
  const { firstRun, completeOnboarding } = useOnboarding(onClose)
  const { showSuccessToast } = useToast()

  if (!firstRun) {
    return null
  }

  return (
    <Modal
      title="Welcome to Babin Rentals OS"
      open
      onClose={onClose}
      style={{
        maxWidth: '480px',
        padding: 'var(--sp-lg)',
      }}
    >
      <p style={{ 
        margin: '16px 0', 
        fontSize: 'var(--t-meta)', 
        color: 'var(--text2)', 
        lineHeight: 1.5 
      }}>
        {firstRun ? 'Welcome! This guided tour will help you get started with your first rental.' : ''}
      </p>
      
      {firstRun && (
        <div style={{ 
          margin: '24px 0', 
          display: 'grid', 
          gap: 16 
        }}>
          {['Getting Started', 'First Rental', 'Delivery & Terms', 'You\'re All Set!'].map((title, i) => (
            <div key={title} style={{
              padding: '12px',
              background: 'var(--card2)',
              borderRadius: 'var(--r-card)',
              border: '1px solid var(--border)',
            }}>
              <h4 style={{ 
                margin: '0 0 8px', 
                fontSize: 'var(--t-th)', 
                fontWeight: 700, 
                color: 'var(--text)' 
              }}>{title}</h4>
              <p style={{ 
                margin: 0, 
                fontSize: 'var(--t-meta)', 
                color: 'var(--text2)', 
                lineHeight: 1.5 
              }}>
                {/* Descriptions would come from the onboarding steps */}
                Get started by creating your first rental record.
              </p>
            </div>
          ))}
        </div>
      )}

      {!firstRun && (
        <Button 
          variant="primary" 
          onClick={() => {
            completeOnboarding()
            showSuccessToast('Welcome back! Let\'s continue.')
          }}
        >
          Get Started
        </Button>
      )}

      {!firstRun && (
        <Button 
          variant="secondary" 
          onClick={onClose}
          style={{ marginLeft: '8px' }}
        >
          Skip
        </Button>
      )}
    </Modal>
  )
}

export { WelcomeOnboarding }