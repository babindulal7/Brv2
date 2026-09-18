import { useEffect, useState } from 'react'

// Helper to detect first run and set a flag
export function useFirstRun(): { firstRun: boolean; setFirstRun: (value: boolean) => void } {
  const [firstRun, setFirstRun] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('babin-first-run')
    if (stored === 'true') {
      setFirstRun(false)
    } else {
      // Mark as not first run after this effect
      localStorage.setItem('babin-first-run', 'true')
      setFirstRun(true) // Will be false on next mount
    }
  }, [])

  return { firstRun, setFirstRun }
}

// Onboarding step type
export interface OnboardingStep {
  id: string
  title: string
  description: string
  cta?: string
  onCTA?: () => void
}

// Onboarding hook
export function useOnboarding(onComplete: () => void) {
  const { firstRun } = useFirstRun()
  const [currentStep, setCurrentStep] = useState(1)
  const [steps, setSteps] = useState<OnboardingStep[]>([])

  // Define default onboarding steps
  const defaultSteps: OnboardingStep[] = [
    {
      id: 'step1',
      title: 'Welcome to Babin Rentals OS',
      description: 'Manage equipment rentals, track inventory, and handle crew scheduling all in one place.',
    },
    {
      id: 'step2',
      title: 'Create Your First Rental',
      description: 'Start by adding a client, selecting equipment, and setting the rental dates.',
      cta: 'Start Now',
      onCTA: () => setCurrentStep(3),
    },
    {
      id: 'step3',
      title: 'Set Delivery & Terms',
      description: 'Configure delivery type, pricing, and payment terms for your rental.',
    },
    {
      id: 'step4',
      title: 'You\'re All Set!',
      description: 'Begin renting equipment and managing your inventory. All data is saved to the cloud.',
    },
  ]

  useEffect(() => {
    if (firstRun) {
      setSteps(defaultSteps)
    }
  }, [firstRun])

  const completeOnboarding = () => {
    localStorage.setItem('babin-first-run', 'true')
    setCurrentStep(steps.length + 1)
    onComplete()
  }

  return {
    firstRun,
    currentStep,
    steps,
    completeOnboarding,
    isComplete: currentStep > steps.length,
  }
}