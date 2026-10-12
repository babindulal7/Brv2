/**
 * src/components/ui/creation/CreationContextProvider.tsx — Babin Rentals OS
 *
 * CreationContextProvider manages:
 * - Active module state and page contextual records (bookingNo, client, asset)
 * - Single-active-interface state machine (only one creation modal/drawer/wizard open at a time)
 * - Universal action execution and routing
 * - Draft preservation across nested workflows
 */

import { createContext, useContext, useEffect, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CREATION_ACTIONS,
} from './CreationActionRegistry'
import { QuickCreateDialog } from './QuickCreateDialog'
import { CreationDrawer } from './CreationDrawer'
import { CreationWizard } from './CreationWizard'

export interface CreationContextValue {
  activeModule: string
  contextData: Record<string, unknown>
  setActiveModule: (mod: string) => void
  setContextData: Dispatch<SetStateAction<Record<string, unknown>>>
  openCreationAction: (actionId: string, extraContext?: Record<string, unknown>) => void
  closeCreationAction: () => void
  activeActionId: string | null
}

const CreationContext = createContext<CreationContextValue | null>(null)

export function useCreationContext(): CreationContextValue {
  const ctx = useContext(CreationContext)
  if (!ctx) {
    throw new Error('useCreationContext must be used within a CreationContextProvider')
  }
  return ctx
}

export function useOptionalCreationContext(): CreationContextValue | null {
  return useContext(CreationContext)
}

/**
 * Convenient hook for pages to register their active module and contextual data
 * so GlobalAddMenu picks them up automatically.
 */
export function useRegisterCreationContext(
  module: string,
  contextData?: Record<string, unknown>
) {
  const ctx = useOptionalCreationContext()
  useEffect(() => {
    if (ctx) {
      ctx.setActiveModule(module)
      if (contextData) {
        ctx.setContextData(contextData)
      }
    }
  }, [ctx, module, contextData])
}

export function CreationContextProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [activeModule, setActiveModule] = useState('today')
  const [contextData, setContextData] = useState<Record<string, unknown>>({})
  const [activeActionId, setActiveActionId] = useState<string | null>(null)
  const [mergedContext, setMergedContext] = useState<Record<string, unknown>>({})

  const openCreationAction = (actionId: string, extraContext?: Record<string, unknown>) => {
    const act = CREATION_ACTIONS.find((a) => a.id === actionId)
    if (!act) return

    const combined = { ...contextData, ...(extraContext ?? {}) }

    // If action specifies a dedicated route (e.g. /rentals?action=new) and we want route opening:
    if (act.openingMode === 'route' && act.route) {
      navigate(act.route)
      return
    }

    setMergedContext(combined)
    setActiveActionId(actionId)
  }

  const closeCreationAction = () => {
    setActiveActionId(null)
  }

  const activeAction = activeActionId
    ? CREATION_ACTIONS.find((a) => a.id === activeActionId)
    : null

  return (
    <CreationContext.Provider
      value={{
        activeModule,
        contextData,
        setActiveModule,
        setContextData,
        openCreationAction,
        closeCreationAction,
        activeActionId,
      }}
    >
      {children}

      {/* Single-Active Creation Interface State Machine */}
      {activeAction && activeAction.openingMode === 'wizard' && (
        <CreationWizard
          isOpen={true}
          actionId={activeAction.id}
          contextData={mergedContext}
          onClose={closeCreationAction}
          onSuccess={() => closeCreationAction()}
        />
      )}

      {activeAction && activeAction.openingMode === 'drawer' && (
        <CreationDrawer
          isOpen={true}
          actionId={activeAction.id}
          contextData={mergedContext}
          onClose={closeCreationAction}
          onSuccess={() => closeCreationAction()}
        />
      )}

      {activeAction && (activeAction.openingMode === 'dialog' || activeAction.openingMode === 'modal') && (
        <QuickCreateDialog
          isOpen={true}
          actionId={activeAction.id}
          contextData={mergedContext}
          onClose={closeCreationAction}
          onSuccess={() => closeCreationAction()}
        />
      )}
    </CreationContext.Provider>
  )
}
