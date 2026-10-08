// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CrewSection, type CrewLine } from '../CrewSection'
import { rupees } from '../../../../lib/money'

vi.mock('../../../../lib/device', () => ({ useViewport: () => 'desktop' }))

const sampleCrew: CrewLine[] = [
  {
    crewId: 'crew-1',
    name: 'Anup Baral',
    role: 'Director of Photography',
    phone: '9841234567',
    dayRatePaisa: rupees(12000),
    overtimePaisa: rupees(0),
    accommodationPaisa: rupees(0),
    mealsPaisa: rupees(0),
  },
]

describe('CrewSection', () => {
  it('renders empty state when crew array is empty', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CrewSection
              open={true}
              onToggle={vi.fn()}
              crew={[]}
              days={2}
              canCrewMoney={true}
              onAddCrew={vi.fn()}
              onRemoveCrew={vi.fn()}
              onClearCrew={vi.fn()}
              onUpdateCrewExtras={vi.fn()}
              crewChargesPaisa={rupees(0)}
              isPhone={false}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).toContain('No crew assigned')
      expect(host.textContent).toContain('Add a crew member to staff this booking.')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('renders assigned crew members and allows expanding overtime/meals/accommodation', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onUpdateCrewExtras = vi.fn()

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CrewSection
              open={true}
              onToggle={vi.fn()}
              crew={sampleCrew}
              days={2}
              canCrewMoney={true}
              onAddCrew={vi.fn()}
              onRemoveCrew={vi.fn()}
              onClearCrew={vi.fn()}
              onUpdateCrewExtras={onUpdateCrewExtras}
              crewChargesPaisa={rupees(24000)}
              isPhone={false}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).toContain('Anup Baral')
      expect(host.textContent).toContain('Director of Photography')
      expect(host.textContent).toContain('Crew Subtotal')

      // Expand extras
      const expandBtn = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Show overtime, meals and accommodation for Anup Baral"]',
      )
      expect(expandBtn).not.toBeNull()
      await act(async () => {
        expandBtn?.click()
      })

      expect(host.textContent).toContain('Overtime (Rs) *')
      expect(host.textContent).toContain('Meals (Rs) *')
      expect(host.textContent).toContain('Accommodation (Rs) *')

      // Change overtime input
      const overtimeInput = host.querySelector<HTMLInputElement>('input[placeholder="0"]')
      expect(overtimeInput).not.toBeNull()

      if (overtimeInput) {
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(overtimeInput, '1500')
          overtimeInput.dispatchEvent(new Event('input', { bubbles: true }))
          overtimeInput.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(onUpdateCrewExtras).toHaveBeenCalledWith('crew-1', 'overtimePaisa', rupees(1500))
      }
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('enforces money blindness when canCrewMoney is false (Law 6)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CrewSection
              open={true}
              onToggle={vi.fn()}
              crew={sampleCrew}
              days={2}
              canCrewMoney={false}
              onAddCrew={vi.fn()}
              onRemoveCrew={vi.fn()}
              onClearCrew={vi.fn()}
              onUpdateCrewExtras={vi.fn()}
              crewChargesPaisa={rupees(0)}
              isPhone={false}
            />
          </MemoryRouter>,
        )
      })

      expect(host.textContent).not.toContain('Day Rate')
      expect(host.textContent).not.toContain('Crew Subtotal')
      expect(host.textContent).toContain('Anup Baral')
      expect(host.textContent).toContain('Director of Photography')
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })

  it('handles removing crew and clearing all crew', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const onRemoveCrew = vi.fn()
    const onClearCrew = vi.fn()

    try {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <CrewSection
              open={true}
              onToggle={vi.fn()}
              crew={sampleCrew}
              days={2}
              canCrewMoney={true}
              onAddCrew={vi.fn()}
              onRemoveCrew={onRemoveCrew}
              onClearCrew={onClearCrew}
              onUpdateCrewExtras={vi.fn()}
              crewChargesPaisa={rupees(24000)}
              isPhone={false}
            />
          </MemoryRouter>,
        )
      })

      const removeBtn = host.querySelector<HTMLButtonElement>('button[aria-label="Remove Anup Baral from this booking"]')
      expect(removeBtn).not.toBeNull()
      await act(async () => {
        removeBtn?.click()
      })
      expect(onRemoveCrew).toHaveBeenCalledWith('crew-1')

      const clearBtn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Clear crew')
      expect(clearBtn).not.toBeNull()
      await act(async () => {
        clearBtn?.click()
      })
      expect(onClearCrew).toHaveBeenCalled()
    } finally {
      await act(async () => root.unmount())
      host.remove()
    }
  })
})
